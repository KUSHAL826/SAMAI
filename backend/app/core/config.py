from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All configuration lives here and is sourced from environment variables
    (see .env.example). Nothing below should ever be hardcoded elsewhere
    in the app -- this is the single source of truth.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- AI ---
    GEMINI_API_KEY: str
    GEMINI_GENERATION_MODEL: str = "gemini-2.0-flash"
    GEMINI_EMBEDDING_MODEL: str = "models/text-embedding-004"
    GEMINI_EMBEDDING_DIM: int = 768

    # --- Database ---
    DATABASE_URL: str
    DATABASE_URL_SYNC: str

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Auth ---
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # --- Storage ---
    STORAGE_PROVIDER: str = "local"  # local | r2 | s3
    STORAGE_LOCAL_PATH: str = "./uploads"
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_ENDPOINT_URL: str = ""

    # --- Email / OTP ---
    MAIL_USERNAME: str = "kushalyngowda136@gmail.com"
    MAIL_PASSWORD: str = "uzdlhwfmbkchyjnw"
    MAIL_FROM: str = "kushalyngowda136@gmail.com"
    MAIL_FROM_NAME: str = "SamAI"
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = 587
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    OTP_EXPIRE_SECONDS: int = 300
    OTP_LENGTH: int = 6
    RESEND_API_KEY: str = ""
    SHOW_OTP_IN_RESPONSE: bool = True

    # --- App ---
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    # lru_cache means .env is read once per process, not on every request
    return Settings()
