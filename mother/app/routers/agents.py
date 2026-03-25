import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from ..database import get_db
from ..models.db import Server, ServerStatus

router = APIRouter()


class RegisterRequest(BaseModel):
    label: str


class RegisterResponse(BaseModel):
    agent_id: str
    token: str


@router.post("/register", response_model=RegisterResponse)
async def register_agent(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.label == body.label))
    server = result.scalar_one_or_none()
    if server:
        # Re-registration: reuse existing record, refresh token
        server.token = secrets.token_urlsafe(32)
        server.status = ServerStatus.unknown
        await db.commit()
        return RegisterResponse(agent_id=server.id, token=server.token)

    server = Server(label=body.label, token=secrets.token_urlsafe(32))
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return RegisterResponse(agent_id=server.id, token=server.token)


async def get_server_by_token(request: Request, db: AsyncSession = Depends(get_db)) -> Server:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing agent token")
    token = auth[7:]
    result = await db.execute(select(Server).where(Server.token == token))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=401, detail="Unknown agent token")
    return server
