import type { AtlasDocument } from "../../lib/types";

import type { AtlasIndex, AtlasLayout } from "../../lib/atlas/types";

type FogFieldProps = {
  atlas: AtlasDocument;
  layout: AtlasLayout;
  conceptsByModule: AtlasIndex["conceptsByModule"];
  unlockedConceptIds: ReadonlySet<string>;
  selectedModuleId?: string;
};

export function FogField({
  atlas,
  conceptsByModule,
  layout,
  selectedModuleId,
  unlockedConceptIds,
}: FogFieldProps) {
  return (
    <>
      <g className="fog-field" aria-hidden="true">
        <rect className="fog-veil" x="-5000" y="-5000" width="10000" height="10000" />
        <g className="mist-drift mist-drift-a">
          <ellipse cx="360" cy="260" rx="720" ry="190" />
          <ellipse cx="1220" cy="760" rx="880" ry="230" />
        </g>
        <g className="mist-drift mist-drift-b">
          <ellipse cx="980" cy="80" rx="610" ry="155" />
          <ellipse cx="240" cy="940" rx="760" ry="210" />
        </g>
        <g className="mist-drift mist-drift-c">
          <ellipse cx="620" cy="610" rx="440" ry="126" />
          <ellipse cx="1580" cy="350" rx="520" ry="142" />
        </g>
        {atlas.modules.map((module) => {
          const position = layout.modulePositions.get(module.id);
          return position ? (
            <g className="fog-contours" key={`fog-contours-${module.id}`} transform={`translate(${position.x} ${position.y})`}>
              <ellipse cx="0" cy="0" rx="280" ry="200" />
              <ellipse cx="0" cy="0" rx="220" ry="150" />
              <ellipse cx="0" cy="0" rx="160" ry="100" />
            </g>
          ) : null;
        })}
      </g>
      <g className="explored-clearings" aria-hidden="true">
        {atlas.concepts.map((concept) => {
          if (!unlockedConceptIds.has(concept.id)) return null;
          const position = layout.positions.get(concept.id);
          return position ? <ellipse key={`clearing-${concept.id}`} cx={position.x + 85} cy={position.y + 60} rx="164" ry="142" /> : null;
        })}
      </g>
      {atlas.modules.map((module, moduleIndex) => {
        const position = layout.modulePositions.get(module.id);
        if (!position) return null;
        const moduleDiscovered = (conceptsByModule.get(module.id) ?? []).some((concept) =>
          unlockedConceptIds.has(concept.id),
        );
        if (!moduleDiscovered) return null;
        return (
          <g
            aria-hidden="true"
            className={`module-terrain ${module.id === selectedModuleId ? "active" : ""}`}
            key={module.id}
            transform={`translate(${position.x} ${position.y})`}
          >
            <ellipse className="module-field" cx="0" cy="0" rx="300" ry="200" fill={`url(#module-field-${moduleIndex})`} />
            <ellipse className="module-orbit" cx="0" cy="0" rx="290" ry="190" stroke={module.color} opacity="0.4" />
          </g>
        );
      })}
    </>
  );
}
