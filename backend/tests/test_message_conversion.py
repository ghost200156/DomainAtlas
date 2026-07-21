from app.agent.factory import build_agent_message_history
from app.agent.prompts import SYSTEM_PROMPT
from app.streaming.message_adapter import convert_vercel_messages_to_pydantic
from pydantic_ai.messages import ModelRequest, ModelResponse, SystemPromptPart, ToolCallPart, ToolReturnPart


def test_message_conversion_uses_latest_user_as_prompt():
    prompt, history = convert_vercel_messages_to_pydantic(
        [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "first answer"},
            {"role": "user", "content": "second"},
            {"role": "assistant", "content": "trailing assistant"},
        ]
    )

    assert prompt == "second"
    assert len(history) == 2
    assert history[1].parts[0].content == "first answer"


def test_factory_adds_system_prompt_to_history_once():
    _, history = convert_vercel_messages_to_pydantic([{"role": "user", "content": "first"}])
    history = build_agent_message_history(history)

    system_prompts = [
        part.content
        for message in history
        for part in message.parts
        if isinstance(part, SystemPromptPart)
    ]

    assert system_prompts == [SYSTEM_PROMPT]


def test_message_conversion_preserves_ai_sdk_v7_tool_history():
    prompt, history = convert_vercel_messages_to_pydantic(
        [
            {"role": "user", "parts": [{"type": "text", "text": "research climate policy"}]},
            {
                "role": "assistant",
                "parts": [
                    {
                        "type": "tool-source_lookup",
                        "toolCallId": "call-1",
                        "state": "output-available",
                        "input": {"query": "climate policy"},
                        "output": {"sources": ["example"]},
                    }
                ],
            },
            {"role": "user", "parts": [{"type": "text", "text": "continue"}]},
        ]
    )

    assert prompt == "continue"
    assert isinstance(history[1], ModelResponse)
    assert isinstance(history[1].parts[0], ToolCallPart)
    assert history[1].parts[0].tool_name == "source_lookup"
    assert isinstance(history[2], ModelRequest)
    assert isinstance(history[2].parts[0], ToolReturnPart)
    assert history[2].parts[0].content == {"sources": ["example"]}


def test_message_conversion_preserves_legacy_tool_history():
    _, history = convert_vercel_messages_to_pydantic(
        [
            {"role": "user", "content": "calculate"},
            {
                "role": "assistant",
                "parts": [
                    {
                        "type": "tool-call",
                        "toolName": "calculator",
                        "toolCallId": "call-1",
                        "input": {"expression": "1 + 1"},
                    },
                    {
                        "type": "tool-result",
                        "toolCallId": "call-1",
                        "output": 2,
                    },
                ],
            },
            {"role": "user", "content": "continue"},
        ]
    )

    assert len(history) == 3
    assert isinstance(history[1].parts[0], ToolCallPart)
    assert isinstance(history[2].parts[0], ToolReturnPart)
    assert history[2].parts[0].content == 2
