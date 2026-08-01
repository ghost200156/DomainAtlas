from app.schemas.demo import (
    Assessment,
    AtlasDocument,
    AtlasModule,
    AtlasOverview,
    BriefCalibration,
    CaseStudy,
    ConceptNode,
    ConceptRelation,
    EvidenceItem,
    FrameworkModule,
    FrameworkPlan,
    LearningBrief,
    LearningStage,
    Mechanism,
    QualityReport,
    ResearchPack,
    Source,
)


AGENT_SYSTEM_CONCEPTS: dict[str, list[tuple[str, str, str, str]]] = {
    "agent-architecture": [
        ("agent-loop", "感知—决策—行动闭环", "Agent 持续把用户或环境信息转成决策，执行动作，再把结果带入下一轮决策。", "这是 Agent 区别于一次性问答的基本结构，也是定位循环失控和结果断链的起点。"),
        ("llm-controller", "LLM 控制器", "模型读取目标、上下文和工具说明，决定直接回答、调用工具或继续分解任务。", "它负责非确定性判断，但不应承担权限控制、持久化和外部副作用。"),
        ("task-planning", "任务规划", "把宽泛目标拆成有顺序、可检查的子目标，并在获得新信息后调整下一步。", "清晰的子目标能减少无效调用，并让执行过程可以被观察和评估。"),
        ("tool-executor", "工具执行器", "确定性运行时接收工具调用，校验参数、执行外部操作并返回结构化结果。", "将模型判断与真实执行分离，才能控制错误、权限和副作用。"),
        ("termination", "停止条件", "用成功、失败、预算耗尽和最大循环次数定义 Agent 何时结束运行。", "没有明确停止条件的 Agent 容易无限重试、提前结束或产生不可控成本。"),
        ("system-boundary", "系统边界", "明确模型、程序逻辑、外部工具和人工确认各自负责什么。", "边界清晰后，系统才容易调试，也能把高风险决策留给确定性规则或人。"),
    ],
    "tool-calling": [
        ("tool-schema", "工具 Schema", "用名称、用途、类型化参数和返回值描述一个可供模型选择的能力。", "Schema 决定模型能否准确理解工具边界，也是参数校验和可维护性的基础。"),
        ("tool-selection", "工具选择", "控制器根据当前子目标判断应调用哪个工具，还是无需工具直接回答。", "正确选择不仅看能力是否匹配，还要考虑必要性、权限、成本和风险。"),
        ("argument-validation", "参数校验", "执行前检查必填项、类型、范围、格式和调用者权限。", "模型输出并不可信，校验层能在副作用发生前拦截大部分可预见错误。"),
        ("execution-isolation", "执行隔离", "在受控运行环境中限制网络、文件、时间和可产生的副作用。", "隔离能把一次错误调用的影响限制在可恢复范围内。"),
        ("result-injection", "结果回注", "把工具结果或错误以保留来源和语义的结构重新写入模型上下文。", "高质量回注让模型区分事实、错误和缺失信息，避免基于模糊文本继续推理。"),
        ("retry-policy", "超时与重试", "区分暂时性与永久性失败，限制重试次数，并为有副作用的调用设计幂等策略。", "重试策略决定系统面对网络抖动和服务故障时是恢复、降级还是放大问题。"),
    ],
    "state-management": [
        ("working-memory", "工作记忆", "保存当前子目标、最近观察和下一步所需的最小信息。", "工作记忆让模型聚焦当前决策，避免每一步都重读完整历史。"),
        ("message-history", "消息历史", "按因果顺序记录用户、模型和工具消息。", "完整的消息序列便于复现决策，但需要与结构化任务状态区分。"),
        ("structured-state", "结构化状态", "用明确字段保存计划、已完成步骤、产物、预算和待解决问题。", "结构化状态比自然语言记忆更稳定，也更适合程序检查和恢复。"),
        ("checkpointing", "检查点恢复", "在关键阶段持久化可恢复快照，使运行能从已确认状态继续。", "检查点避免失败后从头重放昂贵或有副作用的步骤。"),
        ("context-compaction", "上下文压缩", "总结或裁剪旧信息，同时保留约束、证据、未决问题和关键决策。", "压缩控制上下文长度与成本，但必须防止重要条件在摘要中丢失。"),
        ("state-consistency", "状态一致性", "保证模型看到的上下文、运行时状态和工具产生的真实结果彼此一致。", "状态分叉会让 Agent 重复执行、误判进度，甚至对已发生的副作用失去认知。"),
    ],
    "evaluation-loop": [
        ("success-criteria", "成功标准", "把任务目标写成可观察、可判断的完成条件。", "没有成功标准，Agent 和评估器都无法区分看似合理与真正完成。"),
        ("trajectory-evaluation", "轨迹评估", "检查规划、动作选择和工具调用序列是否合理、合规且高效。", "即使最终答案正确，错误轨迹仍可能暴露偶然成功、安全风险或高成本。"),
        ("outcome-evaluation", "结果评估", "检查最终答案或产物的正确性、完整性和可用性。", "结果评估直接对应用户价值，并与过程评估形成互补。"),
        ("failure-taxonomy", "失败分类", "把失败区分为规划、工具、事实依据、状态和评估等类型。", "稳定的分类能把模糊的坏体验转成可定位、可统计的工程问题。"),
        ("regression-set", "回归测试集", "保存代表性任务、预期信号和已知失败案例，在提示词、模型或工具变化后重复运行。", "回归集能发现局部优化导致的能力退化，是迭代 Agent 的最低质量护栏。"),
        ("human-review", "人工审阅", "由人处理高风险、歧义大或需要价值判断的结果，并沉淀反馈标签。", "人类审阅既是安全出口，也是建立高质量评估样本的重要来源。"),
    ],
    "integration-demo": [
        ("vertical-slice", "最小垂直切片", "选择一个真实任务，贯通模型、工具、状态和评估，而不是分别展示孤立模块。", "垂直切片能以最少功能证明系统闭环，适合 Demo 阶段控制范围。"),
        ("scenario-contract", "演示任务契约", "固定输入、期望结果、允许工具、完成条件和失败条件。", "明确契约能让每次演示可比较，也防止为了临场成功不断改变目标。"),
        ("observable-trace", "可观测执行轨迹", "清楚展示当前阶段、工具调用、状态变化、结果和错误。", "观众能看见 Agent 如何完成任务，开发者也能迅速定位失败发生在哪一层。"),
        ("deterministic-fallback", "确定性降级", "模型或网络不可用时，用明确标记的演示资料保留可体验的完整流程。", "降级保障 Demo 可展示，但必须诚实区分真实生成内容与固定资料。"),
        ("latency-budget", "延迟与成本预算", "限制调用次数、Token、重试和每阶段等待时间。", "预算让演示节奏可控，也提前暴露完整产品化前必须解决的效率问题。"),
        ("demo-acceptance", "演示验收脚本", "用固定操作步骤和预期界面、数据结果验证端到端体验。", "可重复的验收脚本比临场点击更可靠，也能成为后续自动化测试的雏形。"),
    ],
}


