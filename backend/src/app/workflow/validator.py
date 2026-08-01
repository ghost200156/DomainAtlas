from app.schemas.demo import AtlasDocument, FrameworkPlan, ResearchPack


def validate_plan(plan: FrameworkPlan) -> list[str]:
    issues: list[str] = []
    module_ids = [module.id for module in plan.modules]
    if len(module_ids) != len(set(module_ids)):
        issues.append("Framework module IDs must be unique")
    if any(module_id not in module_ids for module_id in plan.learning_sequence):
        issues.append("Learning sequence must reference existing modules")
    return issues


def validate_research_pack(
    pack: ResearchPack,
    plan: FrameworkPlan,
    allowed_pack: ResearchPack | None = None,
) -> list[str]:
    issues: list[str] = []
    source_ids = {source.id for source in pack.sources}
    module_ids = {module.id for module in plan.modules}
    evidence_ids = [evidence.id for evidence in pack.evidence]

    if len(source_ids) != len(pack.sources):
        issues.append("Research source IDs must be unique")
    if len(evidence_ids) != len(set(evidence_ids)):
        issues.append("Evidence IDs must be unique")
    for evidence in pack.evidence:
        if evidence.source_id not in source_ids:
            issues.append(f"Evidence {evidence.id} references a missing source")
        if evidence.module_id not in module_ids:
            issues.append(f"Evidence {evidence.id} references a missing module")
    if allowed_pack is not None:
        allowed_sources = {source.id: source.url for source in allowed_pack.sources}
        for source in pack.sources:
            if allowed_sources.get(source.id) != source.url:
                issues.append(f"Source {source.id} is outside the controlled research pack")
    return issues


def validate_atlas(
    atlas: AtlasDocument,
    research_pack: ResearchPack | None = None,
) -> list[str]:
    issues: list[str] = []
    module_ids = {module.id for module in atlas.modules}
    concept_ids = {concept.id for concept in atlas.concepts}
    source_ids = {source.id for source in atlas.sources}
    minimum_concepts = max(24, len(atlas.modules) * 4)

    if len(atlas.modules) < 3:
        issues.append("Atlas must contain at least three modules")
    if len(atlas.concepts) < minimum_concepts:
        issues.append(f"Atlas must contain at least {minimum_concepts} concepts")
    if not atlas.relations:
        issues.append("Atlas must contain concept relations")
    if not atlas.learning_path:
        issues.append("Atlas must contain a learning path")
    if not atlas.assessments:
        issues.append("Atlas must contain an assessment")
    if len(concept_ids) != len(atlas.concepts):
        issues.append("Concept IDs must be unique")
    covered_module_ids = {concept.module_id for concept in atlas.concepts}
    if not module_ids.issubset(covered_module_ids):
        issues.append("Every Atlas module must contain at least one concept")
    concept_count_by_module = {
        module_id: sum(concept.module_id == module_id for concept in atlas.concepts)
        for module_id in module_ids
    }
    if any(count < 4 for count in concept_count_by_module.values()):
        issues.append("Every Atlas module must contain at least four concepts")
    if any(not concept.key_points for concept in atlas.concepts):
        issues.append("Every concept must include key points")
    if any(not concept.example for concept in atlas.concepts):
        issues.append("Every concept must include an example")
    for concept in atlas.concepts:
        if concept.module_id not in module_ids:
            issues.append(f"Concept {concept.id} references a missing module")
    for relation in atlas.relations:
        if relation.source_id not in concept_ids or relation.target_id not in concept_ids:
            issues.append(f"Relation {relation.id} references a missing concept")
    related_concept_ids = {
        concept_id
        for relation in atlas.relations
        for concept_id in (relation.source_id, relation.target_id)
        if concept_id in concept_ids
    }
    if not concept_ids.issubset(related_concept_ids):
        issues.append("Every concept must participate in at least one relation")
    if concept_ids:
        adjacency = {concept_id: set() for concept_id in concept_ids}
        for relation in atlas.relations:
            if relation.source_id in concept_ids and relation.target_id in concept_ids:
                adjacency[relation.source_id].add(relation.target_id)
                adjacency[relation.target_id].add(relation.source_id)
        pending = [next(iter(concept_ids))]
        visited: set[str] = set()
        while pending:
            concept_id = pending.pop()
            if concept_id in visited:
                continue
            visited.add(concept_id)
            pending.extend(adjacency[concept_id] - visited)
        if visited != concept_ids:
            issues.append("Atlas concept graph must be connected")
    for stage in atlas.learning_path:
        if any(concept_id not in concept_ids for concept_id in stage.concept_ids):
            issues.append(f"Learning stage {stage.id} references a missing concept")
    for assessment in atlas.assessments:
        if any(concept_id not in concept_ids for concept_id in assessment.related_concept_ids):
            issues.append(f"Assessment {assessment.id} references a missing concept")
    if research_pack is not None:
        allowed_evidence_ids = {evidence.id for evidence in research_pack.evidence}
        allowed_source_ids = {source.id for source in research_pack.sources}
        for concept in atlas.concepts:
            if any(evidence_id not in allowed_evidence_ids for evidence_id in concept.evidence_ids):
                issues.append(f"Concept {concept.id} references missing evidence")
        if not source_ids.issubset(allowed_source_ids):
            issues.append("Atlas contains a source outside the research pack")
        if allowed_source_ids and not source_ids:
            issues.append("Atlas must retain its controlled research sources")
    return issues


