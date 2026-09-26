import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models.student import Student
from app.core.security import hash_password

async def seed():
    async with AsyncSessionLocal() as db:
        emails = ["kushalyngowda@gmail.com", "kushalyngowda136@gmail.com"]
        for email in emails:
            res = await db.execute(select(Student).where(Student.email == email))
            student = res.scalar_one_or_none()
            pass_hash = hash_password("samai123")
            if student:
                student.password_hash = pass_hash
                student.is_verified = True
                print(f"[SUCCESS] Updated student account: {email}")
            else:
                new_student = Student(
                    name="Kushal Gowda",
                    email=email,
                    mobile="9900000000",
                    password_hash=pass_hash,
                    is_verified=True,
                    role="student",
                )
                db.add(new_student)
                print(f"[SUCCESS] Created verified student account: {email}")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(seed())
