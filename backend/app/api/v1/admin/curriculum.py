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

from app.api.deps import get_current_admin

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin:curriculum"],
    dependencies=[Depends(get_current_admin)],
)


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


async def ensure_default_curriculum(db: AsyncSession):
    """Auto-seeds default ExamTypes, Subjects, Chapters, and Topics if database is empty."""
    res = await db.execute(select(ExamType))
    exams = res.scalars().all()
    if not exams:
        neet = ExamType(code="NEET", name="NEET Competitive Exam")
        kcet = ExamType(code="KCET", name="KCET Entrance Exam")
        jee = ExamType(code="JEE", name="JEE Main & Advanced Exam")
        db.add_all([neet, kcet, jee])
        await db.commit()
        await db.refresh(neet)
        await db.refresh(kcet)
        await db.refresh(jee)
        exams = [neet, kcet, jee]

    for ex in exams:
        subjs_res = await db.execute(select(Subject).where(Subject.exam_type_id == ex.id))
        subjs = subjs_res.scalars().all()
        if not subjs:
            names = ["Physics", "Chemistry", "Biology"] if ex.code == "NEET" else (
                ["Physics", "Chemistry", "Mathematics", "Biology"] if ex.code == "KCET" else ["Physics", "Chemistry", "Mathematics"]
            )
            created_subjs = []
            for n in names:
                sb = Subject(exam_type_id=ex.id, name=n)
                db.add(sb)
                created_subjs.append(sb)
            await db.commit()

            for sb in created_subjs:
                await db.refresh(sb)
                if sb.name == "Physics":
                    ch1 = Chapter(subject_id=sb.id, name="Mechanics & Kinematics", order_index=1)
                    ch2 = Chapter(subject_id=sb.id, name="Thermodynamics & Heat", order_index=2)
                    ch3 = Chapter(subject_id=sb.id, name="Electricity & Magnetism", order_index=3)
                    db.add_all([ch1, ch2, ch3])
                    await db.commit()

                    t1 = Topic(chapter_id=ch1.id, name="Motion in 1D & 2D", order_index=1)
                    t2 = Topic(chapter_id=ch1.id, name="Laws of Motion & Work Power Energy", order_index=2)
                    t3 = Topic(chapter_id=ch2.id, name="Laws of Thermodynamics", order_index=1)
                    t4 = Topic(chapter_id=ch3.id, name="Electrostatics & Current Electricity", order_index=1)
                    db.add_all([t1, t2, t3, t4])
                    await db.commit()

                elif sb.name == "Chemistry":
                    ch1 = Chapter(subject_id=sb.id, name="Organic Chemistry", order_index=1)
                    ch2 = Chapter(subject_id=sb.id, name="Physical Chemistry", order_index=2)
                    ch3 = Chapter(subject_id=sb.id, name="Inorganic Chemistry", order_index=3)
                    db.add_all([ch1, ch2, ch3])
                    await db.commit()

                    t1 = Topic(chapter_id=ch1.id, name="Hydrocarbons & Reaction Mechanisms", order_index=1)
                    t2 = Topic(chapter_id=ch2.id, name="Chemical Kinetics & Solutions", order_index=1)
                    t3 = Topic(chapter_id=ch3.id, name="Periodic Table & Chemical Bonding", order_index=1)
                    db.add_all([t1, t2, t3])
                    await db.commit()

                elif sb.name == "Biology":
                    ch1 = Chapter(subject_id=sb.id, name="Cellular Biology & Genetics", order_index=1)
                    ch2 = Chapter(subject_id=sb.id, name="Human Physiology & Reproduction", order_index=2)
                    db.add_all([ch1, ch2])
                    await db.commit()

                    t1 = Topic(chapter_id=ch1.id, name="Cell Structure & Genetics", order_index=1)
                    t2 = Topic(chapter_id=ch2.id, name="Human Physiology & Reproduction", order_index=1)
                    db.add_all([t1, t2])
                    await db.commit()

                elif sb.name == "Mathematics":
                    ch1 = Chapter(subject_id=sb.id, name="Calculus & Derivatives", order_index=1)
                    ch2 = Chapter(subject_id=sb.id, name="Algebra & Coordinate Geometry", order_index=2)
                    db.add_all([ch1, ch2])
                    await db.commit()

                    t1 = Topic(chapter_id=ch1.id, name="Limits, Continuity & Integrals", order_index=1)
                    t2 = Topic(chapter_id=ch2.id, name="Matrices, Vectors & Geometry", order_index=1)
                    db.add_all([t1, t2])
                    await db.commit()


@router.get("/exam-types", response_model=list[ExamTypeOut])
async def list_exam_types(db: AsyncSession = Depends(get_db)):
    await ensure_default_curriculum(db)
    result = await db.execute(select(ExamType).order_by(ExamType.name))
    return result.scalars().all()


@router.delete("/exam-types/{exam_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam_type(exam_type_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from app.db.models.curriculum import Subject
    from app.db.models.document import Document, DocumentChunk
    from app.db.models.pattern import ExamPattern
    from app.db.models.question import QuestionBank
    from app.db.models.attempt import ExamAttempt
    from sqlalchemy import delete

    exam_type = await db.get(ExamType, exam_type_id)
    if not exam_type:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam type not found.")

    try:
        # Delete dependent records in database order to satisfy foreign keys
        await db.execute(delete(ExamAttempt).where(ExamAttempt.exam_type_id == exam_type_id))
        await db.execute(delete(ExamPattern).where(ExamPattern.exam_type_id == exam_type_id))
        await db.execute(delete(QuestionBank).where(QuestionBank.exam_type_id == exam_type_id))
        await db.execute(delete(DocumentChunk).where(DocumentChunk.exam_type_id == exam_type_id))
        await db.execute(delete(Document).where(Document.exam_type_id == exam_type_id))

        subjs_res = await db.execute(select(Subject).where(Subject.exam_type_id == exam_type_id))
        subjs = subjs_res.scalars().all()
        for s in subjs:
            await db.delete(s)

        await db.delete(exam_type)
        await db.commit()
    except Exception as err:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not delete target exam: {str(err)}")

    return None


# ---------- Subjects ----------

@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
async def create_subject(payload: SubjectCreate, db: AsyncSession = Depends(get_db)):
    exam_type_id = payload.exam_type_id
    if not exam_type_id:
        result = await db.execute(select(ExamType).order_by(ExamType.name))
        first_exam = result.scalars().first()
        if not first_exam:
            first_exam = ExamType(code="NEET", name="NEET Exam")
            db.add(first_exam)
            await db.commit()
            await db.refresh(first_exam)
        exam_type_id = first_exam.id

    exam_type = await db.get(ExamType, exam_type_id)
    if not exam_type:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam type not found.")

    existing = await db.execute(
        select(Subject).where(Subject.exam_type_id == exam_type_id, Subject.name == payload.name)
    )
    existing_subj = existing.scalar_one_or_none()
    if existing_subj:
        return existing_subj

    subject = Subject(exam_type_id=exam_type_id, name=payload.name)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(exam_type_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    await ensure_default_curriculum(db)
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
async def list_topics(
    chapter_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Topic)
    if chapter_id:
        query = query.where(Topic.chapter_id == chapter_id)
    elif subject_id:
        query = query.join(Chapter, Topic.chapter_id == Chapter.id).where(Chapter.subject_id == subject_id)
    result = await db.execute(query.order_by(Topic.order_index, Topic.name))
    return result.scalars().all()
