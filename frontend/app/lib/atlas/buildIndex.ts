import type { AtlasDocument } from "../types";

import type { AtlasEvidence, AtlasIndex } from "./types";

export function buildAtlasIndex(atlas: AtlasDocument, evidence: AtlasEvidence[] = []): AtlasIndex {
  const conceptsById = new Map(atlas.concepts.map((concept) => [concept.id, concept]));
  const modulesById = new Map(atlas.modules.map((module) => [module.id, module]));
  const conceptsByModule = new Map(
    atlas.modules.map((module) => [
      module.id,
      atlas.concepts.filter((concept) => concept.module_id === module.id),
    ]),
  );
  const relationsByConcept = new Map(
    atlas.concepts.map((concept) => [
      concept.id,
      atlas.relations.filter(
        (relation) => relation.source_id === concept.id || relation.target_id === concept.id,
      ),
    ]),
  );
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(atlas.sources.map((source) => [source.id, source]));
  const learningOrder = Array.from(new Set([
    ...atlas.learning_path.flatMap((stage) => stage.concept_ids),
    ...atlas.concepts.map((concept) => concept.id),
  ])).filter((conceptId) => conceptsById.has(conceptId));
  const conceptOrder = new Map(learningOrder.map((conceptId, index) => [conceptId, index + 1]));
  return {
    conceptsById,
    modulesById,
    conceptsByModule,
    relationsByConcept,
    evidenceById,
    sourcesById,
    conceptOrder,
    learningOrder,
  };
}
