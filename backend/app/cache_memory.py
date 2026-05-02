from app.redis_client import r
import json

def get_conversation_history(conversation_id: str) -> list[dict]:
    data = r.get(f"conv:{conversation_id}")
    if data:
        return json.loads(data)
    return []

def save_conversation_history(conversation_id: str, messages: list[dict]):
    trimmed = messages[-20:]  # keep last 20 only
    r.setex(f"conv:{conversation_id}", 86400, json.dumps(trimmed))

def clear_conversation_history(conversation_id: str):
    r.delete(f"conv:{conversation_id}")