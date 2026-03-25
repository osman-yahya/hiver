from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from .models.db import Base
from .config import settings
import os

# Ensure data dir exists for SQLite
db_url = settings.database_url
if db_url.startswith("sqlite:///"):
    db_url = db_url.replace("sqlite:///", "sqlite+aiosqlite:///")

if db_url.startswith("sqlite"):
    os.makedirs("data", exist_ok=True)

engine = create_async_engine(db_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
