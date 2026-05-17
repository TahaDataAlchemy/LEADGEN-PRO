import os

from pydantic_settings import BaseSettings


def _clear_broken_local_proxy_env() -> None:
    broken_targets = ("127.0.0.1:9", "localhost:9")
    proxy_keys = [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ]

    for key in proxy_keys:
        value = os.environ.get(key, "")
        if any(target in value for target in broken_targets):
            os.environ.pop(key, None)


_clear_broken_local_proxy_env()

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_KEY: str
    REDIS_URL: str
    GROQ_API_KEY: str
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    SERPER_API_KEY: str
    HUNTER_API_KEY:str
    FRONTEND_URL: str = "http://localhost:3000"


    class Config:
        env_file = ".env"

settings = Settings()
