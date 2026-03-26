import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import List, Optional
from ..database import get_db
from ..models.db import Server, ServerStatus, MetricSnapshot, ContainerRecord, ErrorLog, GlobalSettings
from .agents import get_server_by_token

logger = logging.getLogger("hiver.metrics")
router = APIRouter()

REDIS_QUEUE_KEY = "hiver:error_log_queue"


class ContainerPayload(BaseModel):
    id: str
    name: str
    image: str
    status: str
    cpu_percent: float
    mem_usage_mb: float
    mem_limit_mb: float
    restart_count: int


class ErrorLogPayload(BaseModel):
    container_id: str
    container_name: str
    line: str
    timestamp: str


class MetricsPayload(BaseModel):
    agent_id: str
    label: str
    timestamp: str
    cpu_percent: float
    mem_total_mb: int
    mem_used_mb: int
    mem_free_mb: int
    disk_total_gb: int
    disk_used_gb: int
    disk_percent: float
    net_bytes_in: int
    net_bytes_out: int
    load_1: float
    load_5: float
    load_15: float
    load_15: float
    uptime_secs: int
    temperature_c: float = 0.0
    containers: List[ContainerPayload] = []
    error_logs: List[ErrorLogPayload] = []


@router.post("")
async def ingest_metrics(body: MetricsPayload, request: Request, db: AsyncSession = Depends(get_db), server: Server = Depends(get_server_by_token)):
    redis = request.app.state.redis
    ws_manager = request.app.state.ws_manager
    
    poll_int = await process_metrics_payload(server, body, db, redis, ws_manager)
    return {"ok": True, "poll_interval_seconds": poll_int}


async def process_metrics_payload(server: Server, body: MetricsPayload, db: AsyncSession, redis, ws_manager):

    # Update server heartbeat
    server.last_seen = datetime.utcnow()
    server.status = ServerStatus.online
    server.missed_heartbeats = 0

    # Save metric snapshot
    snapshot = MetricSnapshot(
        server_id=server.id,
        cpu_percent=body.cpu_percent,
        mem_total_mb=body.mem_total_mb,
        mem_used_mb=body.mem_used_mb,
        disk_total_gb=body.disk_total_gb,
        disk_used_gb=body.disk_used_gb,
        disk_percent=body.disk_percent,
        net_bytes_in=body.net_bytes_in,
        net_bytes_out=body.net_bytes_out,
        load_1=body.load_1,
        load_5=body.load_5,
        load_15=body.load_15,
        uptime_secs=body.uptime_secs,
        temperature_c=body.temperature_c,
    )
    db.add(snapshot)
    
    server.temperature_c = body.temperature_c

    # Update containers (replace all for this server)
    await db.execute(delete(ContainerRecord).where(ContainerRecord.server_id == server.id))
    for c in body.containers:
        db.add(ContainerRecord(
            server_id=server.id,
            container_id=c.id,
            name=c.name,
            image=c.image,
            status=c.status,
            cpu_percent=c.cpu_percent,
            mem_usage_mb=c.mem_usage_mb,
            mem_limit_mb=c.mem_limit_mb,
            restart_count=c.restart_count,
        ))

    # Queue error logs for AI processing
    for el in body.error_logs:
        log_entry = ErrorLog(
            server_id=server.id,
            container_id=el.container_id,
            container_name=el.container_name,
            raw_log=el.line,
            severity="error",
        )
        db.add(log_entry)
        await db.flush()  # get the id
        await redis.rpush(REDIS_QUEUE_KEY, json.dumps({"log_id": log_entry.id}))

    # Fetch dynamic poll interval BEFORE commit
    res = await db.execute(select(GlobalSettings.value).where(GlobalSettings.key == "poll_interval_seconds"))
    val = res.scalar_one_or_none()
    poll_int = int(val) if val else 10

    await db.commit()

    # Push real-time update to UI via WebSocket
    await ws_manager.broadcast({
        "type": "metrics_update",
        "server_id": server.id,
        "label": server.label,
        "cpu_percent": body.cpu_percent,
        "mem_used_mb": body.mem_used_mb,
        "mem_total_mb": body.mem_total_mb,
        "disk_percent": body.disk_percent,
        "temperature_c": body.temperature_c,
        "status": "online",
    })

    logger.info(f"[metrics] recording metrics for {server.label}; setting poll_interval_seconds={poll_int}")
    return poll_int
