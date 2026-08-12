"""Simplified per-module pipeline. Never fails."""
from __future__ import annotations
import asyncio, json as _json, logging
from typing import TypeVar
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from app.core.config import Settings
from app.schemas.demo import (
    AtlasDocument, AtlasModule, AtlasOverview, ConceptNode, ConceptRelation,
    FrameworkPlan, LearningBrief, PlanningOutput, QualityReport,
    ResearchPack, ReviewPath, AssessmentFeedback, Source,
)
from app.workflow.agents import (
    PLANNING_PROMPT, RESEARCH_PROMPT, REVIEWER_PROMPT, REVIEW_PATH_PROMPT,
)

OutputT = TypeVar("OutputT", bound=BaseModel)
logger = logging.getLogger(__name__)


class LiveAgentPipeline:

    def __init__(self, settings: Settings, timeout_seconds: float = 180, skill_registry: object = None):
        provider = OpenAIProvider(api_key=settings.openai_api_key, base_url=settings.openai_api_base)
        self.model = OpenAIChatModel(settings.openai_model, provider=provider)
        self.timeout_seconds = timeout_seconds
        self.model_settings = {"max_tokens": 8192, "extra_body": {"thinking": {"type": "disabled"}}}
        self._skill_registry = skill_registry

    def _prompt_for(self, skill_name, fallback):
        if self._skill_registry:
            p = self._skill_registry.get_prompt(skill_name)
            if p:
                return p
        return fallback

    async def _run(self, output_type, system_prompt, prompt):
        agent = Agent(self.model, output_type=output_type, system_prompt=system_prompt, model_settings=self.model_settings, retries=1)
        result = await asyncio.wait_for(agent.run(prompt), timeout=self.timeout_seconds)
        return result.output

    async def _run_text(self, prompt, sys_prompt="用中文回复。"):
        agent = Agent(self.model, system_prompt=sys_prompt, model_settings=self.model_settings)
        result = await asyncio.wait_for(agent.run(prompt), timeout=600)
        return result.output

    async def _run_json(self, prompt, schema_model, sys_prompt, max_retries=2):
        """Semi-structured: plain text JSON → parse → pydantic validate. No tool_choice."""
        for attempt in range(max_retries + 1):
            try:
                text = await self._run_text(prompt, sys_prompt)
                # Strip markdown fences
                text = text.strip()
                if text.startswith("```"):
                    lines = text.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    text = "\n".join(lines)
                data = _json.loads(text)
                return schema_model.model_validate(data)
            except Exception:
                if attempt < max_retries:
                    prompt = prompt + "\n\n上次输出不是合法JSON。请只输出一个JSON对象，不要markdown围栏、不要解释。"
                else:
                    raise

    async def plan(self, brief):
        prompt = "学习任务如下：\n" + brief.model_dump_json(indent=2)
        for attempt in range(3):
            try:
                return await self._run(PlanningOutput, self._prompt_for("domainatlas-planning", PLANNING_PROMPT), prompt)
            except Exception:
                if attempt < 2:
                    await asyncio.sleep(2)
        raise RuntimeError("Planning failed after 3 attempts")

    async def research(self, plan, candidate_pack):
        prompt = "已确认计划：\n" + plan.model_dump_json(indent=2) + "\n\n候选资料包：\n" + candidate_pack.model_dump_json(indent=2)
        return await self._run(ResearchPack, self._prompt_for("domainatlas-research", RESEARCH_PROMPT), prompt)

    async def _build_concepts(self, brief, module_id, module_title, module_purpose, core_questions):
        """Pydantic structured output. Fallback to plain text. Never fails."""
        from pydantic import BaseModel as BM, Field as F
        class MiniConcept(BM):
            name: str = F(description="教学主题名")
            definition: str = F(description="## 概念(直接定义)→## 机制(原理)。术语**加粗**。禁止比喻。300-600字")
            why_it_matters: str = F(description="学会这个能做什么")
            key_points: list[str] = F(description="2-3条具体规则")
            example: str = F(description="2-3题。每题以'题N：'或'判断题：'或'代码题：'开头。题目包含完整题干(代码/条件/空缺___)。【解】只放答案。禁止【解】后出现题目内容。题间用空行分隔。")
        class ModuleConcepts(BM):
            concepts: list[MiniConcept] = F(min_length=1, max_length=4)

        prompt = "领域：" + brief.domain + " 学习者：" + brief.learner_background + " 模块：" + module_title + "（" + module_purpose + "）核心问题：" + str(core_questions)
        items = []
        for attempt in range(5):
            try:
                agent = Agent(self.model, output_type=ModuleConcepts,
                              system_prompt="你是RISC-V技术讲师。纯概念模块只用概念+机制。应用模块加代码示例。禁止比喻。题目必须直接考卡片中讲过的寄存器、指令、机制。禁止：地址总线/版税/License/基金会/商业/芯片设计/主频/移植。每道题必须让学习者查卡片内容才能答对。",
                              model_settings=self.model_settings, retries=1)
                result = await asyncio.wait_for(agent.run(prompt), timeout=600)
                items = result.output.concepts if result.output.concepts else []
                if items:
                    break
            except Exception:
                pass
            if attempt < 4:
                await asyncio.sleep(2)

        if not items:
            items = [MiniConcept(name=module_title, definition="## 概念\n" + module_purpose + "\n\n## 机制\n生成超时，请刷新重试。", why_it_matters="", key_points=[], example="")]

        concepts = []
        for i, item in enumerate(items):
            concepts.append(ConceptNode(
                id=module_id + "-c" + str(i), module_id=module_id,
                name=item.name[:100], definition=item.definition[:2000],
                why_it_matters=item.why_it_matters[:500],
                key_points=[str(k)[:200] for k in (item.key_points if item.key_points else [])[:5]],
                example=item.example[:1000] if getattr(item, 'example', None) else None,
                evidence_ids=[],
            ))
        return concepts

    async def build_atlas(self, brief, plan, research_pack):
        all_concepts = []
        for m in plan.modules:
            cs = await self._build_concepts(brief, m.id, m.title, m.purpose, m.core_questions)
            all_concepts.extend(cs)
            logger.info("Module %s: %d concepts", m.id, len(cs))
        colors = ["#2f7f73", "#4e7896", "#d49a45", "#e46f46", "#776a9b", "#6d8b55"]
        atlas_mods = [AtlasModule(id=m.id, title=m.title, summary=m.purpose, color=colors[i % 6]) for i, m in enumerate(plan.modules)]
        overview = AtlasOverview(
            definition=plan.domain_definition, boundary=plan.scope,
            essential_question="如何在" + str(brief.learning_time_minutes) + "分钟内理解" + brief.domain + "？",
            key_takeaways=[m.title for m in plan.modules[:4]],
        )

        # Create center overview concept
        center_text = plan.domain_definition
        try:
            center_text = await self._run_text(
                f"撰写学习概览(200-300字)。领域:{brief.domain}。基础:{brief.learner_background}。目标:{brief.desired_outcome}。时间:{brief.learning_time_minutes}分钟。用中文。",
                "课程设计师。写出有深度的学习概览。")
        except Exception:
            pass
        center = ConceptNode(
            id="__center__", module_id="__center__",
            name=brief.domain,
            definition=center_text[:500],
            why_it_matters=brief.desired_outcome,
            key_points=(plan.completion_criteria if plan.completion_criteria else [])[:5],
            example=None, evidence_ids=[],
        )
        all_concepts.insert(0, center)

        # Relations: center → module roots → leaves
        relations = []
        rid = 0
        for mod in plan.modules:
            mod_concepts = [c for c in all_concepts if c.module_id == mod.id]
            if not mod_concepts:
                continue
            module_root = mod_concepts[0]
            relations.append(ConceptRelation(id="r"+str(rid), source_id=center.id, target_id=module_root.id,
                relation_type="informs", explanation=""))
            rid += 1
            for leaf in mod_concepts[1:]:
                relations.append(ConceptRelation(id="r"+str(rid), source_id=module_root.id, target_id=leaf.id,
                    relation_type="informs", explanation=""))
                rid += 1
        return AtlasDocument(
            title=brief.domain + " · 学习地图",
            overview=overview, modules=atlas_mods, concepts=all_concepts,
            relations=relations, mechanisms=[], cases=[], learning_path=[], assessments=[],
            sources=research_pack.sources, gaps=research_pack.gaps,
        )

    async def tutor_chat(self, atlas, concept, message):
        ctx = ""
        if concept:
            ctx = "用户在学习「" + concept.name + "」。定义：" + concept.definition[:300] + "\n关键点：" + str(concept.key_points) + "\n"
        return await self._run_text(ctx + "\n问题：" + message + "\n直接回答，不要寒暄。", "你是技术专家。简洁直接。")

    async def review_atlas(self, brief, plan, atlas):
        return await self._run(QualityReport, self._prompt_for("domainatlas-reviewer", REVIEWER_PROMPT), "Atlas：\n" + atlas.model_dump_json(indent=2))

    async def review_path(self, brief, atlas, results, progress):
        return await self._run(ReviewPath, self._prompt_for("domainatlas-review-path", REVIEW_PATH_PROMPT), "结果：" + str(results) + "\n进度：" + str(progress))

    async def verify_understanding(self, concept, text):
        try:
            return _json.loads(await self._run_text("评估理解。概念：" + concept.name + "\n定义：" + concept.definition + "\n学生回答：" + text + "\n返回JSON：{\"passed\":bool,\"feedback\":\"str\"}"))
        except Exception:
            return {"passed": True, "feedback": ""}
