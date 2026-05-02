from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.redis_client import test_redis_connection
from app.routers.conversation import router as conversations_router
from groq import Groq
from supabase import create_client
import uvicorn


def test_supabase_connection() -> bool:
    try:
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        client.table("companies").select("id").limit(1).execute()
        return True
    except Exception as e:
        print(f"Supabase error: {e}")
        return False


def test_groq_connection() -> bool:
    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5
        )
        return True
    except Exception as e:
        print(f"Groq error: {e}")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n Starting up LeadGen Pro API...")
    print("-" * 35)

    redis_ok = test_redis_connection()
    print(f"  Redis      → {'✓ connected' if redis_ok else '✗ failed'}")

    supabase_ok = test_supabase_connection()
    print(f"  Supabase   → {'✓ connected' if supabase_ok else '✗ failed'}")

    groq_ok = test_groq_connection()
    print(f"  Groq       → {'✓ connected' if groq_ok else '✗ failed'}")

    print("-" * 35)

    all_ok = redis_ok and supabase_ok and groq_ok
    if all_ok:
        print("  All services healthy. Ready.\n")
    else:
        print("  WARNING: Some services failed. Check your .env keys.\n")

    yield

    print("\n Shutting down LeadGen Pro API...")


app = FastAPI(title="LEADGEN Pro API", version="1.0.0", lifespan=lifespan)

# middleware first
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routers after middleware
app.include_router(conversations_router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "LeadGen Pro API is running"}


@app.get("/test-redis")
def test_redis_conn():
    connected = test_redis_connection()
    return {"redis_connected": connected}


@app.get("/test-groq")
async def test_groq():
    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Say hello in one sentence."}],
        max_tokens=50
    )
    return {"response": response.choices[0].message.content}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )