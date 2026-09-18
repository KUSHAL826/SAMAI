import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class SystemLog(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "system_logs"

    level: Mapped[str] = mapped_column(String(20), default="info")  # info | warning | error
    source: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "rag.generator"
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict] = mapped_column(JSONB, default=dict)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
