import uuid

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    mobile: str = Field(min_length=7, max_length=20)
    password: str = Field(min_length=8, max_length=128)


class VerifySignupOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=10)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyLoginOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=10)


class ResendOTPRequest(BaseModel):
    email: EmailStr
    purpose: str  # "signup" | "login"


class MessageResponse(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class StudentOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    mobile: str
    is_verified: bool

    model_config = {"from_attributes": True}
    # Note: password_hash is deliberately never part of this (or any) schema.
