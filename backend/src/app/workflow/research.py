from __future__ import annotations

import asyncio
import json
import logging
import ssl
from dataclasses import dataclass
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.schemas.demo import EvidenceItem, FrameworkPlan, ResearchPack, Source

WIKIPEDIA_API = "https://zh.wikipedia.org/w/api.php"

# Windows Python may lack root CA certificates for urllib.
# Create an unverified context for read-only public data access.
_SSL_CONTEXT = ssl.create_default_context()
_SSL_CONTEXT.check_hostname = False
_SSL_CONTEXT.verify_mode = ssl.CERT_NONE
ARXIV_API = "https://export.arxiv.org/api/query"
GITHUB_API = "https://api.github.com/search/repositories"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WikipediaResult:
    title: str
    url: str
    extract: str


@dataclass(frozen=True)
class ArxivResult:
    title: str
    url: str
    summary: str
    published: str


@dataclass(frozen=True)
class GitHubResult:
    full_name: str
    url: str
    description: str
    stars: int


def _read_wikipedia(query: str) -> WikipediaResult | None:
    parameters = urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": 1,
            "prop": "extracts|info",
            "exintro": 1,
            "explaintext": 1,
            "inprop": "url",
            "format": "json",
        }
    )
    request = Request(
        f"{WIKIPEDIA_API}?{parameters}",
        headers={"User-Agent": "DomainAtlasDemo/0.1 (learning atlas prototype)"},
    )
    with urlopen(request, timeout=12, context=_SSL_CONTEXT) as response:  # noqa: S310 - fixed trusted host
        payload = json.loads(response.read().decode("utf-8"))
    pages = payload.get("query", {}).get("pages", {})
    if not pages:
        return None
    page = next(iter(pages.values()))
    extract = str(page.get("extract", "")).strip()
    url = str(page.get("fullurl", "")).strip()
    title = str(page.get("title", "")).strip()
    if not extract or not url or not title:
        return None
    return WikipediaResult(title=title, url=url, extract=extract[:1_500])


def _search_arxiv(query: str, max_results: int = 1) -> list[ArxivResult]:
    """Search arXiv for papers matching *query*. Returns at most *max_results* results.

    Each result is independently wrapped so a single timeout doesn't lose all results.
    """
    try:
        params = urlencode(
            {
                "search_query": query,
                "start": 0,
                "max_results": max_results,
            }
        )
        req = Request(
            f"{ARXIV_API}?{params}",
            headers={"User-Agent": "DomainAtlasDemo/0.1"},
        )
        with urlopen(req, timeout=8, context=_SSL_CONTEXT) as resp:
            raw = resp.read().decode("utf-8")
    except Exception:
        logger.debug("arXiv search failed for %r", query, exc_info=True)
        return []

    results: list[ArxivResult] = []
    # Simple XML extraction without a heavy dependency
    import re
    entries = re.split(r"<entry>|</entry>", raw)
    for entry in entries:
        title_m = re.search(r"<title>(.*?)</title>", entry)
        url_m = re.search(r"<id>(.*?)</id>", entry)
        summary_m = re.search(r"<summary>(.*?)</summary>", entry, re.DOTALL)
        published_m = re.search(r"<published>(.*?)</published>", entry)
        if title_m and url_m:
            results.append(
                ArxivResult(
                    title=title_m.group(1).strip(),
                    url=url_m.group(1).strip(),
                    summary=(summary_m.group(1).strip()[:800] if summary_m else ""),
                    published=(published_m.group(1).strip()[:10] if published_m else ""),
                )
            )
    return results[:max_results]


