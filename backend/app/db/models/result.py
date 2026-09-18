import uuid

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class ExamResult(Base, UUIDPKMixin, TimestampMixin):
    """One row per exam attempt -- the overall scorecard (spec sections 34-35)."""

    __tablename__ = "exam_results"

    exam_attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id", ondelete="CASCADE"), unique=True, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), index=True
    )

    total_score: Mapped[float] = mapped_column(Float, nullable=False)
    percentage: Mapped[float] = mapped_column(Float, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    unanswered_count: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    time_taken_seconds: Mapped[int] = mapped_column(Integer, default=0)

    subject_results: Mapped[list["SubjectResult"]] = relationship(back_populates="exam_result")
    topic_results: Mapped[list["TopicResult"]] = relationship(back_populates="exam_result")


class SubjectResult(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "subject_results"

    exam_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_results.id", ondelete="CASCADE"), index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), index=True)

    questions_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float] = mapped_column(Float, default=0.0)

    exam_result: Mapped["ExamResult"] = relationship(back_populates="subject_results")


class TopicResult(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "topic_results"

    exam_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_results.id", ondelete="CASCADE"), index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("topics.id"), index=True)

    questions_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)

    exam_result: Mapped["ExamResult"] = relationship(back_populates="topic_results")
