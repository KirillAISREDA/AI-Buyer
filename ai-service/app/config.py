from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_search_model: str = "gpt-4o-mini-search-preview"
    openai_fast_model: str = "gpt-4o-mini"
    perplexity_api_key: str = ""
    perplexity_model: str = "sonar"
    log_level: str = "INFO"

    # Redis for marketplace cache
    redis_url: str = ""

    # Marketplace parsing
    marketplace_parsing_enabled: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