def _search_github(query: str) -> GitHubResult | None:
    """Search GitHub for repositories matching *query* (≥100 stars)."""
    try:
        params = urlencode(
            {
                "q": f"{query} stars:>=100",
                "sort": "stars",
                "order": "desc",
                "per_page": 1,
            }
        )
        req = Request(
            f"{GITHUB_API}?{params}",
            headers={
                "User-Agent": "DomainAtlasDemo/0.1",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        with urlopen(req, timeout=8, context=_SSL_CONTEXT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        items = payload.get("items", [])
        if not items:
            return None
        item = items[0]
        return GitHubResult(
            full_name=item.get("full_name", ""),
            url=item.get("html_url", ""),
            description=item.get("description", "") or "",
            stars=item.get("stargazers_count", 0),
        )
    except Exception:
        logger.debug("GitHub search failed for %r", query, exc_info=True)
        return None


async def search_multi_source(
    domain: str,
    plan: FrameworkPlan,
) -> tuple[list[Source], list[EvidenceItem]]:
    """Run multi-source search (arXiv + GitHub) in parallel with Wikipedia.

    Returns additional sources and evidence items that can be merged into
    the primary research pack. Failures in individual sources are gracefully
    skipped — a partial result is better than a hung pipeline.
    """
    arxiv_tasks = [
        asyncio.to_thread(_search_arxiv, f"{domain} {module.title}")
        for module in plan.modules
    ]
    github_tasks = [
        asyncio.to_thread(_search_github, f"{domain} {module.title}")
        for module in plan.modules
    ]

    arxiv_results = await asyncio.gather(*arxiv_tasks, return_exceptions=True)
    github_results = await asyncio.gather(*github_tasks, return_exceptions=True)

    extra_sources: list[Source] = []
    extra_evidence: list[EvidenceItem] = []

    for module, arxiv_list, github_item in zip(
        plan.modules, arxiv_results, github_results, strict=True
    ):
        # arXiv results
        if isinstance(arxiv_list, list):
            for arxiv_idx, arxiv in enumerate(arxiv_list):
                if not isinstance(arxiv, ArxivResult):
                    continue
                source_id = f"arxiv-{module.id}-{arxiv_idx}"
                extra_sources.append(
                    Source(
                        id=source_id,
                        title=arxiv.title,
                        url=arxiv.url,
                        publisher=f"arXiv ({arxiv.published})",
                        trust_tier="B",
                    )
                )
                extra_evidence.append(
                    EvidenceItem(
                        id=f"evidence-{module.id}-arxiv-{arxiv_idx}",
                        source_id=source_id,
                        module_id=module.id,
                        statement=arxiv.summary[:300],
                        excerpt=arxiv.summary,
                        evidence_type="definition",
                        confidence="medium",
                    )
                )

        # GitHub results
        if isinstance(github_item, GitHubResult):
            source_id = f"gh-{module.id}"
            extra_sources.append(
                Source(
                    id=source_id,
                    title=f"{github_item.full_name} ({github_item.stars} stars)",
                    url=github_item.url,
                    publisher="GitHub",
                    trust_tier="B" if github_item.stars >= 100 else "C",
                )
            )
            extra_evidence.append(
                EvidenceItem(
                    id=f"evidence-{module.id}-gh",
                    source_id=source_id,
                    module_id=module.id,
                    statement=github_item.description[:300],
                    excerpt=github_item.description,
                    evidence_type="definition",
                    confidence="medium",
                )
            )

    return extra_sources, extra_evidence


async def build_research_candidates(
    domain: str,
    plan: FrameworkPlan,
    fallback: ResearchPack,
) -> ResearchPack:
    tasks = [
        asyncio.to_thread(_read_wikipedia, f"{domain} {module.title}")
        for module in plan.modules
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    fallback_sources = {source.id: source for source in fallback.sources}
    fallback_evidence = {item.module_id: item for item in fallback.evidence}
    sources: list[Source] = []
    evidence: list[EvidenceItem] = []
    gaps: list[str] = []

    wiki_hits = sum(1 for r in results if isinstance(r, WikipediaResult))

    for module, result in zip(plan.modules, results, strict=True):
        if isinstance(result, WikipediaResult):
            source_id = f"wiki-{module.id}"
            sources.append(
                Source(
                    id=source_id,
                    title=result.title,
                    url=result.url,
                    publisher="中文维基百科",
                    trust_tier="C",
                )
            )
            first_sentence = result.extract.split("。", maxsplit=1)[0]
            evidence.append(
                EvidenceItem(
                    id=f"evidence-{module.id}-wiki",
                    source_id=source_id,
                    module_id=module.id,
                    statement=first_sentence[:300],
                    excerpt=result.extract,
                    evidence_type="definition",
                    confidence="medium",
                )
            )
            continue

        # Wikipedia failed for this module.
        # If ALL Wikipedia calls failed, use model-knowledge sources
        # instead of fixture data, clearly marked as unverified.
        if wiki_hits == 0:
            source_id = f"model-{module.id}"
            sources.append(
                Source(
                    id=source_id,
                    title=f"{domain} — {module.title}（模型知识）",
                    url="",
                    publisher="模型知识（未外部验证）",
                    trust_tier="C",
                )
            )
            evidence.append(
                EvidenceItem(
                    id=f"evidence-{module.id}-model",
                    source_id=source_id,
                    module_id=module.id,
                    statement=f"模型将基于对「{domain}」中「{module.title}」的已知信息生成内容。",
                    excerpt="（模型知识：以下证据由语言模型从训练数据中回忆，未经过实时外部检索验证。请以权威来源为准。）",
                    evidence_type="viewpoint",
                    confidence="low",
                )
            )
            gaps.append(f"模块「{module.title}」无法连接外部来源，暂用模型知识。")
            continue

        # Some Wikipedia results succeeded, but this one failed — use fixture
        fallback_item = fallback_evidence.get(module.id)
        if fallback_item is not None:
            fallback_source = fallback_sources.get(fallback_item.source_id)
            if fallback_source is not None and all(
                source.id != fallback_source.id for source in sources
            ):
                sources.append(fallback_source)
            evidence.append(fallback_item)
        gaps.append(f"模块「{module.title}」未取得外部摘要，暂用演示资料。")

    # Add well-known reference URLs
    domain_lower = domain.lower()
    ref_urls = []
    if "risc" in domain_lower:
        ref_urls = [
            Source(id="ref-riscv-spec", title="RISC-V 指令集规范 (官方)", url="https://riscv.org/technical/specifications/", publisher="RISC-V International", trust_tier="A"),
            Source(id="ref-riscv-manual", title="RISC-V 汇编程序员手册", url="https://github.com/riscv-non-isa/riscv-asm-manual/blob/master/riscv-asm.md", publisher="GitHub riscv-non-isa", trust_tier="B"),
            Source(id="ref-riscv-card", title="RISC-V 参考卡 (绿卡)", url="https://www.cl.cam.ac.uk/teaching/1617/ECAD+Arch/files/docs/RISCVGreenCardv8-20151013.pdf", publisher="University of Cambridge", trust_tier="B"),
            Source(id="ref-riscv-spec-github", title="RISC-V 规范源码 (GitHub)", url="https://github.com/riscv/riscv-isa-manual", publisher="GitHub riscv", trust_tier="A"),
        ]
    if ref_urls:
        for src in ref_urls:
            if not any(s.id == src.id for s in sources):
                sources.append(src)
        # Also add reference evidence
        for src in ref_urls:
            evidence.append(EvidenceItem(
                id=f"evidence-ref-{src.id}",
                source_id=src.id,
                module_id=plan.modules[0].id if plan.modules else "",
                statement=f"官方 {src.title} — 最权威的参考来源",
                excerpt=f"参考 {src.url}",
                evidence_type="definition",
                confidence="high",
            ))

    return ResearchPack(sources=sources, evidence=evidence, gaps=[*fallback.gaps, *gaps])
