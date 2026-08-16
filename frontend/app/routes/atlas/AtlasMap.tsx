import type { RefObject } from "react";

import type { AtlasDocument, ConceptNode as ConceptNodeData, DemoRun } from "../../lib/types";

import type { AtlasIndex, AtlasLayout, ViewState } from "../../lib/atlas/types";
import type { PanZoomPointerHandlers } from "../../lib/atlas/usePanZoom";
import { FogField } from "./FogField";
import { ConceptNode } from "./ConceptNode";
import { ModuleLabel } from "./ModuleLabel";
import { RelationOverlay } from "./RelationOverlay";

type AtlasMapProps = {
  atlas: AtlasDocument;
  atlasIndex: AtlasIndex;
  layout: AtlasLayout;
  run: DemoRun;
  selected?: ConceptNodeData;
  hoveredId: string;
  query: string;
  visibleMatches: ReadonlySet<string>;
  unlockedConceptIds: ReadonlySet<string>;
  openedConceptIds: ReadonlySet<string>;
  view: ViewState;
  isPanning: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  pointerHandlers: PanZoomPointerHandlers;
  onSelect: (conceptId: string) => void;
  onHover: (conceptId: string) => void;
};

export function AtlasMap({
  atlas,
  atlasIndex,
  hoveredId,
  isPanning,
  layout,
  onHover,
  onSelect,
  openedConceptIds,
  pointerHandlers,
  query,
  run,
  selected,
  unlockedConceptIds,
  view,
  viewportRef,
  visibleMatches,
}: AtlasMapProps) {
  return (
    <div
      className={`map-viewport ${isPanning ? "panning" : ""}`}
      onPointerCancel={pointerHandlers.onPointerCancel}
      onPointerDown={pointerHandlers.onPointerDown}
      onPointerMove={pointerHandlers.onPointerMove}
      onPointerUp={pointerHandlers.onPointerUp}
      onWheel={pointerHandlers.onWheel}
      ref={viewportRef}
    >
      <svg className="atlas-stage" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMid yMid meet" aria-label="SVG 矢量知识地图">
        <defs>
          <marker id="arrow-muted" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0L8 4L0 8Z" fill="#8494b5" />
          </marker>
          <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0L8 4L0 8Z" fill="#5154dc" />
          </marker>
          <linearGradient id="fog-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4f7fc" stopOpacity=".96" />
            <stop offset=".52" stopColor="#dfe6f1" stopOpacity=".94" />
            <stop offset="1" stopColor="#cbd5e5" stopOpacity=".9" />
          </linearGradient>
          <radialGradient id="clearing-fill">
            <stop offset="0" stopColor="#eef3fb" stopOpacity=".7" />
            <stop offset=".64" stopColor="#eef3fb" stopOpacity=".5" />
            <stop offset="1" stopColor="#eef3fb" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mist-light-fill">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".42" />
            <stop offset=".62" stopColor="#ffffff" stopOpacity=".18" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mist-shadow-fill">
            <stop offset="0" stopColor="#aebbd2" stopOpacity=".25" />
            <stop offset=".58" stopColor="#b8c4d8" stopOpacity=".1" />
            <stop offset="1" stopColor="#c5cede" stopOpacity="0" />
          </radialGradient>
          {atlas.modules.map((module, moduleIndex) => (
            <radialGradient id={`module-field-${moduleIndex}`} key={module.id}>
              <stop offset="0" stopColor={module.color} stopOpacity=".16" />
              <stop offset=".58" stopColor={module.color} stopOpacity=".055" />
              <stop offset="1" stopColor={module.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        <g className="vector-map-layer" transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <FogField
            atlas={atlas}
            conceptsByModule={atlasIndex.conceptsByModule}
            layout={layout}
            selectedModuleId={selected?.module_id}
            unlockedConceptIds={unlockedConceptIds}
          />
          <RelationOverlay
            atlas={atlas}
            hoveredId={hoveredId}
            layout={layout}
            selected={selected}
            unlockedConceptIds={unlockedConceptIds}
          />
          {atlas.concepts.map((concept) => {
            if (!unlockedConceptIds.has(concept.id)) return null;
            const position = layout.positions.get(concept.id);
            if (!position) return null;
            const module = atlasIndex.modulesById.get(concept.module_id);
            const relationCount = atlasIndex.relationsByConcept.get(concept.id)?.length ?? 0;
            return (
              <ConceptNode
                atlas={atlas}
                concept={concept}
                conceptOrder={atlasIndex.conceptOrder.get(concept.id) ?? 1}
                isDimmed={query.trim().length > 0 && !visibleMatches.has(concept.id)}
                isFrontier={unlockedConceptIds.has(concept.id) && run.progress[concept.id] !== "understood"}
                isOpened={openedConceptIds.has(concept.id)}
                isSelected={concept.id === selected?.id}
                key={concept.id}
                moduleColor={module?.color ?? "#6267dc"}
                onHover={onHover}
                onSelect={onSelect}
                position={position}
                progress={run.progress}
                relationCount={relationCount}
              />
            );
          })}
          {atlas.modules.map((module, moduleIndex) => (
            <ModuleLabel
              conceptsByModule={atlasIndex.conceptsByModule}
              key={module.id}
              layout={layout}
              module={module}
              moduleIndex={moduleIndex}
              unlockedConceptIds={unlockedConceptIds}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
