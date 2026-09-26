import asyncio
from sqlalchemy import select
from app.db.session import engine, AsyncSessionLocal
from app.db.models.student import Student
from app.core.security import hash_password, verify_password, create_access_token

async def main():
    async with AsyncSessionLocal() as db:
        email = "teststudent@gmail.com"
        password = "Password@123"
        
        result = await db.execute(select(Student).where(Student.email == email))
        student = result.scalar_one_or_none()

        if not student:
            student = Student(
                name="Test Student",
                email=email,
                mobile="9876543210",
                password_hash=hash_password(password),
                is_verified=True,
                role="student"
            )
            db.add(student)
            await db.commit()
            await db.refresh(student)
            print(f"Created verified test student: {email}")
        else:
            student.is_verified = True
            student.password_hash = hash_password(password)
            await db.commit()
            print(f"Updated verified test student: {email}")

        # Verify password check
        valid = verify_password(password, student.password_hash)
        token = create_access_token(subject=str(student.id), role=student.role)
        print(f"Password Valid: {valid}")
        print(f"Issued Student JWT Access Token: {token[:30]}...")

if __name__ == "__main__":
    asyncio.run(main())
