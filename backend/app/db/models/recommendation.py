import uuid

from sqlalchemy import Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class StudentRecommendation(Base, UUIDPKMixin, TimestampMixin):
    """Generated from actual performance data, never generic advice
    (spec section 36). Backs both the dashboard 'Weak Topics' widget
    and the 'Practice Now' button (spec section 38)."""

    __tablename__ = "student_recommendations"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("topics.id"), index=True)

    current_accuracy: Mapped[float] = mapped_column(Float, nullable=False)
    priority_rank: Mapped[int] = mapped_column(default=0)  # 1 = most urgent
    ai_summary: Mapped[str] = mapped_column(Text, nullable=False)  # grounded in real attempt data
    is_active: Mapped[bool] = mapped_column(default=True)
