from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENV: str = "dev"
    PORT: int = 8100
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"          # vision-capable, structured outputs
    BACKEND_CALLBACK_SECRET: str = ""
    CORS_ALLOW_ORIGINS: str = "*"

    class Config:
        env_file = ".env"
        case_sensitive = True


def get_settings() -> Settings:
    return Settings()
