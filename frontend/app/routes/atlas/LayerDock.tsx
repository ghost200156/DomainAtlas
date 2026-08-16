import type { ConceptNode, AtlasDocument } from "../../lib/types";

import { cleanLabel } from "../../lib/atlas/labels";
import type { AtlasIndex } from "../../lib/atlas/types";

type LayerDockProps = {
  atlas: AtlasDocument;
  conceptsByModule: AtlasIndex["conceptsByModule"];
  unlockedConceptIds: ReadonlySet<string>;
  selected?: ConceptNode;
  onFocusModule: (moduleId: string) => void;
};

export function LayerDock({
  atlas,
  conceptsByModule,
  onFocusModule,
  selected,
  unlockedConceptIds,
}: LayerDockProps) {
  return (
    <nav className="layer-dock" aria-hidden={selected ? true : undefined} aria-label="知识区域">
      <span>地图区域</span>
      {atlas.modules.map((module, index) => {
        const moduleDiscovered = (conceptsByModule.get(module.id) ?? []).some((concept) =>
          unlockedConceptIds.has(concept.id),
        );
        if (!moduleDiscovered) return null;
        return (
          <button
            className={module.id === selected?.module_id ? "active" : ""}
            key={module.id}
            onClick={() => onFocusModule(module.id)}
          >
            <i style={{ background: module.color }} />
            <b>{String(index + 1).padStart(2, "0")}</b>
            {cleanLabel(module.title)}
          </button>
        );
      })}
    </nav>
  );
}
