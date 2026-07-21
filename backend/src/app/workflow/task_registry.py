import asyncio
from collections.abc import Coroutine
from typing import Any


class TaskRegistry:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def start(self, key: str, coroutine: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
        existing = self._tasks.get(key)
        if existing and not existing.done():
            coroutine.close()
            return existing

        task = asyncio.create_task(coroutine, name=key)
        self._tasks[key] = task
        task.add_done_callback(lambda completed: self._finish(key, completed))
        return task

    def is_active(self, key: str) -> bool:
        task = self._tasks.get(key)
        return bool(task and not task.done())

    def _finish(self, key: str, task: asyncio.Task[None]) -> None:
        self._tasks.pop(key, None)
        if not task.cancelled():
            task.exception()
