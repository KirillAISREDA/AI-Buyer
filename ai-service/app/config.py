from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    perplexity_api_key: str = ""
    perplexity_model: str = "sonar"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
