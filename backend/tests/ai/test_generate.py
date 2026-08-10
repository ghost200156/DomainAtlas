import asyncio

import pytest
from pydantic_ai import ModelAPIError, ModelHTTPError
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from app.ai.generate import generate_planning
from app.ai.errors import (
    OutputValidationExhausted,
    ProviderAuthError,
    ProviderProtocolError,
    TransientProviderError,
    UnknownGenerationError,
)
from app.ai.types import GenerationFailure, OutputStrategy
from app.core.config import Settings
from app.schemas.demo import LearningBrief, PlanningOutput
from app.workflow.fixtures import make_calibration, make_plan


def make_brief() -> LearningBrief:
    return LearningBrief(
        domain="Agent 系统设计",
        primary_intent="task_driven",
        learner_background="了解大模型基础，希望做一个比赛 Demo。",
        desired_outcome="理解 Agent 的最小工作闭环。",
        learning_time_minutes=60,
    )


def make_output() -> PlanningOutput:
    brief = make_brief()
    return PlanningOutput(
        calibration=make_calibration(brief),
        plan=make_plan(brief),
    )


def make_settings() -> Settings:
    return Settings(
        openai_api_key="test-key",
        openai_api_base="https://example.invalid/v1",
        openai_model="test-model",
    )


def test_tool_output_success() -> None:
    async def scenario() -> None:
        expected = make_output()
        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=TestModel(custom_output_args=expected.model_dump()),
        )

        assert result.output == expected
        assert len(result.diagnostics.attempts) == 1
        assert result.diagnostics.attempts[0].strategy is OutputStrategy.TOOL_OUTPUT

    asyncio.run(scenario())


def test_domain_validator_retries_with_existing_rules() -> None:
    async def scenario() -> None:
        valid = make_output()
        invalid = valid.model_copy(deep=True)
        invalid.plan.modules[1].id = invalid.plan.modules[0].id
        responses = [invalid, valid]
        calls = 0

        def respond(_messages, info: AgentInfo) -> ModelResponse:
            nonlocal calls
            output = responses[calls]
            calls += 1
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name=info.output_tools[0].name,
                        args=output.model_dump(),
                    )
                ]
            )

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
            output_retries=1,
        )

        assert result.output == valid
        assert calls == 2

    asyncio.run(scenario())


def test_schema_validation_uses_pydantic_ai_retry_budget() -> None:
    async def scenario() -> None:
        valid = make_output()
        calls = 0

        def respond(_messages, info: AgentInfo) -> ModelResponse:
            nonlocal calls
            calls += 1
            args = (
                {"calibration": valid.calibration.model_dump()}
                if calls == 1
                else valid.model_dump()
            )
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name=info.output_tools[0].name,
                        args=args,
                    )
                ]
            )

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
            output_retries=1,
        )

        assert not isinstance(result, GenerationFailure)
        assert result.output == valid
        assert calls == 2

    asyncio.run(scenario())


def test_output_validation_retry_exhaustion_is_normalized() -> None:
    async def scenario() -> None:
        invalid = make_output()
        invalid.plan.learning_sequence = ["missing-module"]
        calls = 0

        def respond(_messages, info: AgentInfo) -> ModelResponse:
            nonlocal calls
            calls += 1
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name=info.output_tools[0].name,
                        args=invalid.model_dump(),
                    )
                ]
            )

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
            output_retries=1,
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, OutputValidationExhausted)
        assert result.error.http_status is None
        assert calls == 2

    asyncio.run(scenario())


@pytest.mark.parametrize("status", [401, 403])
def test_auth_errors_are_normalized(status: int) -> None:
    async def scenario() -> None:
        def respond(_messages, _info: AgentInfo) -> ModelResponse:
            raise ModelHTTPError(status, "test-model", {"secret": "must not leak"})

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, ProviderAuthError)
        assert result.error.http_status == status
        assert "secret" not in result.diagnostics.attempts[0].sanitized_error_message

    asyncio.run(scenario())


def test_explicit_tool_choice_incompatibility_is_classified() -> None:
    async def scenario() -> None:
        def respond(_messages, _info: AgentInfo) -> ModelResponse:
            raise ModelHTTPError(
                400,
                "test-model",
                {"error": {"message": "tool_choice is not supported by this model"}},
            )

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, ProviderProtocolError)
        assert result.error.http_status == 400

    asyncio.run(scenario())


