import logging
from typing import Any

from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

logger = logging.getLogger(__name__)


def _text_content(message: dict[str, Any]) -> str:
    parts = message.get("parts", [])
    if parts:
        return " ".join(part.get("text", "") for part in parts if part.get("type") == "text")
    return message.get("content", "")


def convert_vercel_messages_to_pydantic(
    messages: list[dict[str, Any]],
) -> tuple[str, list[ModelMessage]]:
    logger.info("Converting %d messages", len(messages))
    latest_user_index = next(
        (index for index in range(len(messages) - 1, -1, -1) if messages[index].get("role") == "user"),
        None,
    )
    if latest_user_index is None:
        return "", []

    history: list[ModelMessage] = []

    for message in messages[:latest_user_index]:
        role = message.get("role")
        if role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=_text_content(message))]))
        elif role == "assistant":
            parts: list[Any] = []
            text = _text_content(message)
            if text:
                parts.append(TextPart(content=text))
            tool_calls = []
            for part in message.get("parts", []):
                if part.get("type") == "tool-call":
                    call = ToolCallPart(
                        tool_name=part.get("toolName", ""),
                        args=part.get("input", {}),
                        tool_call_id=part.get("toolCallId", ""),
                    )
                    tool_calls.append(call)
                    parts.append(call)
            if parts:
                history.append(ModelResponse(parts=parts))
            for call in tool_calls:
                result = next(
                    (part.get("output") for part in message.get("parts", [])
                     if part.get("type") == "tool-result" and part.get("toolCallId") == call.tool_call_id),
                    None,
                )
                if result is not None:
                    history.append(ModelRequest(parts=[ToolReturnPart(
                        tool_name=call.tool_name,
                        content=result,
                        tool_call_id=call.tool_call_id,
                    )]))

    return _text_content(messages[latest_user_index]), history