def make_calibration(brief: LearningBrief) -> BriefCalibration:
    return BriefCalibration(
        interpretation=f"用 {brief.learning_time_minutes} 分钟建立对「{brief.domain}」的可操作认知地图。",
        scope_assessment="suitable",
        rationale="Demo 将范围压缩为基本结构、工作机制、实践方法和质量判断四层。",
        suggested_scope=brief.confirmed_scope or f"{brief.domain} 的入门框架与最小实践闭环",
        questions=[],
        warnings=["这是演示版框架，资料与结论需要在真实研究流程中进一步核验。"],
        can_generate_plan=True,
    )


def make_plan(brief: LearningBrief) -> FrameworkPlan:
    domain = brief.domain
    modules = [
        FrameworkModule(
            id="foundations",
            title="地形：基本构成",
            purpose=f"建立 {domain} 的共同语言与边界。",
            priority="core",
            core_questions=[f"{domain} 解决什么问题？", "它由哪些核心要素组成？", "它的适用边界在哪里？"],
        ),
        FrameworkModule(
            id="mechanisms",
            title="路径：运行机制",
            purpose="理解各要素如何连接成可执行的工作循环。",
            priority="core",
            core_questions=["信息如何流动？", "关键决策发生在哪里？", "哪些机制决定结果质量？"],
        ),
        FrameworkModule(
            id="practice",
            title="营地：实践方法",
            purpose="把概念落到一个可演示的最小任务。",
            priority="important",
            core_questions=["怎样开始第一次实践？", "常见失败模式是什么？", "需要哪些方法或工具？"],
        ),
        FrameworkModule(
            id="quality",
            title="标尺：质量判断",
            purpose="形成判断结果是否可信、有效的检查方法。",
            priority="important",
            core_questions=["怎样定义完成？", "如何发现并修正偏差？", "如何验证理解而不是记忆术语？"],
        ),
    ]
    return FrameworkPlan(
        goal_summary=brief.desired_outcome,
        domain_definition=f"本次把 {domain} 视为一套从目标、信息到行动和反馈的系统。",
        scope=brief.confirmed_scope or f"聚焦 {domain} 的基本结构、机制、实践与评估。",
        exclusions=brief.exclusions,
        modules=modules,
        evidence_requirements=["核心概念需有来源", "重要判断需能追溯", "标记未解决的知识缺口"],
        learning_sequence=[module.id for module in modules],
        estimated_concepts=len(modules) * 6,
        estimated_minutes=brief.learning_time_minutes,
        completion_criteria=["能复述系统结构", "能解释关键循环", "能完成一次自测"],
    )


