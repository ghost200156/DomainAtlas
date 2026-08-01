import json

from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from app.api.routes import agent as agent_route
from app.main import app


def test_agent_endpoint_streams_a_complete_ai_sdk_response(monkeypatch):
    monkeypatch.setattr(
        agent_route,
        "create_domain_learning_agent",
        lambda: Agent(TestModel()),
    )

    response = TestClient(app).post(
        "/agent",
        json={"messages": [{"role": "user", "parts": [{"type": "text", "text": "hello"}]}]},
    )

    payloads = [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert payloads[0]["type"] == "text-start"
    assert any(payload["type"] == "text-delta" for payload in payloads)
    assert payloads[-2:] == [
        {"type": "finish-step"},
        {"type": "finish", "finishReason": "stop"},
    ]
