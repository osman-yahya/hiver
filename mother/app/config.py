import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "changeme"
    admin_user: str = "admin"
    admin_password: str = "changeme"
    database_url: str = "sqlite+aiosqlite:///./data/hiver.db"
    redis_url: str = "redis://localhost:6379/0"
    host: str = "0.0.0.0"
    port: int = 8000
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    class Config:
        env_prefix = "HIVER_"
        env_file = ".env"


settings = Settings()