def test_tool_choice_400_falls_back_to_prompted_output() -> None:
    async def scenario() -> None:
        expected = make_output()
        strategies: list[OutputStrategy] = []

        def respond(_messages, info: AgentInfo) -> ModelResponse:
            if info.output_tools:
                strategies.append(OutputStrategy.TOOL_OUTPUT)
                raise ModelHTTPError(
                    400,
                    "test-model",
                    {"error": {"message": "tool_choice is unsupported"}},
                )
            strategies.append(OutputStrategy.PROMPTED_OUTPUT)
            return ModelResponse(parts=[TextPart(expected.model_dump_json())])

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
        )

        assert not isinstance(result, GenerationFailure)
        assert result.output == expected
        assert strategies == [
            OutputStrategy.TOOL_OUTPUT,
            OutputStrategy.PROMPTED_OUTPUT,
        ]
        assert [attempt.strategy for attempt in result.diagnostics.attempts] == strategies
        assert isinstance(
            result.diagnostics.attempts[0].error_category,
            str,
        )
        assert result.diagnostics.attempts[1].error_category is None

    asyncio.run(scenario())


def test_prompted_fallback_also_uses_domain_validation_retry() -> None:
    async def scenario() -> None:
        valid = make_output()
        invalid = valid.model_copy(deep=True)
        invalid.plan.learning_sequence = ["missing-module"]
        calls = 0

        def respond(_messages, info: AgentInfo) -> ModelResponse:
            nonlocal calls
            calls += 1
            if info.output_tools:
                raise ModelHTTPError(
                    400,
                    "test-model",
                    {"error": {"message": "tool_choice is unsupported"}},
                )
            output = invalid if calls == 2 else valid
            return ModelResponse(parts=[TextPart(output.model_dump_json())])

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
            output_retries=1,
        )

        assert not isinstance(result, GenerationFailure)
        assert result.output == valid
        assert calls == 3
        assert [attempt.strategy for attempt in result.diagnostics.attempts] == [
            OutputStrategy.TOOL_OUTPUT,
            OutputStrategy.PROMPTED_OUTPUT,
        ]

    asyncio.run(scenario())


def test_unrelated_http_400_is_not_a_protocol_error() -> None:
    async def scenario() -> None:
        def respond(_messages, _info: AgentInfo) -> ModelResponse:
            raise ModelHTTPError(400, "test-model", {"error": "invalid temperature"})

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, UnknownGenerationError)
        assert result.error.http_status == 400
        assert len(result.diagnostics.attempts) == 1

    asyncio.run(scenario())


@pytest.mark.parametrize("status", [408, 429, 500, 503])
def test_retryable_http_failures_are_transient(status: int) -> None:
    async def scenario() -> None:
        def respond(_messages, _info: AgentInfo) -> ModelResponse:
            raise ModelHTTPError(status, "test-model")

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, TransientProviderError)
        assert result.error.http_status == status

    asyncio.run(scenario())


def test_connection_failures_are_transient() -> None:
    async def scenario() -> None:
        def respond(_messages, _info: AgentInfo) -> ModelResponse:
            raise ModelAPIError("test-model", "connection refused: sensitive-host")

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, TransientProviderError)
        assert "sensitive-host" not in result.error.message

    asyncio.run(scenario())


def test_timeout_is_transient() -> None:
    async def scenario() -> None:
        async def respond(_messages, _info: AgentInfo) -> ModelResponse:
            await asyncio.sleep(0.05)
            return ModelResponse(parts=[])

        result = await generate_planning(
            make_brief(),
            make_settings(),
            model=FunctionModel(respond),
            timeout_seconds=0.001,
        )

        assert isinstance(result, GenerationFailure)
        assert isinstance(result.error, TransientProviderError)
        assert result.error.message == "Provider request timed out."

    asyncio.run(scenario())


def test_programming_errors_are_not_swallowed() -> None:
    async def scenario() -> None:
        def respond(_messages, _info: AgentInfo) -> ModelResponse:
            raise ValueError("programming bug")

        with pytest.raises(ValueError, match="programming bug"):
            await generate_planning(
                make_brief(),
                make_settings(),
                model=FunctionModel(respond),
            )

    asyncio.run(scenario())
