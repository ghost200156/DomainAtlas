import type { AtlasModule } from "../../lib/atlas/types";

import { cleanLabel } from "../../lib/atlas/labels";
import type { AtlasIndex, AtlasLayout } from "../../lib/atlas/types";

type ModuleLabelProps = {
  module: AtlasModule;
  moduleIndex: number;
  conceptsByModule: AtlasIndex["conceptsByModule"];
  layout: AtlasLayout;
  unlockedConceptIds: ReadonlySet<string>;
};

export function ModuleLabel({
  conceptsByModule,
  layout,
  module,
  moduleIndex,
  unlockedConceptIds,
}: ModuleLabelProps) {
  const modConcepts = conceptsByModule.get(module.id) ?? [];
  const modDiscovered = modConcepts.some((c: {id: string}) => unlockedConceptIds.has(c.id));
  if (!modDiscovered) return null;
  const firstConcept = modConcepts.find((c: {id: string}) => c.id !== '__center__');
  if (!firstConcept) return null;
  const pos = layout.positions.get(firstConcept.id);
  if (!pos) return null;
  const title = cleanLabel(module.title);
  const labelX = pos.x;
  const labelY = pos.y - 44;
  return (
    <foreignObject key={`label-${module.id}`} x={labelX} y={labelY} width="500" height="44">
      <div style={{
        display: 'inline-block',
        background: 'rgba(255,255,255,0.93)',
        border: `1.5px solid ${module.color}`,
        borderRadius: '6px',
        padding: '4px 10px',
        fontSize: '12px',
        lineHeight: '1.4',
        whiteSpace: 'nowrap',
      }}>
        <span style={{color: module.color, fontWeight: 700, fontSize: '11px'}}>
          区域 {String(moduleIndex + 1).padStart(2, "0")}
        </span>
        <br/>
        <span style={{color: '#1e2b4f', fontWeight: 600}}>
          {title}
        </span>
      </div>
    </foreignObject>
  );
}