def make_research_pack(plan: FrameworkPlan) -> ResearchPack:
    sources = [
        Source(
            id="source-architecture",
            title="Architecture Patterns: Concepts and Trade-offs",
            url="https://example.com/architecture-patterns",
            publisher="DomainAtlas Demo Library",
            trust_tier="B",
        ),
        Source(
            id="source-workflow",
            title="From Goal to Feedback: A Workflow Primer",
            url="https://example.com/workflow-primer",
            publisher="DomainAtlas Demo Library",
            trust_tier="B",
        ),
        Source(
            id="source-practice",
            title="Building a Small, Verifiable Prototype",
            url="https://example.com/verifiable-prototype",
            publisher="DomainAtlas Demo Library",
            trust_tier="B",
        ),
        Source(
            id="source-evaluation",
            title="Evaluation Loops for Intelligent Systems",
            url="https://example.com/evaluation-loops",
            publisher="DomainAtlas Demo Library",
            trust_tier="B",
        ),
    ]
    evidence = [
        EvidenceItem(
            id=f"evidence-{module.id}",
            source_id=sources[index % len(sources)].id,
            module_id=module.id,
            statement=f"{module.title} 需要同时呈现概念、连接与可验证结果。",
            excerpt="A useful map connects definitions, relationships, action, and feedback.",
            evidence_type="viewpoint",
            confidence="medium",
        )
        for index, module in enumerate(plan.modules)
    ]
    return ResearchPack(
        sources=sources,
        evidence=evidence,
        gaps=["演示资料为固定样例，正式版本需要接入真实检索与来源评级。"],
    )


