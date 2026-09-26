import asyncio
import sys
import os

# Add parent directory to sys.path so app imports work when run as standalone script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from app.db.base import Base
import app.db.models  # Ensures all schema models are registered


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("SUCCESS: Database schema and all tables created and verified successfully!")


if __name__ == "__main__":
    asyncio.run(main())
