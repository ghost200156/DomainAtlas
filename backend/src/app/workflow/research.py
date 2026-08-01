import asyncio
import json
from dataclasses import dataclass
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.schemas.demo import EvidenceItem, FrameworkPlan, ResearchPack, Source

WIKIPEDIA_API = "https://zh.wikipedia.org/w/api.php"


@dataclass(frozen=True)
class WikipediaResult:
    title: str
    url: str
    extract: str


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
    with urlopen(request, timeout=12) as response:  # noqa: S310 - fixed trusted host
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

        fallback_item = fallback_evidence.get(module.id)
        if fallback_item is not None:
            fallback_source = fallback_sources.get(fallback_item.source_id)
            if fallback_source is not None and all(
                source.id != fallback_source.id for source in sources
            ):
                sources.append(fallback_source)
            evidence.append(fallback_item)
        gaps.append(f"模块「{module.title}」未取得外部摘要，暂用演示资料。")

    return ResearchPack(sources=sources, evidence=evidence, gaps=[*fallback.gaps, *gaps])
