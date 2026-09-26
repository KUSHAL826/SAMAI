import asyncio
from app.db.session import engine
from app.db.base import Base
import app.db.models  # Ensures AdminUser and all models are registered

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("SUCCESS: 'admins' table and all schema models verified in PostgreSQL database!")

if __name__ == "__main__":
    asyncio.run(main())
