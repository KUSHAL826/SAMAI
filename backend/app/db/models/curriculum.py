import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class ExamType(Base, UUIDPKMixin, TimestampMixin):
    """Reference table: NEET, KCET, JEE. Everything else hangs off this
    so new exams can be added later without touching code (spec section 46)."""

    __tablename__ = "exam_types"

    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # e.g. "NEET"
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    subjects: Mapped[list["Subject"]] = relationship(
        back_populates="exam_type", cascade="all, delete-orphan", passive_deletes=True
    )


class Subject(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("exam_type_id", "name", name="uq_subject_per_exam"),)

    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_types.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # Physics, Chemistry, ...

    exam_type: Mapped["ExamType"] = relationship(back_populates="subjects")
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", passive_deletes=True
    )


class Chapter(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "chapters"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(default=0)

    subject: Mapped["Subject"] = relationship(back_populates="chapters")
    topics: Mapped[list["Topic"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan", passive_deletes=True
    )


class Topic(Base, UUIDPKMixin, TimestampMixin):
    """The approved Table of Contents leaf node. The RAG generator is only
    ever allowed to produce questions for topics that exist here (spec section 22)."""

    __tablename__ = "topics"

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subtopic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    order_index: Mapped[int] = mapped_column(default=0)

    chapter: Mapped["Chapter"] = relationship(back_populates="topics")
