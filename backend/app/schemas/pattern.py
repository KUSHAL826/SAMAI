import uuid

from pydantic import BaseModel, Field


class ExamPatternCreate(BaseModel):
    exam_type_id: uuid.UUID
    name: str = Field(min_length=2, max_length=255)
    duration_minutes: int = Field(gt=0)
    total_questions: int = Field(gt=0)
    total_marks: int = Field(gt=0)
    positive_marks: float = 4.0
    negative_marks: float = -1.0
    questions_per_subject: dict[str, int] = Field(default_factory=dict)
    difficulty_distribution: dict[str, float] = Field(default_factory=dict)
    question_type_distribution: dict[str, float] = Field(default_factory=dict)


class ExamPatternOut(BaseModel):
    id: uuid.UUID
    exam_type_id: uuid.UUID
    name: str
    duration_minutes: int
    total_questions: int
    total_marks: int
    positive_marks: float
    negative_marks: float
    questions_per_subject: dict
    difficulty_distribution: dict
    question_type_distribution: dict
    is_active: bool

    model_config = {"from_attributes": True}