def make_atlas(
    brief: LearningBrief,
    plan: FrameworkPlan,
    research: ResearchPack,
) -> AtlasDocument:
    default_module_ids = {"foundations", "mechanisms", "practice", "quality"}
    if {module.id for module in plan.modules} != default_module_ids:
        return _make_plan_aligned_atlas(brief, plan, research)

    concepts = [
        ConceptNode(
            id="goal",
            module_id="foundations",
            name="目标与边界",
            definition="明确系统要解决的问题、服务对象以及本次不处理的内容。",
            why_it_matters="边界决定后续研究和生成是否聚焦。",
            evidence_ids=["evidence-foundations"],
            misconception="把宽泛主题直接当作可执行目标。",
        ),
        ConceptNode(
            id="model",
            module_id="foundations",
            name="领域模型",
            definition="用一组核心实体和关系表达领域的稳定结构。",
            why_it_matters="它让不同模块共享同一套语言。",
            evidence_ids=["evidence-foundations"],
        ),
        ConceptNode(
            id="planning",
            module_id="mechanisms",
            name="任务规划",
            definition="把目标拆成有顺序、可检查的中间产物。",
            why_it_matters="规划让长任务可控，也提供用户确认点。",
            evidence_ids=["evidence-mechanisms"],
        ),
        ConceptNode(
            id="research",
            module_id="mechanisms",
            name="证据研究",
            definition="围绕规划收集、筛选并绑定可追溯证据。",
            why_it_matters="它区分有依据的内容与模型的自由发挥。",
            evidence_ids=["evidence-mechanisms"],
        ),
        ConceptNode(
            id="orchestration",
            module_id="practice",
            name="流程编排",
            definition="控制各阶段的输入输出、状态转换与失败恢复。",
            why_it_matters="Demo 的可信感主要来自清晰可见的生成过程。",
            evidence_ids=["evidence-practice"],
        ),
        ConceptNode(
            id="artifact",
            module_id="practice",
            name="结构化产物",
            definition="以稳定 Schema 保存知识地图，而不是只返回一段文本。",
            why_it_matters="结构化数据才能支持浏览、关联和复用。",
            evidence_ids=["evidence-practice"],
        ),
        ConceptNode(
            id="validation",
            module_id="quality",
            name="确定性校验",
            definition="用普通程序检查 ID、引用和必需字段等硬约束。",
            why_it_matters="不应让语言模型承担可以精确判断的工作。",
            evidence_ids=["evidence-quality"],
        ),
        ConceptNode(
            id="evaluation",
            module_id="quality",
            name="学习评估",
            definition="通过问题和反馈验证用户是否理解关键概念。",
            why_it_matters="完成生成不等于完成学习。",
            evidence_ids=["evidence-quality"],
        ),
    ]
    expansion_roles = [
        (
            "mechanism",
            "关键机制",
            "解释该模块中的信息、决策和反馈如何形成稳定的运行过程。",
            "机制节点把静态术语连接为可推演的因果链。",
        ),
        (
            "method",
            "方法与工具",
            "整理完成该模块任务时可复用的步骤、工具和判断方法。",
            "明确方法才能把理解转化为可重复的行动。",
        ),
        (
            "failure",
            "失败模式",
            "识别该模块中最常见的错误假设、断点和表面成功。",
            "失败模式帮助学习者发现仅靠顺利案例看不到的风险。",
        ),
        (
            "boundary",
            "边界与评估",
            "说明该模块的适用条件、完成标准和仍需核验的问题。",
            "边界与评估防止把局部经验误当成普遍结论。",
        ),
    ]
    for module in plan.modules:
        evidence_ids = [
            evidence.id for evidence in research.evidence if evidence.module_id == module.id
        ]
        for suffix, label, definition, why_it_matters in expansion_roles:
            concepts.append(
                ConceptNode(
                    id=f"{module.id}-{suffix}",
                    module_id=module.id,
                    name=f"{module.title}·{label}",
                    definition=definition,
                    why_it_matters=why_it_matters,
                    evidence_ids=evidence_ids,
                    uncertainty="该节点来自演示骨架，应结合证据卡片继续核验领域细节。",
                )
            )
    for concept in concepts:
        concept.key_points = [concept.definition, concept.why_it_matters]
        concept.example = f"尝试在当前 Demo 中指出「{concept.name}」对应的一个具体环节。"
        if concept.misconception is None:
            concept.misconception = "只记住术语，却没有说明它与相邻概念的关系。"
    relations = [
        ConceptRelation(id="r1", source_id="goal", target_id="model", relation_type="informs", explanation="目标决定模型需要覆盖的边界。"),
        ConceptRelation(id="r2", source_id="model", target_id="planning", relation_type="informs", explanation="领域结构帮助形成模块计划。"),
        ConceptRelation(id="r3", source_id="planning", target_id="research", relation_type="enables", explanation="计划为研究提供检索问题。"),
        ConceptRelation(id="r4", source_id="research", target_id="artifact", relation_type="informs", explanation="证据支撑结构化内容。"),
        ConceptRelation(id="r5", source_id="orchestration", target_id="artifact", relation_type="enables", explanation="编排逐步组装最终产物。"),
        ConceptRelation(id="r6", source_id="validation", target_id="artifact", relation_type="evaluates", explanation="校验保证引用结构完整。"),
        ConceptRelation(id="r7", source_id="evaluation", target_id="goal", relation_type="evaluates", explanation="学习结果回看最初目标。"),
    ]
    module_anchors = {
        "foundations": "model",
        "mechanisms": "research",
        "practice": "artifact",
        "quality": "evaluation",
    }
    for module in plan.modules:
        chain = [
            module_anchors[module.id],
            f"{module.id}-mechanism",
            f"{module.id}-method",
            f"{module.id}-failure",
            f"{module.id}-boundary",
        ]
        relation_types = ["informs", "enables", "constrains", "evaluates"]
        for chain_index, (source_id, target_id) in enumerate(zip(chain, chain[1:])):
            relations.append(
                ConceptRelation(
                    id=f"relation-{module.id}-expansion-{chain_index + 1}",
                    source_id=source_id,
                    target_id=target_id,
                    relation_type=relation_types[chain_index],
                    explanation="前一认知层为后一层提供输入、约束或检查依据。",
                )
            )
    return AtlasDocument(
        title=f"{brief.domain} · 领域测绘图",
        overview=AtlasOverview(
            definition=f"一张围绕「{brief.domain}」构建的入门认知地图。",
            boundary=plan.scope,
            essential_question=f"如何用一个可验证的闭环理解并实践 {brief.domain}？",
            key_takeaways=[
                "目标边界决定研究和生成是否聚焦。",
                "规划、研究和结构化产物通过显式输入输出连接。",
                "确定性校验与学习评估承担不同的质量职责。",
            ],
        ),
        modules=[
            AtlasModule(id="foundations", title="基本构成", summary="定义地形和共同语言。", color="#2f7f73"),
            AtlasModule(id="mechanisms", title="运行机制", summary="解释信息与决策如何流动。", color="#4e7896"),
            AtlasModule(id="practice", title="实践方法", summary="形成可演示的最小闭环。", color="#d49a45"),
            AtlasModule(id="quality", title="质量判断", summary="校验结构并反馈学习结果。", color="#e46f46"),
        ],
        concepts=concepts,
        relations=relations,
        mechanisms=[
            Mechanism(
                id="mechanism-loop",
                title="从意图到反馈的闭环",
                explanation="目标先变成计划，计划引导研究，研究形成产物，校验与评估把结果反馈给用户。",
                steps=["确认目标", "拆解计划", "整理证据", "生成结构", "校验并反馈"],
                concept_ids=["goal", "planning", "research", "artifact", "validation", "evaluation"],
            )
        ],
        cases=[
            CaseStudy(
                id="case-demo",
                title="用固定研究包演示完整流程",
                summary="先验证状态流转和 Atlas 交互，再替换真实模型与搜索。",
                context="比赛 Demo 需要在稳定性和真实性之间做清晰取舍。",
                lesson="先稳定结构化工作流，再逐阶段替换真实能力，能更快暴露系统边界。",
                concept_ids=["planning", "orchestration", "artifact", "validation"],
            )
        ],
        learning_path=[
            LearningStage(id="stage-1", title="读地形", objective="确认目标和共同语言。", concept_ids=["goal", "model", "foundations-mechanism", "foundations-method", "foundations-failure", "foundations-boundary"], estimated_minutes=10, checkpoint="能用一句话说清目标和排除项。"),
            LearningStage(id="stage-2", title="走路径", objective="理解规划与研究如何衔接。", concept_ids=["planning", "research", "mechanisms-mechanism", "mechanisms-method", "mechanisms-failure", "mechanisms-boundary"], estimated_minutes=15, checkpoint="能解释计划如何约束研究问题。"),
            LearningStage(id="stage-3", title="建营地", objective="把知识变成结构化产物。", concept_ids=["orchestration", "artifact", "practice-mechanism", "practice-method", "practice-failure", "practice-boundary"], estimated_minutes=15, checkpoint="能指出产物中的概念、关系和证据引用。"),
            LearningStage(id="stage-4", title="校准罗盘", objective="验证结构与学习结果。", concept_ids=["validation", "evaluation", "quality-mechanism", "quality-method", "quality-failure", "quality-boundary"], estimated_minutes=10, checkpoint="能区分结构校验与学习评估。"),
        ],
        assessments=[
            Assessment(
                id="assessment-1",
                prompt="为什么 Demo 仍然需要在生成前确认计划？",
                options=["减少无效研究和生成", "让页面看起来更复杂", "替代所有质量检查"],
                expected_answer="减少无效研究和生成",
                related_concept_ids=["goal", "planning"],
            ),
            Assessment(
                id="assessment-2",
                prompt="哪项工作更适合交给确定性校验器？",
                options=["判断引用 ID 是否存在", "解释概念的重要性", "提出跨领域类比"],
                expected_answer="判断引用 ID 是否存在",
                related_concept_ids=["validation"],
            ),
        ],
        sources=research.sources,
        gaps=research.gaps,
    )


