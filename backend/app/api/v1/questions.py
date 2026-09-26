"""
Student-facing entry point into the RAG pipeline.

Caching (spec section 48): if question_bank already has enough validated,
active questions for the requested exam/topic/difficulty, we serve those
directly instead of spending a Gemini call regenerating near-identical
content. Generation is only triggered for the shortfall.
"""
import random
import uuid

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student, get_optional_student
from app.db.models.attempt import AttemptStatus, ExamAttempt, ExamMode
from app.db.models.curriculum import Topic
from app.db.models.document import DocumentChunk
from app.db.models.job import AIGenerationJob, JobStatus
from app.db.models.question import QuestionBank
from app.db.models.result import ExamResult
from app.db.models.student import Student
from app.db.session import get_db

from app.schemas.question import (
    GenerationJobOut,
    GenerationJobStatusOut,
    GenerationRequest,
    QuestionOut,
)
from app.workers.generation_tasks import generate_questions_task

router = APIRouter(prefix="/api/v1/questions", tags=["questions"])


@router.post("/generate", response_model=GenerationJobOut, status_code=status.HTTP_202_ACCEPTED)
async def request_questions(
    payload: GenerationRequest,
    current_student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    topic = await db.get(Topic, payload.topic_id)
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found.")

    # --- Guard: syllabus must be configured before anything is generated (spec section 13) ---
    has_content = await db.execute(
        select(DocumentChunk.id).where(DocumentChunk.topic_id == payload.topic_id).limit(1)
    )
    if not has_content.scalar_one_or_none():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The syllabus/content for this topic has not yet been configured by the administrator.",
        )

    # --- Cache check: do we already have enough validated questions? ---
    difficulty_filter = [] if payload.difficulty == "mixed" else [QuestionBank.difficulty == payload.difficulty]
    count_query = select(func.count(QuestionBank.id)).where(
        QuestionBank.topic_id == payload.topic_id,
        QuestionBank.is_active.is_(True),
        *difficulty_filter,
    )
    existing_count = (await db.execute(count_query)).scalar_one()

    if existing_count >= payload.count:
        return GenerationJobOut(
            job_id=uuid.uuid4(),  # no real job was created
            status="cached",
            message=f"{existing_count} matching questions already available -- no generation needed.",
            cached=True,
        )

    shortfall = payload.count - existing_count

    job = AIGenerationJob(
        student_id=current_student.id,
        request_params={
            "exam_type_id": str(payload.exam_type_id),
            "subject_id": str(payload.subject_id),
            "chapter_id": str(payload.chapter_id),
            "topic_id": str(payload.topic_id),
            "difficulty": payload.difficulty,
            "count": shortfall,
        },
        status=JobStatus.QUEUED,
        questions_requested=shortfall,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    generate_questions_task.delay(str(job.id))

    return GenerationJobOut(
        job_id=job.id,
        status="queued",
        message=f"Generating {shortfall} new question(s) in the background.",
        cached=False,
    )


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobStatusOut)
async def get_generation_job_status(
    job_id: uuid.UUID,
    current_student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(AIGenerationJob, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Generation job not found.")

    return GenerationJobStatusOut(
        job_id=job.id,
        status=job.status.value,
        questions_requested=job.questions_requested,
        questions_generated=job.questions_generated,
        questions_validated=job.questions_validated,
        error_message=job.error_message,
    )


@router.get("", response_model=list[QuestionOut])
async def get_questions(
    topic_id: uuid.UUID,
    difficulty: str | None = None,
    count: int = 10,
    current_student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    """Pulls up to `count` active, validated questions for an exam
    (used once generation/caching has ensured enough exist)."""
    query = select(QuestionBank).where(QuestionBank.topic_id == topic_id, QuestionBank.is_active.is_(True))
    if difficulty and difficulty != "mixed":
        query = query.where(QuestionBank.difficulty == difficulty)

    result = await db.execute(query)
    all_questions = result.scalars().all()
    random.shuffle(all_questions)
    return all_questions[:count]


@router.get("/knowledge-base-options")
async def get_knowledge_base_options(db: AsyncSession = Depends(get_db)):
    """
    Returns exams, subjects, chapters, topics, and document metadata
    uploaded by admins in the knowledge base.
    """
    from app.db.models.curriculum import ExamType, Subject, Chapter, Topic
    from app.db.models.document import Document

    exam_res = await db.execute(select(ExamType).order_by(ExamType.name))
    exams = exam_res.scalars().all()

    out_exams = []
    for ex in exams:
        doc_cnt_res = await db.execute(
            select(func.count(Document.id)).where(Document.exam_type_id == ex.id)
        )
        doc_count = doc_cnt_res.scalar_one()

        subj_res = await db.execute(
            select(Subject).where(Subject.exam_type_id == ex.id).order_by(Subject.name)
        )
        subjects = subj_res.scalars().all()

        out_subjects = []
        for sb in subjects:
            chap_res = await db.execute(
                select(Chapter).where(Chapter.subject_id == sb.id).order_by(Chapter.order_index, Chapter.name)
            )
            chapters = chap_res.scalars().all()

            out_chapters = []
            for ch in chapters:
                top_res = await db.execute(
                    select(Topic).where(Topic.chapter_id == ch.id).order_by(Topic.order_index, Topic.name)
                )
                topics = top_res.scalars().all()
                out_chapters.append({
                    "id": str(ch.id),
                    "name": ch.name,
                    "topics": [{"id": str(tp.id), "name": tp.name} for tp in topics],
                })

            out_subjects.append({
                "id": str(sb.id),
                "name": sb.name,
                "chapters": out_chapters,
            })

        out_exams.append({
            "id": str(ex.id),
            "code": ex.code,
            "name": ex.name,
            "document_count": doc_count,
            "subjects": out_subjects,
        })

    return {"exams": out_exams}


@router.post("/mock-test")
async def create_mock_test(
    payload: GenerationRequest | dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Dynamic Test Generator grounded ONLY in Admin Uploaded Textbooks & PYQs:
    - Filters by Exam, Subject, Topic(s), and Question Level
    - Performs RAG retrieval over uploaded DocumentChunks
    """
    import asyncio
    from app.db.models.curriculum import ExamType, Subject, Topic
    from app.db.models.document import DocumentChunk
    from app.db.models.question import Difficulty, QuestionType
    from app.rag.generator import generate_questions
    from app.rag.prompts import build_generation_prompt

    data = payload if isinstance(payload, dict) else payload.model_dump()
    mode = data.get("mode", "topic")
    count = int(data.get("question_count") or data.get("count") or 15)
    exam_type_id = data.get("exam_type_id")
    subject_ids = data.get("subject_ids", [])
    topic_ids = data.get("topic_ids", [])
    topic_name = data.get("topic_name")
    difficulty = data.get("difficulty", "mixed")

    if data.get("topic_id"):
        topic_ids.append(data["topic_id"])

    # If topic_name passed without IDs, search Topic table
    if topic_name and not topic_ids:
        from sqlalchemy import func
        t_res = await db.execute(select(Topic).where(func.lower(Topic.name).like(f"%{topic_name.strip().lower()}%")))
        matching_topics = t_res.scalars().all()
        if matching_topics:
            topic_ids.extend([str(t.id) for t in matching_topics])

    questions_out = []

    # 1. Fetch existing active QuestionBank items matching filters
    query = select(QuestionBank).where(QuestionBank.is_active.is_(True))

    if exam_type_id and str(exam_type_id) != "all":
        try:
            query = query.where(QuestionBank.exam_type_id == uuid.UUID(str(exam_type_id)))
        except ValueError:
            pass

    if topic_ids and len(topic_ids) > 0:
        topic_uuids = [uuid.UUID(str(t)) for t in topic_ids if t]
        if topic_uuids:
            query = query.where(QuestionBank.topic_id.in_(topic_uuids))
    elif subject_ids and len(subject_ids) > 0:
        subj_uuids = [uuid.UUID(str(s)) for s in subject_ids if s]
        if subj_uuids:
            query = query.where(QuestionBank.subject_id.in_(subj_uuids))

    if difficulty and difficulty != "mixed":
        try:
            diff_enum = Difficulty(difficulty.lower())
            query = query.where(QuestionBank.difficulty == diff_enum)
        except ValueError:
            pass

    result = await db.execute(query)
    bank_questions = result.scalars().all()

    for q in bank_questions:
        questions_out.append({
            "id": str(q.id),
            "question_text": q.question_text,
            "options": q.options,
            "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty),
            "topic_id": str(q.topic_id) if q.topic_id else None,
            "subject_id": str(q.subject_id) if q.subject_id else None,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
        })

    needed = count - len(questions_out)

    # 2. RAG Extraction from Admin Uploaded Textbooks & PYQs
    if needed > 0:
        chunk_query = select(DocumentChunk.content)
        if exam_type_id and str(exam_type_id) != "all":
            try:
                chunk_query = chunk_query.where(DocumentChunk.exam_type_id == uuid.UUID(str(exam_type_id)))
            except ValueError:
                pass

        if topic_ids and len(topic_ids) > 0:
            topic_uuids = [uuid.UUID(str(t)) for t in topic_ids if t]
            if topic_uuids:
                chunk_query = chunk_query.where(DocumentChunk.topic_id.in_(topic_uuids))

        chunk_res = await db.execute(chunk_query.limit(10))
        chunks_text = [row[0] for row in chunk_res.all()]

        if not chunks_text and exam_type_id:
            fallback_res = await db.execute(select(DocumentChunk.content).limit(10))
            chunks_text = [row[0] for row in fallback_res.all()]

        if chunks_text:
            prompt = build_generation_prompt(
                exam="Competitive Examination",
                subject="Core Syllabus",
                chapter="Selected Chapters",
                topic=topic_name or "Syllabus Topics",
                difficulty=difficulty if difficulty != "mixed" else "moderate",
                retrieved_chunks=chunks_text,
                sample_questions=[],
            )
            try:
                llm_needed = min(needed, 15)
                raw_generated = await asyncio.to_thread(generate_questions, prompt, llm_needed)
                for raw in raw_generated:
                    q_id = str(uuid.uuid4())
                    diff_val = raw.difficulty.lower() if hasattr(raw, "difficulty") else (difficulty if difficulty != "mixed" else "moderate")
                    questions_out.append({
                        "id": q_id,
                        "question_text": raw.question,
                        "options": raw.options,
                        "difficulty": diff_val,
                        "topic_id": str(topic_ids[0]) if topic_ids else None,
                        "subject_id": str(subject_ids[0]) if subject_ids else None,
                        "correct_answer": raw.correct_answer,
                        "explanation": raw.explanation,
                    })

                    try:
                        try:
                            diff_e = Difficulty(diff_val)
                        except ValueError:
                            diff_e = Difficulty.MODERATE

                        qb_row = QuestionBank(
                            id=uuid.UUID(q_id),
                            exam_type_id=uuid.UUID(str(exam_type_id)) if exam_type_id and str(exam_type_id) != "all" else None,
                            question_text=raw.question,
                            options=raw.options,
                            correct_answer=raw.correct_answer,
                            explanation=raw.explanation,
                            difficulty=diff_e,
                            question_type=QuestionType.MCQ_SINGLE,
                            is_active=True,
                        )
                        db.add(qb_row)
                    except Exception as cache_err:
                        print(f"[QUESTION CACHE NOTICE] {cache_err}")
                await db.commit()
            except Exception as gen_err:
                print(f"[LLM RAG GENERATION NOTICE] {gen_err}")

    if len(questions_out) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No questions could be generated from uploaded content. Please upload textbooks, study materials, or PYQs for this topic/exam in the Admin Knowledge Base first.",
        )

    random.shuffle(questions_out)
    selected_questions = questions_out[:count]

    return {
        "mode": mode,
        "total_questions": len(selected_questions),
        "questions": selected_questions,
    }


@router.post("/submit-test")
async def submit_test(
    payload: dict,
    current_student: Student | None = Depends(get_optional_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Evaluates test attempt with +4 / -1 NEET/KCET/JEE marking scheme,
    persists student attempt to DB for performance tracking, and returns analytics.
    """
    user_answers = payload.get("user_answers", {})
    questions = payload.get("questions", [])
    time_taken = payload.get("time_taken_seconds", 0)

    correct_count = 0
    incorrect_count = 0
    unattempted_count = 0
    score = 0.0
    max_score = len(questions) * 4.0

    solutions = []

    for q in questions:
        q_id = str(q.get("id"))
        user_ans = user_answers.get(q_id)
        correct_ans = q.get("correct_answer", "A")

        is_correct = False
        is_unattempted = user_ans is None or user_ans == ""

        if is_unattempted:
            unattempted_count += 1
            delta = 0.0
        elif user_ans == correct_ans:
            correct_count += 1
            delta = 4.0
            is_correct = True
        else:
            incorrect_count += 1
            delta = -1.0

        score += delta

        solutions.append({
            "id": q_id,
            "question_text": q.get("question_text"),
            "options": q.get("options", {}),
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct,
            "is_unattempted": is_unattempted,
            "explanation": q.get("explanation", "Grounded answer explanation."),
        })

    percentage = round((score / max_score * 100), 2) if max_score > 0 else 0.0
    total_attempted = correct_count + incorrect_count
    accuracy = round((correct_count / total_attempted * 100), 2) if total_attempted > 0 else 0.0

    # Save to PostgreSQL DB if student is authenticated
    if current_student:
        try:
            # Default exam_type UUID if not passed
            exam_type_id = payload.get("exam_type_id")
            if not exam_type_id or not isinstance(exam_type_id, uuid.UUID):
                dummy_uuid = uuid.uuid4()
            else:
                dummy_uuid = exam_type_id

            attempt = ExamAttempt(
                student_id=current_student.id,
                exam_type_id=dummy_uuid,
                mode=ExamMode.FULL_LENGTH if payload.get("mode") == "full_length" else ExamMode.TOPIC_WISE,
                duration_minutes=max(1, round(time_taken / 60)),
                started_at=datetime.now(timezone.utc),
                submitted_at=datetime.now(timezone.utc),
                status=AttemptStatus.SUBMITTED,
                config_snapshot={"title": payload.get("test_title", "CBT Practice Test"), "total_questions": len(questions)},
                live_state=user_answers,
            )
            db.add(attempt)
            await db.flush()

            result = ExamResult(
                exam_attempt_id=attempt.id,
                student_id=current_student.id,
                total_score=score,
                percentage=max(0.0, percentage),
                correct_count=correct_count,
                incorrect_count=incorrect_count,
                unanswered_count=unattempted_count,
                accuracy=accuracy,
                time_taken_seconds=time_taken,
            )
            db.add(result)
            await db.commit()
        except Exception:
            await db.rollback()

    return {
        "total_questions": len(questions),
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "unattempted_count": unattempted_count,
        "score": score,
        "max_score": max_score,
        "percentage": max(0.0, percentage),
        "accuracy": accuracy,
        "time_taken_seconds": time_taken,
        "solutions": solutions,
    }


@router.post("/download-mock-paper")
async def download_mock_paper(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Generates 2 distinct printable/downloadable mock papers for teachers & students:
    1. Test Paper (Questions & Multiple-Choice options only)
    2. Answer Key & Detailed Solutions Paper (Answers matrix + explanations)
    """
    title = payload.get("title", "SamAI All India NEET / KCET / JEE Competitive Mock Examination")
    question_count = payload.get("question_count", 30)

    # Re-use mock test generation logic to assemble questions
    mock_res = await create_mock_test(payload, db)
    questions = mock_res.get("questions", [])

    # Format 1: Test Paper HTML Content
    q_html_items = []
    for idx, q in enumerate(questions):
        opts_html = "".join(
            f"<div class='opt-box'><strong>({k})</strong> {v}</div>"
            for k, v in q.get("options", {}).items()
        )
        q_html_items.append(
            f"""
            <div class="question-block">
                <p class="q-title"><strong>Q{idx+1}.</strong> {q.get('question_text')}</p>
                <div class="options-grid">{opts_html}</div>
            </div>
            """
        )

    # Format 2: Answer Key Matrix & Solutions HTML Content
    key_matrix_items = []
    solutions_html_items = []
    for idx, q in enumerate(questions):
        key_matrix_items.append(f"<tr><td>Q{idx+1}</td><td><strong>{q.get('correct_answer')}</strong></td></tr>")
        solutions_html_items.append(
            f"""
            <div class="sol-block">
                <p class="q-title"><strong>Q{idx+1}.</strong> {q.get('question_text')}</p>
                <p class="ans-key"><strong>Correct Answer: ({q.get('correct_answer')})</strong></p>
                <p class="explanation"><strong>Detailed Solution:</strong> {q.get('explanation')}</p>
            </div>
            """
        )

    return {
        "title": title,
        "total_questions": len(questions),
        "exam_code": payload.get("exam_code", "NEET/KCET/JEE"),
        "test_paper": {
            "title": f"{title} - Question Paper",
            "questions": questions,
            "html_rendered": "".join(q_html_items),
        },
        "key_answer_paper": {
            "title": f"{title} - Master Answer Key & Solutions",
            "answer_matrix": key_matrix_items,
            "solutions": questions,
            "html_rendered": "".join(solutions_html_items),
        },
    }

