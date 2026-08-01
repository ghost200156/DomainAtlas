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
_MISSING = object()


def _text_content(message: dict[str, Any]) -> str:
    parts = message.get("parts", [])
    if parts:
        return " ".join(part.get("text", "") for part in parts if part.get("type") == "text")
    return message.get("content", "")


def _tool_name(part: dict[str, Any]) -> str | None:
    part_type = part.get("type", "")
    if part_type == "dynamic-tool" or part_type == "tool-call":
        return part.get("toolName")
    if isinstance(part_type, str) and part_type.startswith("tool-") and part_type != "tool-result":
        return part_type.removeprefix("tool-")
    return None


def _tool_result(part: dict[str, Any]) -> Any:
    if "output" in part:
        return part["output"]
    if part.get("errorText") is not None:
        return {"error": part["errorText"]}
    return _MISSING


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
            tool_calls: list[tuple[ToolCallPart, Any]] = []
            for part in message.get("parts", []):
                tool_name = _tool_name(part)
                tool_call_id = part.get("toolCallId", "")
                if tool_name and tool_call_id:
                    call = ToolCallPart(
                        tool_name=tool_name,
                        args=part.get("input", {}),
                        tool_call_id=tool_call_id,
                    )
                    tool_calls.append((call, _tool_result(part)))
                    parts.append(call)
            if parts:
                history.append(ModelResponse(parts=parts))
            for call, embedded_result in tool_calls:
                result = embedded_result
                if result is _MISSING:
                    result = next(
                        (part.get("output") for part in message.get("parts", [])
                         if part.get("type") == "tool-result" and part.get("toolCallId") == call.tool_call_id),
                        _MISSING,
                    )
                if result is not _MISSING:
                    history.append(ModelRequest(parts=[ToolReturnPart(
                        tool_name=call.tool_name,
                        content=result,
                        tool_call_id=call.tool_call_id,
                    )]))

    return _text_content(messages[latest_user_index]), history
