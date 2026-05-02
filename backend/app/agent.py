from groq import Groq
from app.config import settings
from app.cache_memory import get_conversation_history, save_conversation_history
from app.tools.registry import TOOLS, AVAILABLE_TOOLS
from app.intent_parser_prompt import AGENT_SYSTEM_PROMPT
import json

client = Groq(api_key=settings.GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"


def run_agent(
    user_message: str,
    conversation_id: str,
) -> dict:

    # load history from Redis
    history = get_conversation_history(conversation_id)

    messages = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message}
    ]

    max_iterations = 5
    iteration = 0
    tool_called = None
    tool_payload = {}
    tool_status = None
    navigate_to = None
    dashboard_filters = {}
    final_reply = None

    while iteration < max_iterations:
        iteration += 1

        # ── Reason ────────────────────────────────────────
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.3,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1024
        )

        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls

        # ── No tool call → final answer ───────────────────
        if not tool_calls:
            final_reply = response_message.content or "Could not generate a response."
            break

        # ── Tool call → Act ───────────────────────────────
        messages.append(response_message)

        for tool_call in tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments or "{}")

            tool_called = fn_name
            tool_payload = fn_args

            if fn_name not in AVAILABLE_TOOLS:
                tool_result = {"error": f"Tool {fn_name} not available yet"}
                tool_status = "not_implemented"
            else:
                try:
                    # ── Observe ───────────────────────────
                    tool_result = AVAILABLE_TOOLS[fn_name](**fn_args)
                    tool_status = "success"

                    # check if dashboard navigation needed
                    if fn_name == "filter_dashboard":
                        if tool_result.get("show_on_dashboard"):
                            navigate_to = "/dashboard"
                            dashboard_filters = tool_result.get("filters_applied", {})

                except Exception as e:
                    tool_result = {"error": str(e)}
                    tool_status = "error"

            # ── Feed result back so agent can reason ──────
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": fn_name,
                "content": json.dumps(tool_result)
            })

    # ── safety net ─────────────────────────────────────────
    if final_reply is None:
        forced = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tool_choice="none",
            max_tokens=512
        )
        final_reply = forced.choices[0].message.content or "Something went wrong."

    # ── save updated history to Redis ─────────────────────
    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": final_reply})
    save_conversation_history(conversation_id, history)

    return {
        "reply": final_reply,
        "tool_called": tool_called,
        "tool_payload": tool_payload,
        "tool_status": tool_status,
        "navigate_to": navigate_to,
        "dashboard_filters": dashboard_filters
    }