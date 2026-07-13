import json
import logging

from pydantic_ai import Agent
from pydantic_ai.messages import FunctionToolCallEvent, FunctionToolResultEvent, PartDeltaEvent, PartStartEvent

logger = logging.getLogger(__name__)


def _chunk(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def to_data_stream_protocol(node, run):
    if not hasattr(run, "_tool_calls_pending"):
        run._tool_calls_pending = {}
    if not hasattr(run, "_tool_name_map"):
        run._tool_name_map = {}

    if Agent.is_model_request_node(node):
        async with node.stream(run.ctx) as stream:
            async for event in stream:
                if isinstance(event, PartStartEvent) and event.part.part_kind == "text":
                    run._text_id = getattr(run, "_text_id", f"text-{id(event)}")
                    yield _chunk({"type": "text-start", "id": run._text_id})
                    if event.part.content:
                        yield _chunk({"type": "text-delta", "id": run._text_id, "delta": event.part.content})
                elif isinstance(event, PartStartEvent) and event.part.part_kind == "tool-call":
                    run._tool_calls_pending[event.part.tool_call_id] = {"toolName": event.part.tool_name}
                elif isinstance(event, PartDeltaEvent) and event.delta.part_delta_kind == "text":
                    run._text_id = getattr(run, "_text_id", "text-main")
                    yield _chunk({"type": "text-delta", "id": run._text_id, "delta": event.delta.content_delta})

    elif Agent.is_call_tools_node(node):
        async with node.stream(run.ctx) as stream:
            async for event in stream:
                if isinstance(event, FunctionToolCallEvent):
                    run._tool_name_map[event.part.tool_call_id] = event.part.tool_name
                    yield _chunk({"type": "tool-input-available", "toolCallId": event.part.tool_call_id,
                                  "toolName": event.part.tool_name, "input": event.part.args})
                elif isinstance(event, FunctionToolResultEvent):
                    content = event.part.content
                    if hasattr(content, "model_dump"):
                        content = content.model_dump()
                    elif hasattr(content, "to_dict"):
                        content = content.to_dict()
                    yield _chunk({"type": "tool-output-available", "toolCallId": event.tool_call_id, "output": content})

    elif Agent.is_end_node(node) and hasattr(run, "_text_id"):
        yield _chunk({"type": "text-end", "id": run._text_id})
        del run._text_id
