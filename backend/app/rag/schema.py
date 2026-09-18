from pydantic import BaseModel, Field, field_validator


class GeneratedQuestionSchema(BaseModel):
    """The exact structured shape we force the LLM to return (spec section 31).
    Using schema validation here means we never trust uncontrolled free-form
    text from the model."""

    question: str = Field(min_length=10)
    options: dict[str, str] = Field(min_length=2, max_length=4)
    correct_answer: str
    explanation: str = Field(min_length=10)
    difficulty: str
    topic: str
    source_reference: str = ""

    @field_validator("options")
    @classmethod
    def keys_are_letters(cls, v: dict[str, str]) -> dict[str, str]:
        for key in v:
            if key not in ("A", "B", "C", "D"):
                raise ValueError(f"Option key '{key}' must be one of A, B, C, D")
        return v
