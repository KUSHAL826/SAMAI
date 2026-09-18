"""
Student-facing entry point into the RAG pipeline.

Caching (spec section 48): if question_bank already has enough validated,
active questions for the requested exam/topic/difficulty, we serve those
directly instead of spending a Gemini call regenerating near-identical
content. Generation is only triggered for the shortfall.
"""
import random
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student
from app.db.models.curriculum import Topic
from app.db.models.document import DocumentChunk
from app.db.models.job import AIGenerationJob, JobStatus
from app.db.models.question import QuestionBank
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
