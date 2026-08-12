"""Skill registry — indexes and serves loaded skills by name."""

from pathlib import Path

from app.skills.loader import SkillMeta, parse_skill_md


class SkillRegistry:
    """Holds all loaded skills indexed by name.

    Walks a skills directory (e.g. skills/domainatlas/), parses each SKILL.md,
    and provides lookup by skill name.
    """

    def __init__(self, skills_dir: str | Path) -> None:
        self._skills_dir = Path(skills_dir)
        self._skills: dict[str, SkillMeta] = {}
        self._reload()

    def _reload(self) -> None:
        """(Re)scan the skills directory and load all SKILL.md files."""
        self._skills.clear()
        if not self._skills_dir.is_dir():
            return
        for skill_md in sorted(self._skills_dir.rglob("SKILL.md")):
            # Skip _shared (non-skill docs)
            if "_shared" in skill_md.parts:
                continue
            try:
                meta = parse_skill_md(skill_md)
                self._skills[meta["name"]] = meta
            except ValueError:
                # Invalid skill files are skipped so one bad file
                # doesn't break the whole pipeline.
                pass

    def get(self, name: str) -> SkillMeta | None:
        """Return a skill by name, or None."""
        return self._skills.get(name)

    def get_prompt(self, name: str) -> str | None:
        """Return the prompt body for a skill, or None."""
        skill = self._skills.get(name)
        return skill["prompt"] if skill else None

    def list_names(self) -> list[str]:
        """Return all loaded skill names."""
        return list(self._skills.keys())

    def reload(self) -> None:
        """Hot-reload all skills from disk (e.g. after editing a SKILL.md)."""
        self._reload()

    def __len__(self) -> int:
        return len(self._skills)

    def __contains__(self, name: str) -> bool:
        return name in self._skills

    def __repr__(self) -> str:
        return f"SkillRegistry(dir={self._skills_dir!s}, skills={len(self._skills)})"
