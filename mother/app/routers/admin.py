import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Dict
from ..database import get_db
from ..models.db import GlobalSettings, User, AuditLog
from .auth import get_current_user, require_admin

router = APIRouter()


# ─── Settings ─────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(GlobalSettings))
    rows = result.scalars().all()
    # Hide empty values; never expose secret_key
    return {r.key: r.value for r in rows if r.key != "secret_key"}


@router.patch("/settings")
async def update_settings(
    body: Dict[str, str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    FORBIDDEN_KEYS = {"secret_key"}
    for key, value in body.items():
        if key in FORBIDDEN_KEYS:
            continue
        result = await db.execute(select(GlobalSettings).where(GlobalSettings.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(GlobalSettings(key=key, value=value))
    # Audit
    db.add(AuditLog(
        user_id=current_user.id,
        username=current_user.username,
        action="settings_updated",
        detail=str(list(body.keys())),
    ))
    await db.commit()
    return {"ok": True}


# ─── Ollama Connection Test ────────────────────────────────────────────────────

@router.post("/settings/test-ollama")
async def test_ollama(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(GlobalSettings).where(GlobalSettings.key == "ollama_url"))
    row = result.scalar_one_or_none()
    if not row or not row.value:
        raise HTTPException(status_code=400, detail="Ollama URL not configured")
    url = row.value.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"ok": True, "models": models}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─── Users ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "operator"


class UserUpdate(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [{"id": u.id, "username": u.username, "role": u.role, "is_active": u.is_active, "created_at": u.created_at.isoformat()} for u in users]


@router.post("/users")
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from ..auth import hash_password
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(username=body.username, hashed_password=hash_password(body.password), role=body.role)
    db.add(user)
    await db.commit()
    return {"id": user.id}


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from ..auth import hash_password
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role:
        user.role = body.role
    if body.password:
        user.hashed_password = hash_password(body.password)
    if body.is_active is not None:
        user.is_active = body.is_active
    await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        await db.delete(user)
        await db.commit()
    return {"ok": True}


# ─── Audit Log ────────────────────────────────────────────────────────────────

@router.get("/audit")
async def get_audit_log(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from sqlalchemy import desc
    result = await db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(200))
    logs = result.scalars().all()
    return [
        {"id": l.id, "username": l.username, "action": l.action, "detail": l.detail, "ip_address": l.ip_address, "created_at": l.created_at.isoformat()}
        for l in logs
    ]
