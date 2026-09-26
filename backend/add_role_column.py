import asyncio
from sqlalchemy import text
from app.db.session import engine

async def main():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'student';"))
        await conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;"))
        await conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;"))
        await conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS otp_purpose VARCHAR(50);"))
    print("SUCCESS: Added missing columns to 'students' table in Supabase PostgreSQL!")

if __name__ == "__main__":
    asyncio.run(main())
