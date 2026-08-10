"""Structured Planning generation behind the application AI boundary."""

import asyncio
import json
from time import monotonic

from pydantic_ai import (
    Agent,
    ModelAPIError,
    ModelHTTPError,
    ModelRetry,
    PromptedOutput,
    ToolOutput,
    UnexpectedModelBehavior,
)
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.ai.types import (
    AttemptDiagnostics,
    GenerationDiagnostics,
    GenerationFailure,
    GenerationSuccess,
    OutputStrategy,
)
from app.ai.errors import (
    GenerationError,
    OutputValidationExhausted,
    ProviderAuthError,
    ProviderProtocolError,
    TransientProviderError,
    UnknownGenerationError,
)
from app.core.config import Settings
from app.schemas.demo import LearningBrief, PlanningOutput
from app.workflow.validator import validate_plan

PLANNING_PROMPT = """
你是 DomainAtlas 的 Planning Agent。你的唯一任务是确认学习边界并生成可执行框架。

规则：
- 使用中文，忠实保留用户目标，不静默扩大或替换目标。
- 生成 4–6 个互不重叠的模块，每个核心模块至少有三个核心问题。
- estimated_concepts 必须等于模块数乘以 6，使最终 Atlas 形成 24–36 个概念节点。
- 模块 ID 使用简短、稳定的英文 kebab-case；learning_sequence 只引用这些 ID。
- 规模必须匹配可用时间；明确排除项、证据要求和完成标准。
- 输入已经足够形成 Demo 计划时不要追问；若有歧义，在 calibration.questions 中最多保留三个问题，同时仍给出安全的建议计划。
- 不执行研究，不声称已经核验事实。
""".strip()

DEFAULT_MODEL_SETTINGS = {
    "extra_body": {
        "thinking": {
            "type": "disabled",
        },
    },
}


def _build_model(settings: Settings) -> Model:
    provider = OpenAIProvider(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base,
    )
    return OpenAIChatModel(settings.openai_model, provider=provider)


async def generate_planning(
    brief: LearningBrief,
    settings: Settings,
    *,
    model: Model | None = None,
    timeout_seconds: float = 120,
    output_retries: int = 1,
) -> GenerationSuccess[PlanningOutput] | GenerationFailure:
    """Generate a Planning output, falling back only for tool protocol incompatibility."""
    started = monotonic()
    actual_model = model or _build_model(settings)
    first = await _generate_planning_attempt(
        brief,
        model=actual_model,
        strategy=OutputStrategy.TOOL_OUTPUT,
        timeout_seconds=timeout_seconds,
        output_retries=output_retries,
    )
    if not (
        isinstance(first, GenerationFailure)
        and isinstance(first.error, ProviderProtocolError)
    ):
        return first

    second = await _generate_planning_attempt(
        brief,
        model=actual_model,
        strategy=OutputStrategy.PROMPTED_OUTPUT,
        timeout_seconds=timeout_seconds,
        output_retries=output_retries,
    )
    diagnostics = GenerationDiagnostics(
        duration_seconds=monotonic() - started,
        attempts=first.diagnostics.attempts + second.diagnostics.attempts,
    )
    if isinstance(second, GenerationFailure):
        return GenerationFailure(error=second.error, diagnostics=diagnostics)
    return GenerationSuccess(output=second.output, diagnostics=diagnostics)


async def _generate_planning_attempt(
    brief: LearningBrief,
    *,
    model: Model,
    strategy: OutputStrategy,
    timeout_seconds: float,
    output_retries: int,
) -> GenerationSuccess[PlanningOutput] | GenerationFailure:
    started = monotonic()
    output_type = (
        ToolOutput(
            PlanningOutput,
            name="planning_output",
            max_retries=output_retries,
        )
        if strategy is OutputStrategy.TOOL_OUTPUT
        else PromptedOutput(
            PlanningOutput,
            name="planning_output",
        )
    )
    agent = Agent(
        model,
        output_type=output_type,
        system_prompt=PLANNING_PROMPT,
        model_settings=DEFAULT_MODEL_SETTINGS,
        retries={"output": output_retries},
    )

    @agent.output_validator
    def validate_planning_output(output: PlanningOutput) -> PlanningOutput:
        issues = validate_plan(output.plan)
        if issues:
            raise ModelRetry("Planning domain validation failed: " + "; ".join(issues))
        return output

    try:
        result = await asyncio.wait_for(
            agent.run(f"学习任务如下：\n{brief.model_dump_json(indent=2)}"),
            timeout=timeout_seconds,
        )
    except (ModelAPIError, UnexpectedModelBehavior, TimeoutError) as error:
        normalized = _normalize_generation_error(error)
        duration = monotonic() - started
        attempt = AttemptDiagnostics(
            strategy=strategy,
            duration_seconds=duration,
            http_status=normalized.http_status,
            error_category=normalized.category,
            sanitized_error_message=normalized.message,
        )
        return GenerationFailure(
            error=normalized,
            diagnostics=GenerationDiagnostics(
                duration_seconds=duration,
                attempts=(attempt,),
            ),
        )
    else:
        duration = monotonic() - started
        return GenerationSuccess(
            output=result.output,
            diagnostics=GenerationDiagnostics(
                duration_seconds=duration,
                attempts=(
                    AttemptDiagnostics(
                        strategy=strategy,
                        duration_seconds=duration,
                    ),
                ),
            ),
        )


def _normalize_generation_error(
    error: ModelAPIError | UnexpectedModelBehavior | TimeoutError,
) -> GenerationError:
    if isinstance(error, ModelHTTPError):
        status = error.status_code
        if status in (401, 403):
            return ProviderAuthError(
                "Provider rejected the configured credentials or authorization.",
                http_status=status,
            )
        if status == 400 and _is_tool_protocol_incompatibility(error.body):
            return ProviderProtocolError(
                "Provider rejected the tool-based structured output protocol.",
                http_status=status,
            )
        if status in (408, 409, 429) or status >= 500:
            return TransientProviderError(
                f"Provider request failed with retryable HTTP {status}.",
                http_status=status,
            )
        return UnknownGenerationError(
            f"Provider request failed with HTTP {status}.",
            http_status=status,
        )
    if isinstance(error, UnexpectedModelBehavior):
        if error.message.startswith(
            ("Exceeded maximum output retries", "Tool 'planning_output' exceeded max retries")
        ):
            return OutputValidationExhausted(
                "Structured output validation failed after all retries."
            )
        return UnknownGenerationError("Model returned an unexpected response.")
    if isinstance(error, TimeoutError):
        return TransientProviderError("Provider request timed out.")
    return TransientProviderError("Provider connection failed.")


def _is_tool_protocol_incompatibility(body: object | None) -> bool:
    if body is None:
        return False
    try:
        text = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    except (TypeError, ValueError):
        return False
    normalized = text.casefold()
    protocol_markers = (
        "tool_choice",
        "tool choice",
        "tool calling",
        "function calling",
    )
    incompatibility_markers = (
        "unsupported",
        "not supported",
        "does not support",
        "unknown parameter",
        "unrecognized",
        "not allowed",
        "invalid value",
    )
    return any(marker in normalized for marker in protocol_markers) and any(
        marker in normalized for marker in incompatibility_markers
    )
