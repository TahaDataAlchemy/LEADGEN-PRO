from app.redis_client import r
from app.database import supabase

import json

def get_conversation_history(conversation_id: str) -> list[dict]:
    data = r.get(f"conv:{conversation_id}")
    if data:
        return json.loads(data)
    result = supabase\
        .table("messages")\
        .select("role, content")\
        .eq("conversation_id", conversation_id)\
        .order("created_at", desc=False)\
        .limit(20)\
        .execute()

    messages = result.data or []

    if not messages:
        return []

    # re-populate Redis so next request is fast again
    save_conversation_history(conversation_id, messages)

    return messages

def save_conversation_history(conversation_id: str, messages: list[dict]):
    trimmed = messages[-20:]  # keep last 20 only
    r.setex(f"conv:{conversation_id}", 86400, json.dumps(trimmed))

def clear_conversation_history(conversation_id: str):
    r.delete(f"conv:{conversation_id}")