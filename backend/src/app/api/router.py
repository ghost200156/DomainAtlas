from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.health import router as health_router
from app.api.routes.runs import router as runs_router

router = APIRouter()
router.include_router(agent_router)
router.include_router(health_router)
router.include_router(runs_router)
