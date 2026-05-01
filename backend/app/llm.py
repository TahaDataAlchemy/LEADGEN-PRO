from groq import Groq
from app.config import settings

async def llm_groq():
    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Say hello in one sentence."}],
        max_tokens=50
    )
    return {"response": response.choices[0].message.content}