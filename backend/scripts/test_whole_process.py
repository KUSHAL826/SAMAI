import asyncio
import os
import sys
import uuid

# Reconfigure stdout to UTF-8 for Windows console support
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.db.session import AsyncSessionLocal
from app.db.models.student import Student
from app.db.models.document import DocumentChunk
from app.db.models.question import QuestionBank, Difficulty, QuestionType


async def run_end_to_end_test():
    print("=" * 70)
    print("[E2E TEST] STARTING END-TO-END INTEGRATION TEST FOR SAMAI PLATFORM")
    print("=" * 70)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # STEP 1: Health & Root Status
        print("\n[STEP 1] Testing API Health & System Root...")
        r = await client.get("/health")
        assert r.status_code == 200, f"Health check failed: {r.text}"
        print(f"  SUCCESS: Health Check Passed: {r.json()}")

        # STEP 2: Knowledge Base Curriculum Options
        print("\n[STEP 2] Testing Knowledge Base Options (Public/Student Access)...")
        r = await client.get("/api/v1/questions/knowledge-base-options")
        assert r.status_code == 200, f"Knowledge Base options failed: {r.text}"
        kb_data = r.json()
        exams = kb_data.get("exams", [])
        print(f"  SUCCESS: Fetched {len(exams)} Target Exam(s) from Knowledge Base.")
        for ex in exams[:3]:
            print(f"    - [{ex.get('code')}] {ex.get('name')}: {len(ex.get('subjects', []))} Subjects, {ex.get('document_count', 0)} Docs")

        assert len(exams) > 0, "No target exams returned from Knowledge Base!"
        target_exam_id = exams[0]["id"]
        target_exam_code = exams[0]["code"]

        # STEP 3: Student Registration & Login Flow
        print("\n[STEP 3] Testing Student Account Registration & Login...")
        test_email = f"e2estudent_{uuid.uuid4().hex[:6]}@example.com"
        reg_payload = {
            "name": "E2E Test Student",
            "email": test_email,
            "password": "TestPassword@123",
            "confirm_password": "TestPassword@123",
        }
        r = await client.post("/api/v1/auth/register", json=reg_payload)
        assert r.status_code in [200, 201], f"Student registration failed: {r.text}"
        print(f"  SUCCESS: Registered student account: {test_email}")

        # Auto-verify student account in DB for E2E testing
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Student).where(Student.email == test_email.lower()))
            st = res.scalars().first()
            assert st is not None, f"Student {test_email} not found in DB!"
            st.is_verified = True
            await db.commit()
            student_id = str(st.id)

        # Login student
        login_payload = {"email": test_email.lower(), "password": "TestPassword@123"}
        r = await client.post("/api/v1/auth/login", json=login_payload)
        assert r.status_code == 200, f"Student login failed: {r.text}"
        auth_data = r.json()
        student_token = auth_data["access_token"]
        student_headers = {"Authorization": f"Bearer {student_token}"}
        print(f"  SUCCESS: Student authenticated successfully. Token: {student_token[:20]}...")

        # STEP 4: Admin Authentication & Curriculum Management
        print("\n[STEP 4] Testing Admin Login & Curriculum Management...")
        admin_login_payload = {"identifier": "samaiadmin@123", "password": ""}
        r = await client.post("/api/v1/auth/admin/login", json=admin_login_payload)
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        admin_token = r.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print(f"  SUCCESS: Admin authenticated successfully.")

        # Admin: Add New Target Exam (e.g. GATE)
        gate_code = f"GATE_{uuid.uuid4().hex[:4].upper()}"
        r = await client.post(
            "/api/v1/admin/exam-types",
            json={"code": gate_code, "name": "GATE Engineering Entrance Test"},
            headers=admin_headers,
        )
        assert r.status_code == 201, f"Admin create exam failed: {r.text}"
        new_exam = r.json()
        print(f"  SUCCESS: Admin created new Target Exam: [{new_exam['code']}] {new_exam['name']}")

        # Admin: Add Subject
        r = await client.post(
            "/api/v1/admin/subjects",
            json={"exam_type_id": new_exam["id"], "name": "Computer Science & AI"},
            headers=admin_headers,
        )
        assert r.status_code in [200, 201], f"Admin create subject failed: {r.text}"
        new_subj = r.json()
        print(f"  SUCCESS: Admin added Subject: {new_subj['name']}")

        # Admin: Add Chapter
        r = await client.post(
            "/api/v1/admin/chapters",
            json={"subject_id": new_subj["id"], "name": "Data Structures & Algorithms"},
            headers=admin_headers,
        )
        assert r.status_code == 201, f"Admin create chapter failed: {r.text}"
        new_chap = r.json()
        print(f"  SUCCESS: Admin added Chapter: {new_chap['name']}")

        # Admin: Add Topic
        r = await client.post(
            "/api/v1/admin/topics",
            json={"chapter_id": new_chap["id"], "name": "Graph Traversal & Binary Trees"},
            headers=admin_headers,
        )
        assert r.status_code == 201, f"Admin create topic failed: {r.text}"
        new_topic = r.json()
        print(f"  SUCCESS: Admin added Topic: {new_topic['name']}")

        # Admin: Save Custom Exam Pattern
        r = await client.post(
            "/api/v1/admin/patterns",
            json={
                "exam_type_id": new_exam["id"],
                "name": "GATE CS 2026 Official Pattern",
                "duration_minutes": 180,
                "total_questions": 65,
                "total_marks": 100,
                "positive_marks": 2.0,
                "negative_marks": -0.66,
                "questions_per_subject": {"Computer Science & AI": 65},
            },
            headers=admin_headers,
        )
        assert r.status_code == 201, f"Admin save pattern failed: {r.text}"
        print(f"  SUCCESS: Admin saved custom pattern: GATE CS 2026 (+2.0 / -0.66 marking)")

        # Seed grounded question bank entries for testing mock generation
        async with AsyncSessionLocal() as db:
            sample_q1 = QuestionBank(
                id=uuid.uuid4(),
                exam_type_id=uuid.UUID(str(target_exam_id)),
                question_text="Which organelle is known as the powerhouse of the cell?",
                options={"A": "Nucleus", "B": "Mitochondria", "C": "Ribosome", "D": "Golgi Apparatus"},
                correct_answer="B",
                explanation="Mitochondria generate most of the chemical energy needed to power the cell's biochemical reactions.",
                difficulty=Difficulty.EASY,
                question_type=QuestionType.MCQ_SINGLE,
                is_active=True,
            )
            sample_q2 = QuestionBank(
                id=uuid.uuid4(),
                exam_type_id=uuid.UUID(str(target_exam_id)),
                question_text="What is Newton's second law of motion equation?",
                options={"A": "F = ma", "B": "E = mc^2", "C": "V = IR", "D": "P = IV"},
                correct_answer="A",
                explanation="Newton's second law states that Force equals mass times acceleration (F = ma).",
                difficulty=Difficulty.MODERATE,
                question_type=QuestionType.MCQ_SINGLE,
                is_active=True,
            )
            db.add_all([sample_q1, sample_q2])
            await db.commit()

        # STEP 5: Test Mock Test Generation
        print("\n[STEP 5] Testing RAG Mock Test Generator...")
        mock_payload = {
            "exam_type_id": target_exam_id,
            "question_count": 2,
            "mode": "topic",
            "difficulty": "mixed",
        }
        r = await client.post("/api/v1/questions/mock-test", json=mock_payload, headers=student_headers)
        assert r.status_code == 200, f"Mock test generation failed: {r.text}"
        test_data = r.json()
        questions = test_data.get("questions", [])
        print(f"  SUCCESS: Generated mock test session with {len(questions)} question(s).")
        assert len(questions) > 0, "No questions returned in mock test!"
        first_q = questions[0]
        print(f"    Sample Question: '{first_q['question_text'][:60]}...'")
        print(f"    Option Keys: {list(first_q.get('options', {}).keys())} | Answer: {first_q.get('correct_answer')}")

        # STEP 6: Test CBT Test Submission & Scorecard Evaluation
        print("\n[STEP 6] Testing Test Submission & CBT Scorecard Evaluation...")
        user_answers = {}
        for q in questions:
            user_answers[q["id"]] = q.get("correct_answer", "A")

        submit_payload = {
            "exam_type_id": target_exam_id,
            "test_title": f"{target_exam_code} Practice Test 1",
            "time_taken_seconds": 120,
            "user_answers": user_answers,
            "questions": questions,
        }
        r = await client.post("/api/v1/questions/submit-test", json=submit_payload, headers=student_headers)
        assert r.status_code == 200, f"Test submission failed: {r.text}"
        result_data = r.json()
        print(f"  SUCCESS: Scorecard Evaluated Successfully:")
        print(f"    Score: {result_data['score']} / {result_data['max_score']} ({result_data['percentage']}%)")
        print(f"    Correct: {result_data['correct_count']} | Incorrect: {result_data['incorrect_count']} | Accuracy: {result_data['accuracy']}%")

        # STEP 7: Test Exam-Filtered Student Analytics
        print("\n[STEP 7] Testing Student Analytics (Overall & Exam-Filtered)...")
        # Overall Analytics
        r = await client.get("/api/v1/student/analytics", headers=student_headers)
        assert r.status_code == 200, f"Overall analytics failed: {r.text}"
        analytics_all = r.json()
        print(f"  SUCCESS: Overall Analytics: {analytics_all['total_tests']} Test(s) | Readiness: {analytics_all['readiness_index']}/100 ({analytics_all['readiness_label']})")

        # Exam-Filtered Analytics
        r = await client.get(f"/api/v1/student/analytics?exam_type_id={target_exam_id}", headers=student_headers)
        assert r.status_code == 200, f"Exam-filtered analytics failed: {r.text}"
        analytics_filtered = r.json()
        print(f"  SUCCESS: [{target_exam_code}] Filtered Analytics: {analytics_filtered['total_tests']} Test(s) | Avg Score: {analytics_filtered['average_score']}")

        # STEP 8: Test Printable Mock Paper & Solutions Package Generator
        print("\n[STEP 8] Testing Teacher/Student Printable Mock Paper Generator...")
        mock_paper_req = {
            "title": f"Official {target_exam_code} National Mock Paper 2026",
            "question_count": 2,
            "exam_type_id": target_exam_id,
            "exam_code": target_exam_code,
            "difficulty": "mixed",
        }
        r = await client.post("/api/v1/questions/download-mock-paper", json=mock_paper_req, headers=student_headers)
        assert r.status_code == 200, f"Download mock paper failed: {r.text}"
        paper_package = r.json()
        print(f"  SUCCESS: Printable Package Generated:")
        print(f"    Question Paper Title: {paper_package['test_paper']['title']}")
        print(f"    Answer Key Paper Title: {paper_package['key_answer_paper']['title']}")
        print(f"    Total Rendered Questions: {paper_package['total_questions']}")

    print("\n" + "=" * 70)
    print("ALL END-TO-END SYSTEM TESTS PASSED SUCCESSFULLY (100% HEALTHY)")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_end_to_end_test())
