from pydantic_ai.messages import ModelMessage, ModelRequest, SystemPromptPart
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.agent.prompts import SYSTEM_PROMPT
from app.core.config import Settings, get_settings


def create_domain_learning_agent(settings: Settings | None = None) -> Agent:
    settings = settings or get_settings()
    provider = OpenAIProvider(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base,
    )
    model = OpenAIChatModel(settings.openai_model, provider=provider)
    agent = Agent(model, system_prompt=SYSTEM_PROMPT)
    return agent


def build_agent_message_history(history: list[ModelMessage]) -> list[ModelMessage]:
    """Build history with the server-owned system prompt exactly once."""
    return [ModelRequest(parts=[SystemPromptPart(content=SYSTEM_PROMPT)]), *history]
