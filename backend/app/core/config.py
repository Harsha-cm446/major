from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "ai_interview_platform"

    # JWT
    JWT_SECRET_KEY: str = "change-me-to-a-long-random-secret-string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Email — supports Resend (HTTPS API) or SMTP fallback
    # Priority: Resend > SMTP. Set RESEND_API_KEY to use Resend.
    EMAIL_PROVIDER: str = "auto"  # "resend", "smtp", or "auto" (tries resend first)
    RESEND_API_KEY: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    # Fallback models when primary model quota is exhausted (free-tier rotation)
    GEMINI_FALLBACK_MODELS: str = "gemini-2.0-flash,gemini-1.5-flash,gemini-2.0-flash-lite,gemini-1.5-flash-8b"

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"
    # Public URL for emails/links (set to your machine's IP or ngrok URL)
    # e.g. http://192.168.1.100:5173 or https://abc123.ngrok.io
    PUBLIC_URL: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
