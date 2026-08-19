# Plan 04 — 提取 RunJournal：把状态变更逻辑从 orchestrator 分离

> 状态：**未开始**。实现依赖 Plan 07 的原子 `mutate()`；建议与 Plan 07 合并交付，
> 不要让新的 RunJournal 继续使用非原子的 `get() + save()` 写路径。

## 问题

`DemoOrchestrator` 同时负责调度和状态记录，混合了两种职责：

- `_checkpoint(run_id, step, message)` — 写进度事件，sleep
- `_fail(run_id, step, error)` — 写失败状态和错误事件
- `_use_fixture(run, stage, error)` — 写降级事件和 fallback_notes

这三个方法加起来约 60 行，每次修改事件结构或状态字段都要进 orchestrator 里翻。

## 目标

- 所有"向 run 写状态"的逻辑集中在 `RunJournal` 里
- Orchestrator 只调度，不直接操作 store 和事件列表
- RunJournal 可以用 fake store 单独测试

## 涉及文件

- 新建 `backend/src/app/workflow/run_journal.py`
- `backend/src/app/workflow/orchestrator.py`

## 实现步骤

### 1. 新建 `run_journal.py`

```python
# backend/src/app/workflow/run_journal.py
import asyncio
import logging
from app.schemas.demo import DemoError, RunEvent, RunStatus
from app.store import DemoStore

logger = logging.getLogger(__name__)


class RunJournal:
    def __init__(self, store: DemoStore, delay_seconds: float = 0.25):
        self.store = store
        self.delay_seconds = delay_seconds

    async def checkpoint(self, run_id: str, step: str, message: str) -> None:
        await self.store.mutate(
            run_id,
            lambda run: apply_checkpoint(run, step, message),
        )
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)

    async def fail(self, run_id: str, step: str, error: Exception) -> None:
        await self.store.mutate(
            run_id,
            lambda run: apply_failure(run, step, error),
        )

    async def fallback(self, run_id: str, stage: str, error: Exception | None,
                        agent_mode: str) -> None:
        if error is not None and agent_mode == "live":
            raise error
        await self.store.mutate(
            run_id,
            lambda run: apply_fallback(run, stage, error),
        )
```

`apply_checkpoint()`、`apply_failure()` 和 `apply_fallback()` 是同步 mutation helper；它们只
修改传入的 `DemoRun`。事件 ID 在 `mutate()` 持锁期间生成，避免并发追加产生重复 ID。

### 2. `DemoOrchestrator` 注入 RunJournal，删除三个私有方法

```python
class DemoOrchestrator:
    def __init__(self, store, delay_seconds=0.25, agent_mode=None,
                 settings=None, skill_registry=None):
        self.store = store
        self.settings = settings or get_settings()
        self.agent_mode = agent_mode or self.settings.demo_agent_mode
        self._skill_registry = skill_registry
        self._live_pipeline = None
        self._journal = RunJournal(store, delay_seconds)   # ← 注入

    # 删除 _checkpoint、_fail、_use_fixture
    # 改为调用 self._journal.checkpoint(...)
    #            self._journal.fail(...)
    #            self._journal.fallback(...)
```

## 验收标准

- `orchestrator.py` 里不再有任何直接操作 `run.events` 的代码
- `RunJournal` 用 `FakeStore`（内存字典）可以独立测试三条路径
- 所有 RunJournal 写路径均使用 `mutate()`，不保留 `get() + save()` 事务窗口
- 行为与重构前完全一致

## 优先级

🟡 中——不影响功能，提升可维护性