def make_quality_report() -> QualityReport:
    return QualityReport(
        scope_coverage=0.92,
        structure_quality=0.95,
        grounding_quality=0.72,
        learning_quality=0.88,
        issues=[],
        publishable=True,
    )


def _make_plan_aligned_atlas(
    brief: LearningBrief,
    plan: FrameworkPlan,
    research: ResearchPack,
) -> AtlasDocument:
    colors = ["#2f7f73", "#4e7896", "#d49a45", "#e46f46", "#776a9b", "#6d8b55"]
    modules = [
        AtlasModule(
            id=module.id,
            title=module.title,
            summary=module.purpose,
            color=colors[index % len(colors)],
        )
        for index, module in enumerate(plan.modules)
    ]
    concepts: list[ConceptNode] = []
    relations: list[ConceptRelation] = []
    learning_path: list[LearningStage] = []
    assessments: list[Assessment] = []
    previous_module_concept_ids: list[str] | None = None

    for index, module in enumerate(plan.modules):
        evidence_ids = [
            evidence.id for evidence in research.evidence if evidence.module_id == module.id
        ]
        questions = module.core_questions
        generic_concept_specs = [
            (
                "foundation",
                "核心定义",
                questions[0],
                module.purpose,
                [questions[0], "明确关键对象与术语。", "区分本模块与相邻模块的职责。"],
                f"用自己的话回答：{questions[0]}",
            ),
            (
                "mechanism",
                "关键机制",
                questions[1] if len(questions) > 1 else f"解释「{module.title}」中的信息和决策如何流动。",
                "机制节点把静态定义连接成可以推演的过程。",
                ["识别输入、转换和输出。", "指出关键决策点。", "说明反馈如何改变下一轮结果。"],
                f"画出「{module.title}」从输入到输出的最短因果链。",
            ),
            (
                "method",
                "方法与工具",
                questions[2] if len(questions) > 2 else f"完成「{module.title}」需要哪些方法和工具？",
                "方法节点帮助学习者把原理转化为可重复的操作。",
                ["选择与目标匹配的方法。", "记录关键输入和中间结果。", "保留可检查的判断依据。"],
                f"为「{module.title}」列出一套最小工具清单和使用顺序。",
            ),
            (
                "practice",
                "应用实践",
                f"把「{module.title}」落实为一个有输入、过程和结果的最小任务。",
                "实践节点验证理解能否在具体情境中产生可观察结果。",
                ["限定一个足够小的场景。", "执行并记录过程。", "根据结果修正理解。"],
                f"围绕「{module.title}」设计一个 10 分钟内可以完成的小练习。",
            ),
            (
                "failure",
                "常见误区",
                f"识别学习或应用「{module.title}」时最常见的错误假设和表面成功。",
                "误区节点能暴露只看成功路径时容易忽略的风险。",
                ["区分术语记忆与机制理解。", "检查是否跳过必要前提。", "警惕把单一案例泛化。"],
                f"给出一个看似完成「{module.title}」但实际上不可验证的反例。",
            ),
            (
                "boundary",
                "边界与评估",
                f"说明「{module.title}」的适用条件、完成标准和仍待核验的问题。",
                "边界与评估节点防止把局部结论误当成完整领域认知。",
                ["列出适用前提。", "定义可观察的完成标准。", "标记证据不足或仍有争议的部分。"],
                f"为「{module.title}」写出一个可以被第三方检查的完成标准。",
            ),
        ]
        curated_concepts = AGENT_SYSTEM_CONCEPTS.get(module.id)
        concept_specs = (
            [
                (
                    suffix,
                    label,
                    definition,
                    why_it_matters,
                    [
                        definition,
                        why_it_matters,
                        questions[spec_index % len(questions)],
                    ],
                    f"在「{brief.desired_outcome}」中说明「{label}」的输入、输出和失败条件。",
                )
                for spec_index, (suffix, label, definition, why_it_matters) in enumerate(curated_concepts)
            ]
            if curated_concepts
            else generic_concept_specs
        )
        module_concept_ids: list[str] = []
        for suffix, label, definition, why_it_matters, key_points, example in concept_specs:
            concept_id = f"{module.id}-{suffix}"
            module_concept_ids.append(concept_id)
            concepts.append(
                ConceptNode(
                    id=concept_id,
                    module_id=module.id,
                    name=label if curated_concepts else f"{module.title}·{label}",
                    definition=definition,
                    why_it_matters=why_it_matters,
                    key_points=key_points,
                    example=example,
                    evidence_ids=evidence_ids,
                    misconception="只看最终结果，不检查过程中的失败类型和触发条件。" if suffix == "failure-taxonomy" else None,
                    uncertainty="系统边界需要根据真实工具权限、数据敏感度和业务风险进一步收紧。" if suffix == "system-boundary" else None,
                )
            )
        relation_types = ["informs", "informs", "enables", "constrains", "evaluates"]
        module_root_id = module_concept_ids[0]
        for relation_index, target_id in enumerate(module_concept_ids[1:]):
            relations.append(
                ConceptRelation(
                    id=f"relation-{module.id}-{relation_index + 1}",
                    source_id=module_root_id,
                    target_id=target_id,
                    relation_type=relation_types[relation_index],
                    explanation="模块核心概念向外展开定义、方法、约束与评估分支。",
                )
            )
        if previous_module_concept_ids:
            relations.append(
                ConceptRelation(
                    id=f"relation-{plan.modules[index - 1].id}-{module.id}",
                    source_id=previous_module_concept_ids[-1],
                    target_id=module_concept_ids[0],
                    relation_type="informs",
                    explanation="前一模块的边界和评估结果为下一模块确定前提与输入。",
                )
            )
            relations.append(
                ConceptRelation(
                    id=f"relation-{plan.modules[index - 1].id}-{module.id}-cross",
                    source_id=previous_module_concept_ids[2],
                    target_id=module_concept_ids[1],
                    relation_type="enables",
                    explanation="前一模块的关键决策直接影响下一模块如何选择和执行。",
                )
            )
        previous_module_concept_ids = module_concept_ids
        learning_path.append(
            LearningStage(
                id=f"stage-{module.id}",
                title=module.title,
                objective=module.purpose,
                concept_ids=module_concept_ids,
                estimated_minutes=max(5, plan.estimated_minutes // len(plan.modules)),
                checkpoint=plan.completion_criteria[index % len(plan.completion_criteria)],
            )
        )
        assessments.append(
            Assessment(
                id=f"assessment-{module.id}",
                prompt=f"学习「{module.title}」最重要的目的是什么？",
                options=[module.purpose, "增加术语数量", "跳过证据直接得出结论"],
                expected_answer=module.purpose,
                related_concept_ids=[module_concept_ids[0], module_concept_ids[-1]],
            )
        )

    return AtlasDocument(
        title=f"{brief.domain} · 领域测绘图",
        overview=AtlasOverview(
            definition=plan.domain_definition,
            boundary=plan.scope,
            essential_question=f"如何在 {brief.learning_time_minutes} 分钟内形成对 {brief.domain} 的可操作理解？",
            key_takeaways=[module.purpose for module in plan.modules[:4]],
        ),
        modules=modules,
        concepts=concepts,
        relations=relations,
        mechanisms=[
            Mechanism(
                id="mechanism-learning-loop",
                title="从理解到验证的学习闭环",
                explanation="沿模块顺序理解核心问题，并用实践节点验证认识。",
                steps=[
                    "确认当前模块要回答的核心问题。",
                    "阅读定义并沿关系定位前置概念。",
                    "完成最小实践，记录能够观察到的结果。",
                    "使用检查点复述或验证，再进入下一模块。",
                ],
                concept_ids=[concept.id for concept in concepts],
            )
        ],
        cases=[
            CaseStudy(
                id="case-minimum-practice",
                title="最小可验证实践",
                summary=brief.desired_outcome,
                context=f"学习者背景：{brief.learner_background}",
                lesson="把宽泛目标拆成逐模块检查点，可以让有限时间内的学习结果更可验证。",
                concept_ids=[
                    concept.id
                    for concept in concepts
                    if concept.module_id == plan.modules[-1].id
                ][:3],
            )
        ],
        learning_path=learning_path,
        assessments=assessments,
        sources=research.sources,
        gaps=research.gaps,
    )
