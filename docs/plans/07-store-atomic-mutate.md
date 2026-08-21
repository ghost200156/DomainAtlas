# Plan 07 — store.py 原子写入：加 mutate() 防止并发状态覆盖

> 状态：**未开始**。建议与 Plan 04 一起交付：先提供原子 mutation，再让 RunJournal
> 成为状态和事件写入的唯一入口。

## 问题

`DemoStore` 当前只锁住单次文件替换，没有覆盖 read-modify-write 完整事务：

```python
async def save(self, run: DemoRun) -> DemoRun:
    async with self._lock:   # ← 只锁文件写入
        ...
```

典型的竞态：
1. 任务 A `get(run_id)` → 读到 events=[e1, e2]
2. 任务 B `get(run_id)` → 也读到 events=[e1, e2]
3. 任务 A `save(run)` → 写入 events=[e1, e2, e3]
4. 任务 B `save(run)` → 写入 events=[e1, e2, e4]，e3 丢失

事件 ID 用 `len(run.events) + 1` 生成，并发时会产生重复 ID。
当前 demo 规模下单用户不出问题，后台并行任务（_pre_search_all_sources）引入后风险上升。

## 目标

- 提供 `mutate(run_id, callback)` 方法，在锁内完成 read-modify-write
- 事件 ID 改为在 mutate 内部生成，保证单调递增无重复
- 所有写操作逐步迁移到 `mutate()`

## 涉及文件

- `backend/src/app/store.py`

## 实现步骤

### 1. 在 `DemoStore` 加 `mutate()` 方法

```python
from collections.abc import Callable

class DemoStore:
    ...

    async def mutate(
        self,
        run_id: str,
        callback: Callable[[DemoRun], DemoRun | None],
    ) -> DemoRun:
        """在锁内完成 read-modify-write，防止并发覆盖。"""
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
```

### 2. 提供辅助函数 `append_event()`

```python
def append_event(run: DemoRun, type: str, step: str, message: str) -> None:
    """在 mutate callback 里安全追加事件，ID 由当前长度决定。"""
    run.events.append(RunEvent(
        id=len(run.events) + 1,
        type=type, step=step, message=message,
    ))
```

### 3. `RunJournal` 改用 `mutate()`

```python
async def checkpoint(self, run_id: str, step: str, message: str) -> None:
    await self.store.mutate(run_id, lambda run: (
        setattr(run, 'current_step', step) or
        append_event(run, "progress", step, message) or run
    ))
```

## 注意事项

- 现有 `get()` + `save()` 接口保留，不破坏现有调用方
- `mutate()` 复用同一个 `self._lock`，和 `save()` 互斥
- 短期内优先改 RunJournal 里的写操作，其他地方逐步迁移

## 验收标准

- 并发两个 `mutate()` 调用，事件不丢失、ID 不重复
- 现有 `get()` / `save()` 调用不报错
- 通过简单并发测试验证

## 优先级

🟡 中——当前 demo 不出问题，并行任务增多后是真实风险
