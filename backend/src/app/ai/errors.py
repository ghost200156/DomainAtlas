"""Provider-independent generation errors exposed by the AI boundary."""

from typing import ClassVar


class GenerationError(Exception):
    """Base class for expected failures while generating structured output."""

    category: ClassVar[str] = "generation_error"

    def __init__(self, message: str, *, http_status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.http_status = http_status


class ProviderAuthError(GenerationError):
    """The provider rejected the configured credentials or authorization."""

    category = "provider_auth"


class ProviderProtocolError(GenerationError):
    """The provider does not support the requested output protocol."""

    category = "provider_protocol"


class TransientProviderError(GenerationError):
    """A provider or transport failure that may succeed on a later request."""

    category = "transient_provider"


class OutputValidationExhausted(GenerationError):
    """Structured-output validation failed after all configured retries."""

    category = "output_validation_exhausted"


class UnknownGenerationError(GenerationError):
    """An otherwise unclassified error at the generation boundary."""

    category = "unknown_generation"
