import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path
from collections.abc import Callable

from app.schemas.demo import DemoRun


class DemoStore:
    def __init__(self, root: Path | None = None) -> None:
        configured_root = os.getenv("DOMAINATLAS_DATA_DIR", "data/runs")
        self.root = root or Path(configured_root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    def _path(self, run_id: str) -> Path:
        return self.root / f"{run_id}.json"

    async def save(self, run: DemoRun) -> DemoRun:
        run.updated_at = datetime.now(UTC)
        payload = run.model_dump_json(indent=2)
        path = self._path(run.id)
        temporary_path = path.with_suffix(".json.tmp")

        async with self._lock:
            await asyncio.to_thread(temporary_path.write_text, payload, encoding="utf-8")
            await asyncio.to_thread(temporary_path.replace, path)
        return run

    async def mutate(
        self,
        run_id: str,
        callback: "Callable[[DemoRun], DemoRun | None]",
    ) -> DemoRun:
        async with self._lock:
            path = self._path(run_id)
            if not path.exists():
                raise KeyError(run_id)
            payload = await asyncio.to_thread(path.read_text, encoding="utf-8")
            run = DemoRun.model_validate_json(payload)

            result = callback(run)
            updated = result if result is not None else run

            updated.updated_at = datetime.now(UTC)
            new_payload = updated.model_dump_json(indent=2)
            tmp = path.with_suffix(".json.tmp")
            await asyncio.to_thread(tmp.write_text, new_payload, encoding="utf-8")
            await asyncio.to_thread(tmp.replace, path)
        return updated

    async def get(self, run_id: str) -> DemoRun:
        path = self._path(run_id)
        if not path.exists():
            raise KeyError(run_id)
        payload = await asyncio.to_thread(path.read_text, encoding="utf-8")
        return DemoRun.model_validate_json(payload)

    async def list_runs(self) -> list[DemoRun]:
        paths = sorted(self.root.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
        return [DemoRun.model_validate_json(await asyncio.to_thread(path.read_text, encoding="utf-8")) for path in paths]