def repair_atlas_references(
    atlas: AtlasDocument,
    research_pack: ResearchPack,
) -> list[str]:
    repairs: list[str] = []
    module_ids = {module.id for module in atlas.modules}
    concept_ids = {concept.id for concept in atlas.concepts}
    evidence_ids = {evidence.id for evidence in research_pack.evidence}
    source_ids = {source.id for source in research_pack.sources}
    fallback_concept_id = atlas.concepts[0].id if atlas.concepts else None
    fallback_module_id = atlas.modules[0].id if atlas.modules else None

    for concept in atlas.concepts:
        if concept.module_id not in module_ids and fallback_module_id is not None:
            concept.module_id = fallback_module_id
            repairs.append(f"Rebound concept {concept.id} to an existing module")
        valid_evidence = [item for item in concept.evidence_ids if item in evidence_ids]
        if valid_evidence != concept.evidence_ids:
            concept.evidence_ids = valid_evidence
            repairs.append(f"Removed missing evidence from concept {concept.id}")

    valid_relations = [
        relation
        for relation in atlas.relations
        if relation.source_id in concept_ids and relation.target_id in concept_ids
    ]
    if len(valid_relations) != len(atlas.relations):
        repairs.append("Removed relations that referenced missing concepts")
        atlas.relations = valid_relations

    for collection in (atlas.mechanisms, atlas.cases, atlas.learning_path):
        for item in collection:
            valid_ids = [concept_id for concept_id in item.concept_ids if concept_id in concept_ids]
            if not valid_ids and fallback_concept_id is not None:
                valid_ids = [fallback_concept_id]
            if valid_ids != item.concept_ids:
                item.concept_ids = valid_ids
                repairs.append(f"Repaired concept references in {item.id}")

    for assessment in atlas.assessments:
        valid_ids = [
            concept_id
            for concept_id in assessment.related_concept_ids
            if concept_id in concept_ids
        ]
        if not valid_ids and fallback_concept_id is not None:
            valid_ids = [fallback_concept_id]
        if valid_ids != assessment.related_concept_ids:
            assessment.related_concept_ids = valid_ids
            repairs.append(f"Repaired concept references in {assessment.id}")

    valid_sources = [source for source in atlas.sources if source.id in source_ids]
    if len(valid_sources) != len(atlas.sources):
        atlas.sources = valid_sources
        repairs.append("Removed sources outside the research pack")
    return repairs
