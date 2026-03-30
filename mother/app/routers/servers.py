from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from typing import Optional, List
from pydantic import BaseModel
from ..database import get_db
from ..models.db import Server, MetricSnapshot, ContainerRecord, ErrorLog, Alert
from .auth import get_current_user
from ..models.db import User
from ..models.db import User, ConnectionType
from pydantic import BaseModel, Field
import uuid

router = APIRouter()

class ServerCreate(BaseModel):
    label: str = Field(..., min_length=1)
    group_name: Optional[str] = None
    tags: Optional[str] = ""
    connection_type: str = "push" # push or pull
    agent_url: Optional[str] = None
    token: Optional[str] = None

@router.post("")
async def create_server(body: ServerCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    new_token = body.token.strip() if body.token else str(uuid.uuid4())
    if not new_token:
        new_token = str(uuid.uuid4())
    
    server = Server(
        label=body.label,
        group_name=body.group_name,
        tags=body.tags,
        connection_type=ConnectionType(body.connection_type),
        agent_url=body.agent_url,
        token=new_token
    )
    db.add(server)
    await db.commit()
    return {"ok": True, "id": server.id, "token": server.token}


@router.get("")
async def list_servers(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Server))
    servers = result.scalars().all()
    out = []
    for s in servers:
        # Latest snapshot
        snap_res = await db.execute(
            select(MetricSnapshot)
            .where(MetricSnapshot.server_id == s.id)
            .order_by(MetricSnapshot.recorded_at.desc())
            .limit(1)
        )
        snap = snap_res.scalar_one_or_none()
        # Container count
        cnt_res = await db.execute(
            select(func.count()).select_from(ContainerRecord).where(ContainerRecord.server_id == s.id)
        )
        container_count = cnt_res.scalar()
        out.append({
            "id": s.id,
            "label": s.label,
            "status": s.status,
            "group_name": s.group_name,
            "connection_type": s.connection_type.value if hasattr(s.connection_type, 'value') else s.connection_type,
            "agent_url": s.agent_url,
            "tags": s.tags.split(",") if s.tags else [],
            "last_seen": s.last_seen.isoformat() if s.last_seen else None,
            "container_count": container_count,
            "cpu_percent": snap.cpu_percent if snap else None,
            "mem_used_mb": snap.mem_used_mb if snap else None,
            "mem_total_mb": snap.mem_total_mb if snap else None,
            "disk_percent": snap.disk_percent if snap else None,
            "temperature_c": snap.temperature_c if snap else None,
        })
    return out

class ServerUpdate(BaseModel):
    label: Optional[str] = None
    group_name: Optional[str] = None

@router.patch("/{server_id}")
async def update_server(server_id: str, body: ServerUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if body.label is not None:
        server.label = body.label.strip()
    if body.group_name is not None:
        server.group_name = body.group_name.strip()
        
    await db.commit()
    return {"ok": True, "id": server.id, "label": server.label, "group_name": server.group_name}


@router.get("/{server_id}")
async def get_server(server_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Latest snapshot
    snap_res = await db.execute(
        select(MetricSnapshot)
        .where(MetricSnapshot.server_id == server_id)
        .order_by(MetricSnapshot.recorded_at.desc())
        .limit(1)
    )
    snap = snap_res.scalar_one_or_none()

    # Containers
    conts_res = await db.execute(select(ContainerRecord).where(ContainerRecord.server_id == server_id))
    containers = conts_res.scalars().all()

    return {
        "id": server.id,
        "label": server.label,
        "status": server.status,
        "group_name": server.group_name,
        "connection_type": server.connection_type.value if hasattr(server.connection_type, 'value') else server.connection_type,
        "agent_url": server.agent_url,
        "tags": server.tags.split(",") if server.tags else [],
        "last_seen": server.last_seen.isoformat() if server.last_seen else None,
        "snapshot": {
            "cpu_percent": snap.cpu_percent,
            "mem_total_mb": snap.mem_total_mb,
            "mem_used_mb": snap.mem_used_mb,
            "disk_total_gb": snap.disk_total_gb,
            "disk_used_gb": snap.disk_used_gb,
            "disk_percent": snap.disk_percent,
            "net_bytes_in": snap.net_bytes_in,
            "net_bytes_out": snap.net_bytes_out,
            "load_1": snap.load_1,
            "load_5": snap.load_5,
            "load_15": snap.load_15,
            "uptime_secs": snap.uptime_secs,
        } if snap else None,
        "containers": [
            {
                "container_id": c.container_id,
                "name": c.name,
                "image": c.image,
                "status": c.status,
                "cpu_percent": c.cpu_percent,
                "mem_usage_mb": c.mem_usage_mb,
                "mem_limit_mb": c.mem_limit_mb,
                "restart_count": c.restart_count,
            }
            for c in containers
        ],
    }


@router.get("/{server_id}/history")
async def get_server_history(
    server_id: str,
    hours: int = 1,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from datetime import datetime, timedelta
    since = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(MetricSnapshot)
        .where(MetricSnapshot.server_id == server_id, MetricSnapshot.recorded_at >= since)
        .order_by(MetricSnapshot.recorded_at.asc())
    )
    snaps = result.scalars().all()
    return [
        {
            "t": s.recorded_at.isoformat(),
            "cpu": s.cpu_percent,
            "mem": round(s.mem_used_mb / s.mem_total_mb * 100, 1) if s.mem_total_mb else 0,
            "disk": s.disk_percent,
        }
        for s in snaps
    ]


@router.delete("/{server_id}")
async def delete_server(server_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    # Cascade-delete all child records first to avoid FK constraint errors
    await db.execute(sa_delete(Alert).where(Alert.server_id == server_id))
    await db.execute(sa_delete(ErrorLog).where(ErrorLog.server_id == server_id))
    await db.execute(sa_delete(ContainerRecord).where(ContainerRecord.server_id == server_id))
    await db.execute(sa_delete(MetricSnapshot).where(MetricSnapshot.server_id == server_id))
    await db.delete(server)
    await db.commit()
    return {"ok": True}
