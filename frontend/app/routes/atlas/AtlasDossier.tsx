import { useRef } from "react";

import { cleanLabel } from "../../lib/atlas/labels";
import type { AtlasIndex } from "../../lib/atlas/types";
import type { ConceptChatController } from "../../lib/atlas/useConceptChat";
import type { PanZoomController } from "../../lib/atlas/usePanZoom";
import type { SourceSearchController } from "../../lib/atlas/useSourceSearch";
import type { ConceptNode, DemoRun } from "../../lib/types";
import {
  ConceptDossier,
  ConceptDossierFooter,
  DossierSections,
} from "./ConceptDossier";

type AtlasDossierProps = {
  selected: ConceptNode;
  atlasIndex: AtlasIndex;
  unlockedConceptIds: ReadonlySet<string>;
  revealedExamples: ReadonlySet<string>;
  onToggleExample: (exampleId: string) => void;
  run: DemoRun;
  sourceSearch: SourceSearchController;
  chat: ConceptChatController;
  panZoom: PanZoomController;
  onClose: () => void;
  onMarkUnderstood: () => void;
};

export function AtlasDossier({
  atlasIndex,
  chat,
  onClose,
  onMarkUnderstood,
  onToggleExample,
  panZoom,
  revealedExamples,
  run,
  selected,
  sourceSearch,
  unlockedConceptIds,
}: AtlasDossierProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectedModule = atlasIndex.modulesById.get(selected.module_id);
  return (
    <ConceptDossier
      closeButtonRef={closeButtonRef}
      footer={<ConceptDossierFooter
        onMarkUnderstood={onMarkUnderstood}
        onOpenChat={chat.openChat}
        understood={run.progress[selected.id] === "understood"}
      />}
      onClose={onClose}
      selected={selected}
      selectedModule={selectedModule}
    >
      <DossierSections
        atlasIndex={atlasIndex}
        onFocusConcept={panZoom.focusOn}
        onSearchMore={() => sourceSearch.searchForSources(`概念：${cleanLabel(selected.name)}\n定义：${selected.definition.slice(0, 500)}\n关键点：${selected.key_points.join('；')}\n不要推荐之前已推荐过的URL。推荐具体知识点的页面，不要入门教程。`, true)}
        onToggleExample={onToggleExample}
        revealedExamples={revealedExamples}
        searchLoading={sourceSearch.searchLoading}
        searchResults={sourceSearch.searchResults}
        selected={selected}
        unlockedConceptIds={unlockedConceptIds}
      />
    </ConceptDossier>
  );
}
