import asyncio
import json
from types import SimpleNamespace

from pydantic_ai import Agent
from pydantic_ai.messages import FunctionToolResultEvent, ToolReturnPart

from app.streaming.ai_sdk_protocol import to_data_stream_protocol


def test_function_tool_result_event_uses_part_payload(monkeypatch):
    event = FunctionToolResultEvent(
        part=ToolReturnPart(
            tool_name="source_lookup",
            tool_call_id="call-1",
            content="42",
        )
    )

    class FakeToolNode:
        def stream(self, _ctx):
            class Stream:
                async def __aenter__(self):
                    return self

                async def __aexit__(self, *_args):
                    return None

                def __aiter__(self):
                    async def events():
                        yield event

                    return events()

            return Stream()

    node = FakeToolNode()
    run = SimpleNamespace(ctx=None)
    monkeypatch.setattr(
        Agent,
        "is_call_tools_node",
        staticmethod(lambda candidate: candidate is node),
    )

    chunks = asyncio.run(collect_chunks(to_data_stream_protocol(node, run)))
    payload = json.loads(chunks[0].removeprefix("data: ").strip())

    assert payload == {
        "type": "tool-output-available",
        "toolCallId": "call-1",
        "output": "42",
    }


async def collect_chunks(stream):
    return [chunk async for chunk in stream]
