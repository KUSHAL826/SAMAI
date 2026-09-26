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


class MockTestRequest(BaseModel):
    exam_type_id: uuid.UUID | None = None
    subject_ids: list[uuid.UUID] = Field(default_factory=list)
    topic_ids: list[uuid.UUID] = Field(default_factory=list)
    mode: str = "topic"  # "topic", "multi_topic", "subject", "full_length", "custom"
    question_count: int = 10
    difficulty: str = "mixed"


class MockTestSubmitRequest(BaseModel):
    exam_type_id: uuid.UUID | None = None
    test_title: str = "Mock Test"
    time_taken_seconds: int = 0
    user_answers: dict[str, str] = Field(default_factory=dict)
    questions: list[dict] = Field(default_factory=list)


class MockTestResultOut(BaseModel):
    total_questions: int
    correct_count: int
    incorrect_count: int
    unattempted_count: int
    score: float
    max_score: float
    percentage: float
    time_taken_seconds: int
    subject_breakdown: dict
    solutions: list[dict]

