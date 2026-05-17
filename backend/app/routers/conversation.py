from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.agent import run_agent
from app.cache_memory import clear_conversation_history
from app.database import supabase
from app.summarizer import generate_title_and_suggestions, generate_title_only

router = APIRouter(prefix="/conversations", tags=["conversations"])


class NewConversation(BaseModel):
    user_id: str


class SendMessage(BaseModel):
    conversation_id: str
    user_id: str
    message: str


@router.post("/new")
def create_conversation(body: NewConversation):
    result = supabase.table("conversations").insert(
        {"user_id": body.user_id, "title": "New chat"}
    ).execute()
    return result.data[0]


@router.get("/user/{user_id}")
def get_user_conversations(user_id: str):
    result = (
        supabase.table("conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{conversation_id}/messages")
def get_messages(conversation_id: str):
    result = (
        supabase.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


@router.post("/message")
def send_message(body: SendMessage, background_tasks: BackgroundTasks):
    supabase.table("messages").insert(
        {
            "conversation_id": body.conversation_id,
            "role": "user",
            "content": body.message,
        }
    ).execute()

    result = run_agent(
        user_message=body.message,
        conversation_id=body.conversation_id,
        user_id=body.user_id,
    )

    tool_payload = {
        "args": result.get("tool_payload", {}),
        "result": result.get("tool_result"),
    }
    supabase.table("messages").insert(
        {
            "conversation_id": body.conversation_id,
            "role": "assistant",
            "content": result["reply"],
            "tool_called": result.get("tool_called"),
            "tool_payload": tool_payload,
            "tool_status": result.get("tool_status"),
        }
    ).execute()

    supabase.table("conversations").update(
        {"updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", body.conversation_id).execute()

    background_tasks.add_task(run_summarizer_if_needed, body.conversation_id)
    if result.get("tool_called") == "scrape_leads":
        background_tasks.add_task(score_new_companies)

    return result


def run_summarizer_if_needed(conversation_id: str):
    try:
        messages_result = (
            supabase.table("messages")
            .select("*")
            .eq("conversation_id", conversation_id)
            .execute()
        )

        all_messages = messages_result.data
        user_messages = [message for message in all_messages if message["role"] == "user"]

        if len(user_messages) == 1:
            generate_title_only(conversation_id, all_messages)
            return

        at_least_three_exchanges = len(all_messages) >= 6
        every_third = len(user_messages) % 3 == 0

        if at_least_three_exchanges and every_third:
            generate_title_and_suggestions(conversation_id, all_messages)
    except Exception as exc:
        print(f"Summarizer failed silently: {exc}")


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str):
    clear_conversation_history(conversation_id)
    supabase.table("conversations").delete().eq("id", conversation_id).execute()
    return {"deleted": True}


@router.get("/{conversation_id}/suggestions")
def get_suggestions(conversation_id: str):
    try:
        result = (
            supabase.table("conversation_summaries")
            .select("suggested_questions")
            .eq("conversation_id", conversation_id)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return {"suggestions": result.data[0].get("suggested_questions", [])}
        return {"suggestions": []}
    except Exception as exc:
        print(f"Suggestions error: {exc}")
        return {"suggestions": []}


def score_new_companies():
    from app.tools.score import score_and_cache

    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        companies = (
            supabase.table("companies")
            .select(
                "id, name, domain, industry, location, employee_count, tech_stack, "
                "description, enrichments(score, revenue_estimate, funding_stage)"
            )
            .gte("created_at", cutoff)
            .execute()
            .data
            or []
        )

        for company in companies:
            enrichment = (company.get("enrichments") or [{}])[0]
            if enrichment.get("score") is None:
                score_and_cache(company["id"], company)
    except Exception as exc:
        print(f"Auto-score error: {exc}")
