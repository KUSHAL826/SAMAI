from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_size=30,
    max_overflow=50,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)
SyncSessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)


def get_sync_db() -> Session:
    """Use as a context manager inside Celery tasks:
    `with get_sync_db() as db: ...`"""
    return SyncSessionLocal()
