from groq import Groq, BadRequestError

from app.config import settings


if not settings.GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set.")


client = Groq(api_key=settings.GROQ_API_KEY)

MODEL = settings.GROQ_MODEL
