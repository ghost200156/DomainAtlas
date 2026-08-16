import type { AtlasDocument, ConceptNode } from "../../lib/types";

import { NODE_WIDTH } from "../../lib/atlas/constants";

type RelationOverlayProps = {
  atlas: AtlasDocument;
  layout: { positions: Map<string, { x: number; y: number }> };
  unlockedConceptIds: ReadonlySet<string>;
  selected?: ConceptNode;
  hoveredId: string;
};

export function RelationOverlay({
  atlas,
  hoveredId,
  layout,
  selected,
  unlockedConceptIds,
}: RelationOverlayProps) {
  return (
    <g className="relation-overlay" aria-hidden="true">
      {atlas.relations.map((relation) => {
        if (!unlockedConceptIds.has(relation.source_id) || !unlockedConceptIds.has(relation.target_id)) return null;
        const source = layout.positions.get(relation.source_id);
        const target = layout.positions.get(relation.target_id);
        if (!source || !target) return null;
        const cx1 = source.x + NODE_WIDTH / 2;
        const cy1 = source.y + 56;
        const cx2 = target.x + NODE_WIDTH / 2;
        const cy2 = target.y + 56;
        const tdx = cx2 - cx1, tdy = cy2 - cy1;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const stopR = 55;
        const x1 = cx1, y1 = cy1;
        const x2 = cx2 - (tdx / tdist) * stopR;
        const y2 = cy2 - (tdy / tdist) * stopR;
        const active = (selected && (relation.source_id === selected.id || relation.target_id === selected.id))
          || (hoveredId && (relation.source_id === hoveredId || relation.target_id === hoveredId));
        const fromCenter = relation.source_id === '__center__' || relation.target_id === '__center__';
        const bend = Math.max(40, tdist * 0.15);
        // Control points along the line direction so arrow points at center
        const cpx1 = x1 + (tdx / tdist) * bend;
        const cpy1 = y1 + (tdy / tdist) * bend;
        const cpx2 = x2 - (tdx / tdist) * bend;
        const cpy2 = y2 - (tdy / tdist) * bend;
        void fromCenter;
        return (
          <path
            className={active ? "active" : ""}
            d={`M${x1} ${y1}C${cpx1} ${cpy1} ${cpx2} ${cpy2} ${x2} ${y2}`}
            key={relation.id}
            markerEnd={`url(#arrow-${active ? "active" : "muted"})`}
          />
        );
      })}
    </g>
  );
}
