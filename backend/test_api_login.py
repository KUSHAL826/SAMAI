import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models.student import Student
from app.core.security import verify_password, create_access_token

async def test_student_login(email, password):
    async with AsyncSessionLocal() as db:
        clean_email = email.lower().strip()
        result = await db.execute(select(Student).where(Student.email == clean_email))
        student = result.scalar_one_or_none()
        
        if not student:
            print(f"FAILED: Student account {clean_email} not found in database.")
            return
            
        if not verify_password(password, student.password_hash):
            print(f"FAILED: Incorrect password provided for {clean_email}.")
            return
            
        if not student.is_verified:
            print(f"FAILED: Student email is not verified yet. Must verify OTP first.")
            return

        token = create_access_token(subject=str(student.id), role=student.role)
        print("=" * 50)
        print("SUCCESS: Student Authenticated Successfully!")
        print(f"Student ID: {student.id}")
        print(f"Student Name: {student.name}")
        print(f"Student Email: {student.email}")
        print(f"Student Role: {student.role}")
        print(f"Is Verified: {student.is_verified}")
        print(f"JWT Access Token Issued: Bearer {token}")
        print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_student_login("teststudent@gmail.com", "Password@123"))
