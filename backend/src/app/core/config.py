from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str
    openai_api_base: str | None = None
    openai_model: str = "deepseek-v4-flash"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    cors_origins: list[str] = ["http://localhost:5173"]

    @field_validator("openai_api_base", mode="before")
    @classmethod
    def normalize_openai_api_base(cls, value: str | None) -> str | None:
        if isinstance(value, str) and not value.strip():
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
