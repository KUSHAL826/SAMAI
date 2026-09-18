import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class ExamMode(str, enum.Enum):
    CONCEPT = "concept"
    TOPIC_WISE = "topic_wise"
    SUBJECT_WISE = "subject_wise"
    GROUP_SUBJECT = "group_subject"
    FULL_LENGTH = "full_length"


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    ABANDONED = "abandoned"


class ExamAttempt(Base, UUIDPKMixin, TimestampMixin):
    """One instance of a student taking an exam -- concept practice,
    a topic-wise test, or a full-length mock (spec sections 27-33)."""

    __tablename__ = "exam_attempts"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), index=True
    )
    exam_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exam_types.id"), index=True)
    exam_pattern_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_patterns.id"), nullable=True
    )
    mode: Mapped[ExamMode] = mapped_column(Enum(ExamMode, name="exam_mode_enum"), nullable=False)

    # Snapshot of what was configured, so results remain meaningful even if
    # the pattern/topics change later.
    config_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)

    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus, name="attempt_status_enum"), default=AttemptStatus.IN_PROGRESS
    )

    # Restore-on-refresh state (spec section 32): current answers/flags,
    # keyed by question_id, kept in sync via autosave.
    live_state: Mapped[dict] = mapped_column(JSONB, default=dict)

    question_attempts: Mapped[list["QuestionAttempt"]] = relationship(back_populates="exam_attempt")


class QuestionAttempt(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "question_attempts"

    exam_attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("question_bank.id"), index=True)
    question_order: Mapped[int] = mapped_column(Integer, nullable=False)

    student_answer: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(default=0)

    # Denormalized for fast analytics without joining question_bank every time
    # (spec section 44).
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    difficulty: Mapped[str] = mapped_column(String(20))

    palette_state: Mapped[str] = mapped_column(String(30), default="not_visited")
    # answered | not_answered | marked_for_review | not_visited

    exam_attempt: Mapped["ExamAttempt"] = relationship(back_populates="question_attempts")
