import asyncio
import sys
import os

# Add parent directory to sys.path so app imports work when run as standalone script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models.student import Student
from app.core.security import hash_password


async def seed():
    async with AsyncSessionLocal() as db:
        emails = ["kushalyngowda@gmail.com", "kushalyngowda136@gmail.com"]
        for email in emails:
            clean_email = email.lower().strip()
            res = await db.execute(select(Student).where(Student.email == clean_email))
            student = res.scalar_one_or_none()
            pass_hash = hash_password("samai123")
            if student:
                student.password_hash = pass_hash
                student.is_verified = True
                print(f"[SUCCESS] Updated student account: {clean_email}")
            else:
                new_student = Student(
                    name="Kushal Gowda",
                    email=clean_email,
                    mobile="9900000000",
                    password_hash=pass_hash,
                    is_verified=True,
                    role="student",
                )
                db.add(new_student)
                print(f"[SUCCESS] Created verified student account: {clean_email}")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
