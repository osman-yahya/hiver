import asyncio
import json
import logging
import httpx
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from ..database import AsyncSessionLocal
from ..models.db import ErrorLog, GlobalSettings

logger = logging.getLogger("hiver.ai_worker")

REDIS_QUEUE_KEY = "hiver:error_log_queue"


async def get_setting(db: AsyncSession, key: str, default=None):
    result = await db.execute(select(GlobalSettings).where(GlobalSettings.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else default


async def process_log(redis: Redis, log_id: int):
    async with AsyncSessionLocal() as db:
        # Load settings
        ai_enabled = (await get_setting(db, "ai_enabled", "false")).lower() == "true"
        ollama_url = await get_setting(db, "ollama_url", "")
        ollama_model = await get_setting(db, "ollama_model", "llama3")
        system_prompt = await get_setting(db, "ollama_system_prompt",
            "You are a concise DevOps assistant. Explain the following container error log in 2-3 sentences. "
            "Focus on what went wrong and what to check. Be plain and direct.")
        timeout = float(await get_setting(db, "ollama_timeout_seconds", "30"))
        max_log_len = int(await get_setting(db, "ollama_max_log_length", "4000"))

        result = await db.execute(select(ErrorLog).where(ErrorLog.id == log_id))
        log_entry = result.scalar_one_or_none()
        if not log_entry:
            return

        if ai_enabled and ollama_url:
            truncated = log_entry.raw_log[:max_log_len]
            prompt = f"{system_prompt}\n\nError log:\n{truncated}"
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{ollama_url.rstrip('/')}/api/generate",
                        json={"model": ollama_model, "prompt": prompt, "stream": False}
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    explanation = data.get("response", "").strip()
                    log_entry.ai_explanation = explanation
                    logger.info(f"AI processed log {log_id}")
            except Exception as e:
                logger.warning(f"Ollama failed for log {log_id}: {e} — falling back to raw log")
                log_entry.ai_explanation = None

        log_entry.ai_processed = True
        await db.commit()


async def ai_worker_loop(redis: Redis):
    logger.info("AI worker started")
    while True:
        try:
            item = await redis.blpop(REDIS_QUEUE_KEY, timeout=5)
            if item:
                _, raw = item
                payload = json.loads(raw)
                log_id = payload.get("log_id")
                if log_id:
                    await process_log(redis, log_id)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"AI worker error: {e}")
            await asyncio.sleep(2)
