from app.cache_memory import get_conversation_history, save_conversation_history
from app.intent_parser_prompt import AGENT_SYSTEM_PROMPT
from app.llm_client import BadRequestError, MODEL, client
from app.tools.registry import AVAILABLE_TOOLS, TOOLS
import json

TOOL_CALL_RETRY_PROMPT = (
    "Important: if you use a tool, you must use the native tool-calling interface "
    "provided by the API. Do not output XML-like or text-based function syntax such as "
    "<function=tool_name>{...}</function>. Do not write JSON for a tool call in normal text."
)


def _create_completion(messages: list[dict], use_tools: bool = True):
    request = {
        "model": MODEL,
        "temperature": 0.1,
        "messages": messages,
        "max_tokens": 1024 if use_tools else 512,
    }

    if use_tools:
        request["tools"] = TOOLS
        request["tool_choice"] = "auto"
    else:
        request["tool_choice"] = "none"

    try:
        return client.chat.completions.create(**request)
    except BadRequestError as exc:
        error_text = str(exc)
        if use_tools and "tool_use_failed" in error_text:
            retry_messages = [{"role": "system", "content": TOOL_CALL_RETRY_PROMPT}, *messages]
            request["messages"] = retry_messages
            return client.chat.completions.create(**request)
        raise


def run_agent(user_message: str, conversation_id: str, user_id: str | None = None) -> dict:
    history = get_conversation_history(conversation_id)
    messages = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message},
    ]

    max_iterations = 5
    iteration = 0
    tool_called = None
    tool_payload = {}
    tool_status = None
    tool_result_payload = None
    navigate_to = None
    dashboard_filters = {}
    final_reply = None

    while iteration < max_iterations:
        iteration += 1
        response = _create_completion(messages, use_tools=True)
        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls

        if not tool_calls:
            final_reply = response_message.content or "Could not generate a response."
            break

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
                    context_args = {}
                    if fn_name in {"show_signals", "add_to_watchlist", "remove_from_watchlist"} and user_id:
                        context_args["user_id"] = user_id

                    tool_result = AVAILABLE_TOOLS[fn_name](**fn_args, **context_args)
                    tool_status = "success"
                    tool_result_payload = tool_result

                    if tool_result.get("navigate_to"):
                        navigate_to = tool_result["navigate_to"]
                        dashboard_filters = tool_result.get("filters", {})
                except Exception as exc:
                    tool_result = {"error": str(exc)}
                    tool_status = "error"

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": fn_name,
                    "content": json.dumps(tool_result),
                }
            )

    if final_reply is None:
        forced = _create_completion(messages, use_tools=False)
        final_reply = forced.choices[0].message.content or "Something went wrong."

    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": final_reply})
    save_conversation_history(conversation_id, history)

    return {
        "reply": final_reply,
        "tool_called": tool_called,
        "tool_payload": tool_payload,
        "tool_status": tool_status,
        "tool_result": tool_result_payload,
        "navigate_to": navigate_to,
        "dashboard_filters": dashboard_filters,
    }
