from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.skills import SkillRegistry
from app.store import DemoStore
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.task_registry import TaskRegistry
from app.workflow.teaching import StudyController

configure_logging()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _skills_path = Path(settings.skills_dir)
    if not _skills_path.is_absolute():
        _skills_path = Path(__file__).resolve().parents[3] / settings.skills_dir
    app.state.store = DemoStore()
    app.state.skill_registry = SkillRegistry(_skills_path)
    app.state.orchestrator = DemoOrchestrator(
        app.state.store,
        skill_registry=app.state.skill_registry,
    )
    app.state.controller = StudyController(
        app.state.store,
        app.state.orchestrator.pipeline(),
    )
    app.state.tasks = TaskRegistry()
    yield


app = FastAPI(
    title="DomainAtlas Field Learning Assistant",
    description="A streaming field-learning assistant for building bounded, structured learning frameworks",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
