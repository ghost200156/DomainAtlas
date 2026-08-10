"""Provider-independent result and diagnostics types for AI generation."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Generic, TypeVar

from app.ai.errors import GenerationError

T = TypeVar("T")


class OutputStrategy(str, Enum):
    """Structured-output strategies supported by the application boundary."""

    TOOL_OUTPUT = "tool_output"
    PROMPTED_OUTPUT = "prompted_output"


@dataclass(frozen=True, slots=True)
class AttemptDiagnostics:
    """Sanitized diagnostics for one provider request attempt."""

    strategy: OutputStrategy
    duration_seconds: float
    http_status: int | None = None
    error_category: str | None = None
    sanitized_error_message: str | None = None


@dataclass(frozen=True, slots=True)
class GenerationDiagnostics:
    """Diagnostics collected across all attempts for one generation request."""

    duration_seconds: float
    attempts: tuple[AttemptDiagnostics, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class GenerationSuccess(Generic[T]):
    """A validated structured output and its generation diagnostics."""

    output: T
    diagnostics: GenerationDiagnostics


@dataclass(frozen=True, slots=True)
class GenerationFailure:
    """An expected generation failure and its sanitized diagnostics."""

    error: GenerationError
    diagnostics: GenerationDiagnostics
