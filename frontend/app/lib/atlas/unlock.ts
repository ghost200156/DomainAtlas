import type { DemoRun } from "../types";

import type { AtlasIndex } from "./types";

export function computeUnlocked(
  atlasIndex: AtlasIndex | null | undefined,
  progress: DemoRun["progress"] | undefined,
): Set<string> {
  if (!atlasIndex) return new Set<string>();
  const rootId = atlasIndex.learningOrder[0];
  const unlocked = new Set<string>(rootId ? [rootId] : []);
  const understoodIds = atlasIndex.learningOrder.filter(
    (conceptId) => progress?.[conceptId] === "understood",
  );

  understoodIds.forEach((conceptId) => {
    unlocked.add(conceptId);
    (atlasIndex.relationsByConcept.get(conceptId) ?? []).forEach((relation) => {
      unlocked.add(relation.source_id === conceptId ? relation.target_id : relation.source_id);
    });
  });
  return unlocked;
}
