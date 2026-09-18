import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class ExamPattern(Base, UUIDPKMixin, TimestampMixin):
    """Admin-configured pattern (spec section 26). Nothing about exam
    structure is ever hardcoded in application code -- it's all read from here."""

    __tablename__ = "exam_patterns"

    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_types.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. "NEET 2026 Full Pattern"

    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    total_marks: Mapped[int] = mapped_column(Integer, nullable=False)

    positive_marks: Mapped[float] = mapped_column(default=4.0)
    negative_marks: Mapped[float] = mapped_column(default=-1.0)

    # Flexible JSON for things that vary a lot between exams:
    # questions_per_subject: {"Physics": 45, "Chemistry": 45, "Biology": 90}
    # difficulty_distribution: {"easy": 0.3, "moderate": 0.5, "difficult": 0.2}
    # question_type_distribution: {"mcq_single": 1.0}
    questions_per_subject: Mapped[dict] = mapped_column(JSONB, default=dict)
    difficulty_distribution: Mapped[dict] = mapped_column(JSONB, default=dict)
    question_type_distribution: Mapped[dict] = mapped_column(JSONB, default=dict)

    is_active: Mapped[bool] = mapped_column(default=True)

    exam_type: Mapped["ExamType"] = relationship()
