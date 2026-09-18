import uuid

from pydantic import BaseModel, Field


class GenerationRequest(BaseModel):
    exam_type_id: uuid.UUID
    subject_id: uuid.UUID
    chapter_id: uuid.UUID
    topic_id: uuid.UUID
    difficulty: str = Field(pattern="^(easy|moderate|difficult|mixed)$")
    count: int = Field(gt=0, le=50)


class GenerationJobOut(BaseModel):
    job_id: uuid.UUID
    status: str
    message: str
    cached: bool = False


class GenerationJobStatusOut(BaseModel):
    job_id: uuid.UUID
    status: str
    questions_requested: int
    questions_generated: int
    questions_validated: int
    error_message: str | None


class QuestionOut(BaseModel):
    """Served to a student during an exam -- correct_answer and explanation
    are deliberately excluded until after submission."""

    id: uuid.UUID
    question_text: str
    options: dict
    difficulty: str
    topic_id: uuid.UUID

    model_config = {"from_attributes": True}


class QuestionWithAnswerOut(QuestionOut):
    """Served after submission for the review/explanation screen (spec section 37)."""

    correct_answer: str
    explanation: str
