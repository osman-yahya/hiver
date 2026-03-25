import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Set
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from redis.asyncio import Redis

from .config import settings
from .database import init_db, AsyncSessionLocal
from .models.db import User, GlobalSettings, ServerStatus, Server, Alert
from .auth import hash_password
from .workers.ai_worker import ai_worker_loop, REDIS_QUEUE_KEY
from .routers import agents, metrics, auth, admin, logs, alerts, servers

logger = logging.getLogger("hiver")

# ─── WebSocket Manager ────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, data: dict):
        dead = set()
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self.active -= dead


ws_manager = ConnectionManager()

# ─── Startup / Shutdown ───────────────────────────────────────────────────────

redis_client: Redis = None
ai_task: asyncio.Task = None
heartbeat_task: asyncio.Task = None
puller_task: asyncio.Task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, ai_task

    await init_db()
    await seed_admin()
    await seed_default_settings()

    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    app.state.redis = redis_client
    app.state.ws_manager = ws_manager

    ai_task = asyncio.create_task(ai_worker_loop(redis_client))
    heartbeat_task = asyncio.create_task(heartbeat_checker_loop())
    puller_task = asyncio.create_task(agent_puller_loop())
    logger.info("Hiver Mother started ✓")

    yield

    ai_task.cancel()
    heartbeat_task.cancel()
    puller_task.cancel()
    await redis_client.aclose()
    logger.info("Hiver Mother stopped")


async def heartbeat_checker_loop():
    from sqlalchemy import select
    while True:
        try:
            await asyncio.sleep(10)
            async with AsyncSessionLocal() as db:
                s_res = await db.execute(select(GlobalSettings).where(
                    GlobalSettings.key.in_(["poll_interval_seconds", "heartbeat_miss_threshold"])
                ))
                s_map = {row.key: int(row.value) for row in s_res.scalars().all()}
                interval = s_map.get("poll_interval_seconds", 10)
                threshold = s_map.get("heartbeat_miss_threshold", 3)
                
                threshold_time = datetime.utcnow() - timedelta(seconds=interval * threshold)
                
                query = select(Server).where(
                    Server.last_seen < threshold_time,
                    Server.status != ServerStatus.offline
                )
                stale_servers = (await db.execute(query)).scalars().all()
                
                for srv in stale_servers:
                    srv.status = ServerStatus.offline
                    
                    db.add(Alert(
                        server_id=srv.id,
                        title="Server Offline",
                        message=f"Server {srv.label} has missed multiple heartbeats and is now offline.",
                        severity="critical",
                        fired_at=datetime.utcnow()
                    ))
                    
                    await ws_manager.broadcast({
                        "type": "server_update",
                        "server": {
                            "id": srv.id,
                            "label": srv.label,
                            "status": "offline",
                            "last_seen": srv.last_seen.isoformat() if srv.last_seen else None
                        }
                    })
                
                if stale_servers:
                    await db.commit()
                    
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Heartbeat loop err: {e}")


async def agent_puller_loop():
    import httpx
    from sqlalchemy import select
    from .routers.metrics import process_metrics_payload, MetricsPayload
    while True:
        try:
            async with AsyncSessionLocal() as db:
                s_res = await db.execute(select(GlobalSettings).where(GlobalSettings.key == "poll_interval_seconds"))
                val = s_res.scalar_one_or_none()
                poll_int = int(val.value) if val else 10
            
            await asyncio.sleep(poll_int)
            
            async with AsyncSessionLocal() as db:
                pull_servers = (await db.execute(
                    select(Server).where(Server.connection_type == "pull", Server.agent_url.is_not(None))
                )).scalars().all()
                
                if not pull_servers:
                    continue
                    
                async with httpx.AsyncClient(timeout=10.0) as client:
                    for srv in pull_servers:
                        try:
                            url = srv.agent_url.rstrip('/') + "/metrics"
                            headers = {"Authorization": f"Bearer {srv.token}"}
                            
                            resp = await client.get(url, headers=headers)
                            resp.raise_for_status()
                            
                            payload = MetricsPayload(**resp.json())
                            await process_metrics_payload(srv, payload, db, redis_client, ws_manager)
                        except Exception as e:
                            logger.warning(f"Failed to pull metrics from {srv.label} ({srv.agent_url}): {e}")
                            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Agent puller loop err: {e}")
            await asyncio.sleep(5)


async def seed_admin():
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == settings.admin_user))
        if not result.scalar_one_or_none():
            db.add(User(
                username=settings.admin_user,
                hashed_password=hash_password(settings.admin_password),
                role="admin",
            ))
            await db.commit()
            logger.info(f"Admin user '{settings.admin_user}' created")


async def seed_default_settings():
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        defaults = {
            "ai_enabled": "false",
            "ollama_url": "",
            "ollama_model": "llama3",
            "ollama_system_prompt": (
                "You are a concise DevOps assistant. Explain the following container error log "
                "in 2-3 sentences. Focus on what went wrong and what to check. Be plain and direct."
            ),
            "ollama_timeout_seconds": "30",
            "ollama_max_log_length": "4000",
            "ollama_concurrent_workers": "2",
            "poll_interval_seconds": "10",
            "heartbeat_miss_threshold": "3",
            "metric_retention_days": "7",
        }
        for key, value in defaults.items():
            result = await db.execute(select(GlobalSettings).where(GlobalSettings.key == key))
            if not result.scalar_one_or_none():
                db.add(GlobalSettings(key=key, value=value))
        await db.commit()

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Hiver Mother", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,    prefix="/api/auth",    tags=["auth"])
app.include_router(agents.router,  prefix="/api/agents",  tags=["agents"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(servers.router, prefix="/api/servers", tags=["servers"])
app.include_router(logs.router,    prefix="/api/logs",    tags=["logs"])
app.include_router(alerts.router,  prefix="/api/alerts",  tags=["alerts"])
app.include_router(admin.router,   prefix="/api/admin",   tags=["admin"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# Serve React SPA
try:
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse("static/index.html")
except Exception:
    pass  # static dir may not exist in dev mode
