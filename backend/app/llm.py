from app.llm_client import client, MODEL

async def llm_groq():
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "Say hello in one sentence."}],
        max_tokens=50
    )
    return {"response": response.choices[0].message.content}
