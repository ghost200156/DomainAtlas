# Plan 02 — 性能修复：并行模块生成 + 收紧 timeout 和重试

> 状态：**已完成，正常路径达到目标**（2026-08-19）  
> 主要实现：`7a6d02a`、`b43b81d`、`53fea8b`、`77b574e`。

本文的“问题”描述的是优化前基线。当前已保留完整概念输出预算，并通过并行和明确的
重试边界改善延迟；没有通过截断概念输出换取表面速度。

## 问题

`build_atlas()` 串行等待每个模块生成完成，4 个模块叠加约 120 秒。
`_run_text` 超时硬编码 600 秒，重试层数过多（内层 5 次 × 外层 10 次）。
模型调用此前共享同一个 `max_tokens: 8192`，不同输出类型无法使用合适预算；概念卡片需要更大的结构化输出空间，短文本则不需要同等预算。

## 目标

- 4 模块场景从 ~120s 降到 ~30s
- 单次调用超时从 600s 降到 90s
- 重试总次数从理论 50 次降到合理范围
- 模块并行不引入跨模块上下文依赖问题（当前各模块输入独立，可直接并行）

## 涉及文件

- `backend/src/app/workflow/agents_per_module.py`
- `backend/src/app/workflow/orchestrator.py`

## 实现步骤

### 1. `build_atlas()` 模块并行 + 概览文本并行

```python
async def build_atlas(self, brief, plan, research_pack):
    evidence_by_module = {e.module_id: [] for e in research_pack.evidence}
    for e in research_pack.evidence:
        evidence_by_module[e.module_id].append(e)

    # 模块并行 + 概览文本同时跑
    concept_tasks = [
        self._build_concepts(brief, m.id, m.title, m.purpose, m.core_questions,
                             evidence=evidence_by_module.get(m.id, []))
        for m in plan.modules
    ]
    overview_task = self._run_text(
        f"撰写学习概览(200-300字)。领域:{brief.domain}。...",
        "课程设计师。写出有深度的学习概览。"
    )

    results = await asyncio.gather(
        *concept_tasks,
        overview_task,
        return_exceptions=True,
    )
    concept_results = results[:-1]
    center_text_raw = results[-1]

    center_text = (
        center_text_raw
        if isinstance(center_text_raw, str)
        else plan.domain_definition
    )
    ...
```

### 2. 统一 timeout，消除硬编码 600s

```python
class LiveAgentPipeline:
    def __init__(self, settings, timeout_seconds=180, ...):
        self.timeout_seconds = timeout_seconds
        self.text_timeout = min(timeout_seconds, 90)   # ← 新增，文本生成用更短的

    async def _run_text(self, prompt, sys_prompt="用中文回复。"):
        agent = Agent(
            self.model,
            system_prompt=sys_prompt,
            model_settings=self.text_settings,
            retries=0,
        )
        result = await asyncio.wait_for(
            agent.run(prompt),
            timeout=self.text_timeout   # ← 从 600 改为 90
        )
```

### 3. `_build_concepts` 重试从 5 次降到 2 次

```python
for attempt in range(2):   # ← 从 5 改为 2
    ...
    agent = Agent(..., retries=0)
    result = await asyncio.wait_for(agent.run(prompt), timeout=self.text_timeout)
    ...
    if attempt < 1:
        await asyncio.sleep(2)
```

### 4. orchestrator 外层重试从 10 次降到 3 次

```python
# orchestrator.py generate_atlas()
for attempt in range(3):   # ← 从 10 改为 3
    try:
        candidate = await self._pipeline().build_atlas(...)
        break
    except Exception as error:
        logger.warning("Atlas attempt %d failed: %s", attempt + 1, error)
        await asyncio.sleep(2)   # ← sleep 从 3 改为 2
```

### 5. 使用分级 token budget

```python
self.concept_settings = {
    "max_tokens": 8192,  # two to three complete concept cards per module
    "extra_body": {"thinking": {"type": "disabled"}},
}
self.structured_settings = {
    "max_tokens": 4096,  # planning, research, and review schemas
    "extra_body": {"thinking": {"type": "disabled"}},
}
self.text_settings = {
    "max_tokens": 2048,  # overview, tutor, and other short prose
    "extra_body": {"thinking": {"type": "disabled"}},
}
```

三个 settings 字典彼此独立，避免并发请求共享或修改同一个可变对象。概念输出保留 8192 预算以容纳 2–3 张完整概念卡片；结构化文档使用 4096；短文本使用 2048。这样不会把 2048 的限制施加到概念 schema，也不会让短文本继承过大的预算。

### 6. 明确内部与外部重试边界

- `_run()`、`_build_concepts()` 和 `_run_text()` 创建的 Pydantic Agent 都显式设置
  `retries=0`，不发生隐藏的 output/tool validation retry。
- `_build_concepts()` 保留可观测的模块级外层重试：最多 2 次模型调用，均失败后使用
  该模块的 fallback。
- `generate_atlas()` 保留最多 3 次整图尝试，但模块级普通失败会在 `build_atlas()` 内部
  降级，不会触发整图重跑；整图重试只处理未被局部隔离的异常。
- provider/HTTP transport retry 不由 Pydantic Agent 的 `retries` 参数控制。

### 7. 收紧概念输出契约，同时保留教学完整性

当前每个模块要求：

- 生成 2–3 个概念；
- `definition` 为 120–220 字；
- `why_it_matters` 为一句话；
- `key_points` 恰好 2 条，每条不超过 30 字；
- `example` 包含 2–3 道题，每题包含题干、`【解】` 和答案，总长 150–250 字；
- 概念生成仍使用 8192 token budget，不用 token 截断替代输出契约设计。

同时移除了 `"你是RISC-V技术讲师"` 这一领域硬编码，改用通用领域教学 system prompt，
避免非 RISC-V 主题受到错误角色约束。

## 注意事项

- 并行请求通过共享 semaphore 限制 provider 并发，默认 5 路可覆盖 4 个模块加概览；如果 provider 的实际限制更低，可通过 `max_concurrent_requests` 调小
- `return_exceptions=True` 确保一个模块失败不会中断其他模块
- 单模块最坏应用层等待约为 `90s + 2s + 90s = 182s`；模块并行执行，不按模块数顺序累加

## Benchmark 结果

测试使用相同的“Agent 系统设计”brief、4 模块 fixture plan 和 research pack，只测量
`LiveAgentPipeline.build_atlas()` 阶段。

| 版本/轮次 | Atlas 构建耗时 | 模型请求 | 概念数 | Fallback |
|---|---:|---:|---:|---:|
| main 优化前基线 | 166.828s | 5 | 13 | 0 |
| 优化后异常重试轮次 | 59.703s | 7 | 13 | 0 |
| `retries=0` 一致化后，第 1 轮 | 19.745s | 5 | 13 | 0 |
| `retries=0` 一致化后，第 2 轮 | 19.839s | 5 | 13 | 0 |

后两轮平均为 **19.792s**，正常无重试路径达到并优于 30–40 秒目标。两轮样本可以验证
当前正常路径，但不足以证明带失败重试情况下的 P95 延迟。

## 验收标准

- [x] 4 模块正常路径总耗时 < 60s，并达到 30–40s 目标
- [x] 正常路径恰好发出 5 个请求（4 模块 + 1 overview）
- [x] 单模块失败不影响其他模块结果
- [x] 概览文本失败时优雅降级到 `plan.domain_definition`
- [x] 内部 Agent retry 显式关闭，应用层重试次数和日志可观察

## 优先级

🔴 最高——用户体验直接可感知
