from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from ..database import get_db
from ..models.db import Alert, AlertRule
from .auth import get_current_user, require_admin
from ..models.db import User
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


@router.get("")
async def list_alerts(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Alert).order_by(desc(Alert.fired_at)).limit(100))
    alerts = result.scalars().all()
    return [
        {
            "id": a.id,
            "server_id": a.server_id,
            "title": a.title,
            "message": a.message,
            "severity": a.severity,
            "is_acknowledged": a.is_acknowledged,
            "fired_at": a.fired_at.isoformat(),
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        }
        for a in alerts
    ]


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert:
        alert.is_acknowledged = True
        await db.commit()
    return {"ok": True}


class AlertRuleCreate(BaseModel):
    name: str
    server_id: Optional[str] = None
    group_name: Optional[str] = None
    rule_type: str
    threshold: Optional[float] = None
    duration_minutes: int = 5
    notify_webhook: Optional[str] = None
    notify_email: Optional[str] = None
    cooldown_minutes: int = 30


@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(AlertRule))
    rules = result.scalars().all()
    return [{"id": r.id, "name": r.name, "rule_type": r.rule_type, "threshold": r.threshold, "is_active": r.is_active} for r in rules]


@router.post("/rules")
async def create_rule(body: AlertRuleCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    rule = AlertRule(**body.dict())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id}


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule:
        await db.delete(rule)
        await db.commit()
    return {"ok": True}
