from app.database import supabase
from app.llm_client import client, MODEL
import json

def generate_title_and_suggestions(conversation_id: str, messages: list[dict]):
    """
    Runs after every 3rd message.
    Generates a short title for the conversation
    and 3 suggested follow-up questions based on context.
    """
    if not messages:
        return

    history_text = "\n".join([
        f"{m['role'].upper()}: {m['content']}"
        for m in messages[-6:]  # last 6 messages for context
    ])

    response = client.chat.completions.create(
        model=MODEL,
        temperature=0.5,
        messages=[
            {
                "role": "system",
                "content": """You are a helpful assistant.
                Given a conversation from a lead generation platform, return ONLY raw JSON.
                No markdown. No explanation.
                {
                  "title": "<5 word max title summarizing the conversation>",
                  "suggested_questions": [
                    "<relevant follow up question 1>",
                    "<relevant follow up question 2>",
                    "<relevant follow up question 3>"
                  ]
                }"""
            },
            {
                "role": "user",
                "content": f"Conversation:\n{history_text}"
            }
        ],
        max_tokens=200
    )

    raw = response.choices[0].message.content.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return

    # update conversation title
    supabase.table("conversations").update({
        "title": data.get("title", "New chat")
    }).eq("id", conversation_id).execute()

    # upsert suggested questions
    supabase.table("conversation_summaries").upsert({
        "conversation_id": conversation_id,
        "suggested_questions": data.get("suggested_questions", []),
        "updated_at": "now()"
    }).execute()


def generate_title_only(conversation_id: str, messages: list[dict]):
    first_user_message = next(
        (m["content"] for m in messages if m["role"] == "user"), None
    )
    if not first_user_message:
        return

    response = client.chat.completions.create(
        model=MODEL,
        temperature=0.3,
        messages=[
            {
                "role": "system",
                "content": "Generate a 4 to 5 word title for a chat that started with this message. Return only the title, nothing else. No quotes, no punctuation."
            },
            {
                "role": "user",
                "content": first_user_message
            }
        ],
        max_tokens=20
    )

    title = response.choices[0].message.content.strip()

    supabase.table("conversations").update({
        "title": title
    }).eq("id", conversation_id).execute()
