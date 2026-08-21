# Plan 03 — DI 接缝：建 dependencies.py，路由改用 Depends()

> 状态：**未开始**。应只采用 FastAPI lifespan + `app.state` 作为应用级对象所有者；
> 不采用先创建 request-scoped 对象、再切换到 `app.state` 的中间方案。

## 问题

`runs.py` 在模块导入时创建四个有状态单例：

```python
store = DemoStore()
skill_registry = SkillRegistry(_skills_path)
orchestrator = DemoOrchestrator(store, skill_registry=skill_registry)
tasks = TaskRegistry()
```

路由直接调用私有方法 `orchestrator._pipeline()`，穿越了模块边界。
无法为路由写测试——没有任何注入点可以替换这些依赖。

## 目标

- 所有有状态对象在 FastAPI lifespan 里创建，通过 `Depends()` 提供给路由
- 路由只声明依赖，不负责创建
- 测试时可以通过 `app.dependency_overrides` 替换任意依赖

## 涉及文件

- `backend/src/app/api/routes/runs.py`
- `backend/src/app/main.py`
- 新建 `backend/src/app/api/dependencies.py`

## 实现步骤

### 1. 新建 `dependencies.py`

```python
# backend/src/app/api/dependencies.py
from functools import lru_cache
from pathlib import Path
from fastapi import Depends
from app.core.config import Settings, get_settings
from app.store import DemoStore
from app.skills import SkillRegistry
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.task_registry import TaskRegistry

def get_store() -> DemoStore:
    return DemoStore()

def get_skill_registry(settings: Settings = Depends(get_settings)) -> SkillRegistry:
    path = Path(settings.skills_dir)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[4] / path
    return SkillRegistry(path)

def get_orchestrator(
    store: DemoStore = Depends(get_store),
    skill_registry: SkillRegistry = Depends(get_skill_registry),
) -> DemoOrchestrator:
    return DemoOrchestrator(store, skill_registry=skill_registry)

def get_task_registry() -> TaskRegistry:
    return TaskRegistry()
```

### 2. `main.py` 加 lifespan，在应用级持有单例

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 应用启动时创建，整个进程共享
    app.state.store = DemoStore()
    app.state.skill_registry = SkillRegistry(...)
    app.state.orchestrator = DemoOrchestrator(
        app.state.store,
        skill_registry=app.state.skill_registry,
    )
    app.state.tasks = TaskRegistry()
    yield
    # 关闭时清理（如有需要）

app = FastAPI(lifespan=lifespan)
```

### 3. `dependencies.py` 改为从 app.state 读取

```python
from fastapi import Request

def get_store(request: Request) -> DemoStore:
    return request.app.state.store

def get_orchestrator(request: Request) -> DemoOrchestrator:
    return request.app.state.orchestrator

def get_tasks(request: Request) -> TaskRegistry:
    return request.app.state.tasks
```

### 4. `runs.py` 删除模块级单例，路由加 Depends

```python
# 删除这四行
# store = DemoStore()
# skill_registry = SkillRegistry(...)
# orchestrator = DemoOrchestrator(...)
# tasks = TaskRegistry()

@router.post("/runs", ...)
async def create_run(
    brief: LearningBrief,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
    tasks: TaskRegistry = Depends(get_tasks),
) -> DemoRun:
    ...
```

### 5. `DemoOrchestrator` 把 `_pipeline()` 改为公开方法

```python
# 把 _pipeline 改为 pipeline（去掉下划线）
def pipeline(self) -> LiveAgentPipeline:
    if self._live_pipeline is None:
        self._live_pipeline = LiveAgentPipeline(...)
    return self._live_pipeline
```

路由里所有 `orchestrator._pipeline()` 改为 `orchestrator.pipeline()`。

## 验收标准

- `runs.py` 顶层没有任何对象实例化
- 所有路由通过 `Depends()` 获取依赖
- 测试可以用 `app.dependency_overrides[get_store] = lambda: FakeStore()` 注入 fake

## 优先级

🟠 高——后续所有测试和重构的基础
