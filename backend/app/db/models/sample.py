import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class SampleQuestion(Base, UUIDPKMixin, TimestampMixin):
    """Style/format reference only -- the generator is instructed to never
    copy these verbatim (spec section 24)."""

    __tablename__ = "sample_questions"

    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_types.id", ondelete="CASCADE"), index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True
    )

    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, default=dict)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=True)


class SampleQuestionPaper(Base, UUIDPKMixin, TimestampMixin):
    """Used to learn distribution/structure (spec section 25), not question content."""

    __tablename__ = "sample_question_papers"

    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_types.id", ondelete="CASCADE"), index=True
    )
    source_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    # e.g. {"subject_distribution": {...}, "difficulty_distribution": {...}, "marking_scheme": {...}}
    structure_summary: Mapped[dict] = mapped_column(JSONB, default=dict)
