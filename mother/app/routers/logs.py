from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional
from ..database import get_db
from ..models.db import ErrorLog, Server
from .auth import get_current_user
from ..models.db import User

router = APIRouter()


@router.get("")
async def list_logs(
    server_id: Optional[str] = Query(None),
    container_name: Optional[str] = Query(None),
    ai_only: bool = Query(False),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(ErrorLog).order_by(desc(ErrorLog.recorded_at)).limit(limit).offset(offset)
    if server_id:
        q = q.where(ErrorLog.server_id == server_id)
    if container_name:
        q = q.where(ErrorLog.container_name == container_name)
    if ai_only:
        q = q.where(ErrorLog.ai_explanation.isnot(None))
    result = await db.execute(q)
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "server_id": l.server_id,
            "container_id": l.container_id,
            "container_name": l.container_name,
            "raw_log": l.raw_log,
            "ai_explanation": l.ai_explanation,
            "ai_processed": l.ai_processed,
            "severity": l.severity,
            "recorded_at": l.recorded_at.isoformat(),
        }
        for l in logs
    ]
