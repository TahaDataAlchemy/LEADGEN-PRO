from pydantic_settings import BaseSettings

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
