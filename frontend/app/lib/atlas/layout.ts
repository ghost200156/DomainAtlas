import type { AtlasDocument } from "../types";

import {
  CLUSTER_HEIGHT,
  CLUSTER_WIDTH,
  MAP_TOP,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./constants";
import type { AtlasIndex, AtlasLayout } from "./types";

export function computeAtlasLayout(
  atlas: AtlasDocument | undefined,
  atlasIndex: AtlasIndex | null | undefined,
): AtlasLayout {
  if (!atlas || !atlasIndex) {
    return { width: 1400, height: 1000, positions: new Map(), modulePositions: new Map() };
  }

  const columns = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(atlas.modules.length))));
  const rows = Math.ceil(atlas.modules.length / columns);
  const size = Math.max(1080, columns * CLUSTER_WIDTH + 80, MAP_TOP + rows * CLUSTER_HEIGHT + 68);
  const width = size;
  const height = size;
  const positions = new Map<string, { x: number; y: number }>();
  const modulePositions = new Map<string, { x: number; y: number }>();
  const cx = width / 2, cy = height / 2;
  const ringR = Math.min(width, height) / 4.5;

  atlas.modules.forEach((module, moduleIndex) => {
    const rawConcepts = atlasIndex.conceptsByModule.get(module.id) ?? [];
    const concepts = rawConcepts.filter((c: {id: string}) => c.id !== '__center__');
    const angle = (moduleIndex / atlas.modules.length) * 2 * Math.PI - Math.PI / 2;
    const clusterX = cx + Math.cos(angle) * ringR;
    const clusterY = cy + Math.sin(angle) * ringR;
    modulePositions.set(module.id, { x: clusterX, y: clusterY });
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // First concept is the region root — stays at module centre.
    // Remaining concepts (leaves) are evenly distributed in a 60° fan
    // centred on the radial direction, all at the same distance.
    const SPREAD = (Math.PI * 2) / 3;    // 120° total arc
    const DIST = 260;                    // unified leaf distance from module centre
    concepts.forEach((concept, i) => {
      if (i === 0) {
        // Root stays at module centre
        positions.set(concept.id, {
          x: clusterX - NODE_WIDTH / 2,
          y: clusterY - NODE_HEIGHT / 2,
        });
      } else {
        const leafIndex = i - 1;
        const leafCount = concepts.length - 1;
        const step = leafCount > 0 ? SPREAD / leafCount : 0;
        const localAngle = -SPREAD / 2 + step / 2 + leafIndex * step;
        const rx = Math.cos(localAngle) * DIST;
        const ry = Math.sin(localAngle) * DIST;
        // Rotate by module angle so the fan points radially outward
        const worldRx = rx * cosA - ry * sinA;
        const worldRy = rx * sinA + ry * cosA;
        positions.set(concept.id, {
          x: clusterX + worldRx - NODE_WIDTH / 2,
          y: clusterY + worldRy - NODE_HEIGHT / 2,
        });
      }
    });
  });

  if (atlas.concepts[0]?.id === "__center__") {
    positions.set(atlas.concepts[0].id, { x: cx - NODE_WIDTH / 2, y: cy - NODE_HEIGHT / 2 });
  }

  return { width, height, positions, modulePositions };
}
