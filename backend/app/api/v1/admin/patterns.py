import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.curriculum import ExamType
from app.db.models.pattern import ExamPattern
from app.db.session import get_db
from app.schemas.pattern import ExamPatternCreate, ExamPatternOut

from app.api.deps import get_current_admin

router = APIRouter(
    prefix="/api/v1/admin/patterns",
    tags=["admin:patterns"],
    dependencies=[Depends(get_current_admin)],
)


@router.post("", response_model=ExamPatternOut, status_code=status.HTTP_201_CREATED)
async def create_pattern(payload: ExamPatternCreate, db: AsyncSession = Depends(get_db)):
    if not await db.get(ExamType, payload.exam_type_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam type not found.")

    pattern = ExamPattern(**payload.model_dump())
    db.add(pattern)
    await db.commit()
    await db.refresh(pattern)
    return pattern


@router.get("", response_model=list[ExamPatternOut])
async def list_patterns(exam_type_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    query = select(ExamPattern).where(ExamPattern.is_active.is_(True))
    if exam_type_id:
        query = query.where(ExamPattern.exam_type_id == exam_type_id)
    result = await db.execute(query.order_by(ExamPattern.name))
    return result.scalars().all()


@router.get("/{pattern_id}", response_model=ExamPatternOut)
async def get_pattern(pattern_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pattern = await db.get(ExamPattern, pattern_id)
    if not pattern:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam pattern not found.")
    return pattern


@router.delete("/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pattern(pattern_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pattern = await db.get(ExamPattern, pattern_id)
    if not pattern:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam pattern not found.")
    await db.delete(pattern)
    await db.commit()
    return None
