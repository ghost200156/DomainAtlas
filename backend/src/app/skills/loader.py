"""Skill loader — reads SKILL.md files and parses YAML frontmatter."""

import re
from pathlib import Path
from typing import TypedDict

import yaml


class SkillMeta(TypedDict):
    name: str
    description: str
    is_user_invoked: bool
    prompt: str
    source_path: str


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def parse_skill_md(file_path: Path) -> SkillMeta:
    """Parse a SKILL.md file into its metadata and body.

    Args:
        file_path: Path to a SKILL.md file.

    Returns:
        SkillMeta with name, description, is_user_invoked, prompt, and source_path.

    Raises:
        ValueError: If frontmatter is missing or required fields are absent.
    """
    text = file_path.read_text(encoding="utf-8")
    match = _FRONTMATTER_RE.match(text)
    if not match:
        raise ValueError(f"{file_path}: missing YAML frontmatter")

    frontmatter = yaml.safe_load(match.group(1))
    if not isinstance(frontmatter, dict):
        raise ValueError(f"{file_path}: frontmatter is not a mapping")

    name = frontmatter.get("name")
    description = frontmatter.get("description")
    if not name or not description:
        raise ValueError(f"{file_path}: frontmatter must contain 'name' and 'description'")

    is_user_invoked = frontmatter.get("disable-model-invocation", False) is True
    prompt = text[match.end() :].strip()

    return SkillMeta(
        name=name,
        description=description,
        is_user_invoked=is_user_invoked,
        prompt=prompt,
        source_path=str(file_path),
    )
