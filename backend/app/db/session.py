from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL.strip(),
    echo=False,
    pool_pre_ping=True,
    connect_args={"statement_cache_size": 0},
)


AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """FastAPI dependency -- yields a session per request, closed automatically."""
    async with AsyncSessionLocal() as session:
        yield session
