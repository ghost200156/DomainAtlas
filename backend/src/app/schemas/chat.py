import json
from typing import Any

from pydantic import BaseModel, Field, field_validator


MAX_MESSAGES = 50
MAX_MESSAGE_CHARS = 20_000


class ChatMessageRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_MESSAGES)

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        allowed_roles = {"user", "assistant", "tool"}
        has_user_message = False

        for message in messages:
            if message.get("role") not in allowed_roles:
                raise ValueError("messages must use a supported role")
            if message["role"] == "user":
                has_user_message = True

            parts = message.get("parts", [])
            if not isinstance(parts, list) or any(not isinstance(part, dict) for part in parts):
                raise ValueError("message parts must be a list")
            if "content" in message and not isinstance(message["content"], str):
                raise ValueError("message content must be a string")
            if len(json.dumps(message, ensure_ascii=False)) > MAX_MESSAGE_CHARS:
                raise ValueError("message is too large")

        if not has_user_message:
            raise ValueError("messages must include a user message")
        return messages
