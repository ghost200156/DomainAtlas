import asyncio
import logging

from app.workflow.task_registry import TaskRegistry


def test_background_task_failure_is_logged(caplog) -> None:
    async def scenario() -> None:
        async def fail() -> None:
            raise RuntimeError("background boom")

        registry = TaskRegistry()
        with caplog.at_level(logging.ERROR, logger="app.workflow.task_registry"):
            registry.start("broken-task", fail())
            await asyncio.sleep(0)
            await asyncio.sleep(0)

    asyncio.run(scenario())

    assert "Background task broken-task failed with RuntimeError" in caplog.text
    assert "background boom" in caplog.text
