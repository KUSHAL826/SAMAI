"""
Minimal curriculum management so documents/questions have real
exam/subject/chapter/topic IDs to attach to.

Deliberately NOT behind admin auth yet (spec section 3) -- but every route
lives under /api/v1/admin so an auth dependency can be dropped in later
without moving anything.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.curriculum import Chapter, ExamType, Subject, Topic
from app.db.session import get_db
from app.schemas.curriculum import (
    ChapterCreate,
    ChapterOut,
    ExamTypeCreate,
    ExamTypeOut,
    SubjectCreate,
    SubjectOut,
    TopicCreate,
    TopicOut,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin:curriculum"])


# ---------- Exam Types ----------

@router.post("/exam-types", response_model=ExamTypeOut, status_code=status.HTTP_201_CREATED)
async def create_exam_type(payload: ExamTypeCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(ExamType).where(ExamType.code == payload.code.upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Exam type '{payload.code}' already exists.")

    exam_type = ExamType(code=payload.code.upper(), name=payload.name)
    db.add(exam_type)
    await db.commit()
    await db.refresh(exam_type)
    return exam_type


@router.get("/exam-types", response_model=list[ExamTypeOut])
async def list_exam_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExamType).order_by(ExamType.name))
    return result.scalars().all()


# ---------- Subjects ----------

@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
async def create_subject(payload: SubjectCreate, db: AsyncSession = Depends(get_db)):
    exam_type = await db.get(ExamType, payload.exam_type_id)
    if not exam_type:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam type not found.")

    existing = await db.execute(
        select(Subject).where(Subject.exam_type_id == payload.exam_type_id, Subject.name == payload.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Subject already exists for this exam.")

    subject = Subject(exam_type_id=payload.exam_type_id, name=payload.name)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(exam_type_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Subject)
    if exam_type_id:
        query = query.where(Subject.exam_type_id == exam_type_id)
    result = await db.execute(query.order_by(Subject.name))
    return result.scalars().all()


# ---------- Chapters ----------

@router.post("/chapters", response_model=ChapterOut, status_code=status.HTTP_201_CREATED)
async def create_chapter(payload: ChapterCreate, db: AsyncSession = Depends(get_db)):
    subject = await db.get(Subject, payload.subject_id)
    if not subject:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found.")

    chapter = Chapter(subject_id=payload.subject_id, name=payload.name, order_index=payload.order_index)
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.get("/chapters", response_model=list[ChapterOut])
async def list_chapters(subject_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Chapter)
    if subject_id:
        query = query.where(Chapter.subject_id == subject_id)
    result = await db.execute(query.order_by(Chapter.order_index, Chapter.name))
    return result.scalars().all()


# ---------- Topics ----------

@router.post("/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
async def create_topic(payload: TopicCreate, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, payload.chapter_id)
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

    topic = Topic(
        chapter_id=payload.chapter_id,
        name=payload.name,
        subtopic=payload.subtopic,
        order_index=payload.order_index,
    )
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic


@router.get("/topics", response_model=list[TopicOut])
async def list_topics(chapter_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Topic)
    if chapter_id:
        query = query.where(Topic.chapter_id == chapter_id)
    result = await db.execute(query.order_by(Topic.order_index, Topic.name))
    return result.scalars().all()
