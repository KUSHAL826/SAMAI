import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class Student(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "students"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(default=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    otp_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    otp_purpose: Mapped[str | None] = mapped_column(String(50), nullable=True)

    sessions: Mapped[list["StudentSession"]] = relationship(back_populates="student")

    # NOTE: password_hash is intentionally never included in any Pydantic
    # response schema (see app/schemas) so it can never leak through the API.


class StudentSession(Base, UUIDPKMixin, TimestampMixin):
    """Refresh-token / active-session tracking, also used to restore
    an in-progress exam if the browser disconnects (spec section 32)."""

    __tablename__ = "student_sessions"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), index=True
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(default=False)

    student: Mapped["Student"] = relationship(back_populates="sessions")
