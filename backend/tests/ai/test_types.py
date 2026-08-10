from dataclasses import FrozenInstanceError, asdict

import pytest

from app.ai import (
    AttemptDiagnostics,
    GenerationDiagnostics,
    GenerationFailure,
    GenerationSuccess,
    OutputStrategy,
    ProviderAuthError,
    ProviderProtocolError,
)


def test_generation_success_preserves_typed_output_and_diagnostics():
    attempt = AttemptDiagnostics(
        strategy=OutputStrategy.TOOL_OUTPUT,
        duration_seconds=0.25,
    )
    diagnostics = GenerationDiagnostics(
        duration_seconds=0.25,
        attempts=(attempt,),
    )
    result = GenerationSuccess(output={"scope": "bounded"}, diagnostics=diagnostics)

    assert result.output == {"scope": "bounded"}
    assert result.diagnostics.attempts == (attempt,)
    assert asdict(result)["diagnostics"]["duration_seconds"] == 0.25


def test_generation_result_types_are_immutable():
    diagnostics = GenerationDiagnostics(duration_seconds=0.0)
    result = GenerationSuccess(output="plan", diagnostics=diagnostics)

    with pytest.raises(FrozenInstanceError):
        result.output = "replacement"


def test_generation_failure_carries_provider_independent_error_metadata():
    error = ProviderAuthError("credentials rejected", http_status=401)
    diagnostics = GenerationDiagnostics(
        duration_seconds=0.1,
        attempts=(
            AttemptDiagnostics(
                strategy=OutputStrategy.TOOL_OUTPUT,
                duration_seconds=0.1,
                http_status=401,
                error_category=error.category,
                sanitized_error_message=error.message,
            ),
        ),
    )
    failure = GenerationFailure(error=error, diagnostics=diagnostics)

    assert str(failure.error) == "credentials rejected"
    assert failure.error.http_status == 401
    assert failure.error.category == "provider_auth"


def test_output_strategy_values_are_stable_serializable_strings():
    assert OutputStrategy.TOOL_OUTPUT == "tool_output"
    assert OutputStrategy.PROMPTED_OUTPUT == "prompted_output"


def test_generation_errors_share_a_catchable_base_type():
    with pytest.raises(Exception):
        raise ProviderProtocolError("tool_choice is unsupported", http_status=400)
