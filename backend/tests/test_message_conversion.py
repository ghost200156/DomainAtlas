from app.agent.factory import build_agent_message_history
from app.agent.prompts import SYSTEM_PROMPT
from app.streaming.message_adapter import convert_vercel_messages_to_pydantic
from pydantic_ai.messages import SystemPromptPart


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
