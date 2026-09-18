import enum
import uuid

from sqlalchemy import Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class Difficulty(str, enum.Enum):
    EASY = "easy"
    MODERATE = "moderate"
    DIFFICULT = "difficult"


class QuestionType(str, enum.Enum):
    MCQ_SINGLE = "mcq_single"
    MCQ_MULTI = "mcq_multi"
    NUMERICAL = "numerical"


class GenerationStatus(str, enum.Enum):
    PENDING = "pending"
    VALIDATED = "validated"
    REJECTED = "rejected"


class GeneratedQuestion(Base, UUIDPKMixin, TimestampMixin):
    """Every raw AI output, before/after validation (spec section 29).
    Rejected rows stay here for audit + prompt-tuning; only VALIDATED
    ones get promoted into question_bank."""

    __tablename__ = "generated_questions"

    ai_generation_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_generation_jobs.id"), nullable=True, index=True
    )
    raw_output: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[GenerationStatus] = mapped_column(
        Enum(GenerationStatus, name="generation_status_enum"),
        default=GenerationStatus.PENDING,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    promoted_question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_bank.id"), nullable=True
    )


class QuestionBank(Base, UUIDPKMixin, TimestampMixin):
    """Final, validated, servable questions -- and the cache layer for
    repeated topic/difficulty requests (spec section 48)."""

    __tablename__ = "question_bank"

    exam_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exam_types.id"), index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), index=True)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chapters.id"))
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("topics.id"), index=True)
    subtopic: Mapped[str | None] = mapped_column(String(255), nullable=True)

    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {"A": "...", "B": "...", ...}
    correct_answer: Mapped[str] = mapped_column(String(10), nullable=False)  # "B" or "A,C" for multi
    explanation: Mapped[str] = mapped_column(Text, nullable=False)

    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, name="difficulty_enum"))
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, name="question_type_enum"), default=QuestionType.MCQ_SINGLE
    )

    # Traceability back to the exact approved content used to generate this
    # question (spec section 30) -- critical for admin auditing.
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True
    )
    source_chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_chunks.id"), nullable=True
    )

    times_used: Mapped[int] = mapped_column(default=0)  # supports cache/reuse decisions
    is_active: Mapped[bool] = mapped_column(default=True)
