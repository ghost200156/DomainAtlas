from fastapi import Request

from app.store import DemoStore
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.task_registry import TaskRegistry
from app.workflow.teaching import StudyController


def get_store(request: Request) -> DemoStore:
    return request.app.state.store


def get_orchestrator(request: Request) -> DemoOrchestrator:
    return request.app.state.orchestrator


def get_tasks(request: Request) -> TaskRegistry:
    return request.app.state.tasks


def get_controller(request: Request) -> StudyController:
    return request.app.state.controller
