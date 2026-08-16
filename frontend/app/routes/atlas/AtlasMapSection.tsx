import type { RefObject } from "react";

import type { AtlasDocument, ConceptNode, DemoRun } from "../../lib/types";

import type { AtlasIndex, AtlasLayout } from "../../lib/atlas/types";
import type { PanZoomController } from "../../lib/atlas/usePanZoom";
import { AtlasMap } from "./AtlasMap";
import { LayerDock } from "./LayerDock";
import { MapToolbar } from "./MapToolbar";

type AtlasMapSectionProps = {
  atlas: AtlasDocument;
  atlasIndex: AtlasIndex;
  layout: AtlasLayout;
  run: DemoRun;
  selected?: ConceptNode;
  mapState: {
    hoveredId: string;
    query: string;
    visibleMatches: ReadonlySet<string>;
    unlockedConceptIds: ReadonlySet<string>;
    openedConceptIds: ReadonlySet<string>;
  };
  panZoom: PanZoomController;
  viewportRef: RefObject<HTMLDivElement | null>;
  onSelect: (conceptId: string) => void;
  onHover: (conceptId: string) => void;
  onFocusModule: (moduleId: string) => void;
};

export function AtlasMapSection({
  atlas,
  atlasIndex,
  layout,
  onFocusModule,
  onHover,
  onSelect,
  mapState,
  panZoom,
  run,
  selected,
  viewportRef,
}: AtlasMapSectionProps) {
  const { hoveredId, openedConceptIds, query, unlockedConceptIds, visibleMatches } = mapState;
  return (
    <>
      <section className="map-area" aria-hidden={selected ? true : undefined} aria-label="可交互概念关系地图">
        <MapToolbar onFit={() => panZoom.fitTo()} onZoom={panZoom.zoomBy} view={panZoom.view} />
        <AtlasMap
          atlas={atlas}
          atlasIndex={atlasIndex}
          hoveredId={hoveredId}
          isPanning={panZoom.isPanning}
          layout={layout}
          onHover={onHover}
          onSelect={onSelect}
          openedConceptIds={openedConceptIds}
          pointerHandlers={panZoom.pointerHandlers}
          query={query}
          run={run}
          selected={selected}
          unlockedConceptIds={unlockedConceptIds}
          view={panZoom.view}
          viewportRef={viewportRef}
          visibleMatches={visibleMatches}
        />
      </section>
      <LayerDock
        atlas={atlas}
        conceptsByModule={atlasIndex.conceptsByModule}
        onFocusModule={onFocusModule}
        selected={selected}
        unlockedConceptIds={unlockedConceptIds}
      />
    </>
  );
}
