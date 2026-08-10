"""Application-level AI generation boundary."""

from app.ai.errors import (
    GenerationError,
    OutputValidationExhausted,
    ProviderAuthError,
    ProviderProtocolError,
    TransientProviderError,
    UnknownGenerationError,
)
from app.ai.types import (
    AttemptDiagnostics,
    GenerationDiagnostics,
    GenerationFailure,
    GenerationSuccess,
    OutputStrategy,
)

__all__ = [
    "AttemptDiagnostics",
    "GenerationDiagnostics",
    "GenerationError",
    "GenerationFailure",
    "GenerationSuccess",
    "OutputStrategy",
    "OutputValidationExhausted",
    "ProviderAuthError",
    "ProviderProtocolError",
    "TransientProviderError",
    "UnknownGenerationError",
]
