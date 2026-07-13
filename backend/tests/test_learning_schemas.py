import pytest

from app.schemas.learning import FrameworkModule, FrameworkPlan, LearningBrief


def test_learning_brief_captures_bounded_learning_constraints():
    brief = LearningBrief(
        topic="Climate policy",
        learner_background="Software engineer with no policy training",
        learning_goal="Understand the main policy mechanisms",
        time_budget_minutes=120,
        desired_outcome="A map of concepts, actors, and trade-offs",
    )

    assert brief.time_budget_minutes == 120


def test_learning_brief_rejects_unbounded_time_budget():
    with pytest.raises(ValueError):
        LearningBrief(
            topic="Climate policy",
            learner_background="Beginner",
            learning_goal="Understand the field",
            time_budget_minutes=0,
            desired_outcome="A first map",
        )


def test_framework_plan_contains_modules_and_boundaries():
    plan = FrameworkPlan(
        scope="The main policy mechanisms and their trade-offs",
        modules=[
            FrameworkModule(
                name="Policy instruments",
                purpose="Explain the main ways governments intervene",
                core_questions=["What are the main instruments?"],
                priority="core",
            )
        ],
        exclusions=["Detailed country-by-country legislation"],
    )

    assert plan.modules[0].name == "Policy instruments"
    assert plan.exclusions == ["Detailed country-by-country legislation"]
