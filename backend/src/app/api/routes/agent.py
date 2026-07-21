import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agent.factory import build_agent_message_history, create_domain_learning_agent
from app.schemas.chat import ChatMessageRequest
from app.streaming.ai_sdk_protocol import to_data_stream_protocol
from app.streaming.message_adapter import convert_vercel_messages_to_pydantic

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])


def _chunk(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/agent")
async def chat_with_agent(request: ChatMessageRequest) -> StreamingResponse:
    try:
        agent = create_domain_learning_agent()
        prompt, history = convert_vercel_messages_to_pydantic(request.messages)
        history = build_agent_message_history(history)

        async def stream_response():
            try:
                async with agent.iter(prompt, message_history=history) as agent_run:
                    async for node in agent_run:
                        async for chunk in to_data_stream_protocol(node, agent_run):
                            yield chunk
                yield _chunk({"type": "finish-step"})
                yield _chunk({"type": "finish", "finishReason": "stop"})
            except Exception:
                logger.exception("Agent stream failed")
                error_id = "error-text"
                yield _chunk({"type": "text-start", "id": error_id})
                yield _chunk({"type": "text-delta", "id": error_id,
                              "delta": "I apologize, but the agent could not complete this request."})
                yield _chunk({"type": "text-end", "id": error_id})
                yield _chunk({"type": "finish-step"})
                yield _chunk({"type": "finish", "finishReason": "error"})

        response = StreamingResponse(stream_response(), media_type="text/event-stream")
        response.headers["Cache-Control"] = "no-cache"
        response.headers["Connection"] = "keep-alive"
        response.headers["X-Accel-Buffering"] = "no"
        response.headers["X-Vercel-AI-UI-Message-Stream"] = "v1"
        return response
    except Exception as exc:
        logger.exception("Chat endpoint failed before streaming started")
        raise HTTPException(status_code=500, detail="The agent could not start this request.") from exc
