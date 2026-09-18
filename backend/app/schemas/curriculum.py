import uuid

from pydantic import BaseModel, Field


class ExamTypeCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)  # "NEET", "KCET", "JEE"
    name: str = Field(min_length=2, max_length=100)


class ExamTypeOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    model_config = {"from_attributes": True}


class SubjectCreate(BaseModel):
    exam_type_id: uuid.UUID
    name: str = Field(min_length=2, max_length=100)


class SubjectOut(BaseModel):
    id: uuid.UUID
    exam_type_id: uuid.UUID
    name: str
    model_config = {"from_attributes": True}


class ChapterCreate(BaseModel):
    subject_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    order_index: int = 0


class ChapterOut(BaseModel):
    id: uuid.UUID
    subject_id: uuid.UUID
    name: str
    order_index: int
    model_config = {"from_attributes": True}


class TopicCreate(BaseModel):
    chapter_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    subtopic: str | None = None
    order_index: int = 0


class TopicOut(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    name: str
    subtopic: str | None
    order_index: int
    model_config = {"from_attributes": True}
