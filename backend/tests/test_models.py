import pytest

from app.schemas.chat import ChatMessageRequest
from app.agent.factory import create_domain_learning_agent
from app.core.config import Settings


def test_chat_request_rejects_invalid_or_oversized_messages():
    with pytest.raises(ValueError, match="supported role"):
        ChatMessageRequest(messages=[{"role": "system", "content": "no"}])

    with pytest.raises(ValueError, match="too large"):
        ChatMessageRequest(messages=[{"role": "user", "content": "x" * 20_001}])

    with pytest.raises(ValueError, match="user message"):
        ChatMessageRequest(messages=[{"role": "assistant", "content": "no"}])


def test_chat_request_requires_at_least_one_message():
    with pytest.raises(ValueError):
        ChatMessageRequest(messages=[])


def test_settings_normalizes_empty_api_base_and_configures_model():
    settings = Settings(
        openai_api_key="test-key",
        openai_api_base="  ",
        openai_model="custom-model",
    )

    assert settings.openai_api_base is None
    agent = create_domain_learning_agent(settings)
    assert agent.model.model_name == "custom-model"
