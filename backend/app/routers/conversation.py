from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from app.database import supabase
from app.agent import run_agent
from app.cache_memory import clear_conversation_history
from app.summarizer import generate_title_and_suggestions, generate_title_only

router = APIRouter(prefix="/conversations", tags=["conversations"])

# ── create a new conversation ──────────────────────────────

class NewConversation(BaseModel):
    user_id: str

@router.post("/new")
def create_conversation(body: NewConversation):
    result = supabase.table("conversations").insert({
        "user_id": body.user_id,
        "title": "New chat"
    }).execute()
    return result.data[0]


# ── get all conversations for a user ──────────────────────

@router.get("/user/{user_id}")
def get_user_conversations(user_id: str):
    result = supabase\
        .table("conversations")\
        .select("id, title, created_at, updated_at")\
        .eq("user_id", user_id)\
        .order("updated_at", desc=True)\
        .execute()
    return result.data


# ── get all messages for a conversation ───────────────────

@router.get("/{conversation_id}/messages")
def get_messages(conversation_id: str):
    result = supabase\
        .table("messages")\
        .select("*")\
        .eq("conversation_id", conversation_id)\
        .order("created_at", desc=True)\
        .execute()
    return result.data


# ── send a message ─────────────────────────────────────────

class SendMessage(BaseModel):
    conversation_id: str
    user_id: str
    message: str

@router.post("/message")
def send_message(body: SendMessage, background_tasks: BackgroundTasks):
    # save user message
    supabase.table("messages").insert({
        "conversation_id": body.conversation_id,
        "role": "user",
        "content": body.message
    }).execute()

    # run agent
    result = run_agent(
        user_message=body.message,
        conversation_id=body.conversation_id
    )

    # save agent reply
    supabase.table("messages").insert({
        "conversation_id": body.conversation_id,
        "role": "assistant",
        "content": result["reply"],
        "tool_called": result.get("tool_called"),
        "tool_payload": result.get("tool_payload"),
        "tool_status": result.get("tool_status")
    }).execute()

    # update timestamp
    supabase.table("conversations").update({
        "updated_at": "now()"
    }).eq("id", body.conversation_id).execute()

    # summarizer runs AFTER response is sent — user does not wait
    background_tasks.add_task(
        run_summarizer_if_needed,
        body.conversation_id
    )

    # returns immediately — background task runs after this
    return result


def run_summarizer_if_needed(conversation_id: str):
    try:
        messages_result = supabase\
            .table("messages")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .execute()

        all_messages = messages_result.data
        user_messages = [m for m in all_messages if m["role"] == "user"]

        # first message — just generate a title so sidebar
        # stops showing "New chat" immediately
        if len(user_messages) == 1:
            generate_title_only(conversation_id, all_messages)
            return

        # every 3rd user message with minimum 3 full exchanges
        at_least_three_exchanges = len(all_messages) >= 6
        every_third = len(user_messages) % 3 == 0

        if at_least_three_exchanges and every_third:
            generate_title_and_suggestions(conversation_id, all_messages)

    except Exception as e:
        print(f"Summarizer failed silently: {e}")

# ── delete a conversation ──────────────────────────────────

@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str):
    clear_conversation_history(conversation_id)
    supabase.table("conversations")\
        .delete()\
        .eq("id", conversation_id)\
        .execute()
    return {"deleted": True}


@router.get("/{conversation_id}/suggestions")
def get_suggestions(conversation_id: str):
    result = supabase\
        .table("conversation_summaries")\
        .select("suggested_questions")\
        .eq("conversation_id", conversation_id)\
        .single()\
        .execute()

    if result.data:
        return {"suggestions": result.data.get("suggested_questions", [])}
    return {"suggestions": []}