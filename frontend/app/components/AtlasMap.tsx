import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { type AtlasDocument, type ConceptNode } from "../lib/types";
import { cleanLabel, clamp } from "../lib/atlasUtils";

// ── Constants (map geometry) ────────────────────────────────────────────────
const NODE_WIDTH = 170;
const NODE_HEIGHT = 156;
const CLUSTER_WIDTH = 760;
const CLUSTER_HEIGHT = 560;
const MAP_TOP = 104;
const MIN_SCALE = 0.15;
const MAX_SCALE = 3.2;

const STATIC_SVG_DEFS = (
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
  </defs>
);

// ── Types ────────────────────────────────────────────────────────────────────
type ViewState = { x: number; y: number; scale: number };
type DragState = { pointerId: number; startX: number; startY: number; viewX: number; viewY: number };

export type AtlasIndex = {
  conceptsById: Map<string, ConceptNode>;
  modulesById: Map<string, { id: string; title: string; color: string; summary: string }>;
  conceptsByModule: Map<string, ConceptNode[]>;
  relationsByConcept: Map<string, { id: string; source_id: string; target_id: string; relation_type: string; explanation: string }[]>;
  conceptOrder: Map<string, number>;
  learningOrder: string[];
};

export interface AtlasMapHandle {
  panTo(conceptId: string, preferredScale?: number): void;
  fitMap(): void;
}

export interface AtlasMapProps {
  atlas: AtlasDocument;
  atlasIndex: AtlasIndex;
  selectedId: string;
  unlockedConceptIds: Set<string>;
  frontierIds: Set<string>;
  openedConceptIds: Set<string>;
  visibleMatches: Set<string>;
  progress: Record<string, string>;
  runId: string;
  onSelectConcept: (id: string) => void;
  onConceptOpened: (id: string) => void;
  ref?: Ref<AtlasMapHandle>;
}

// ── GuardianGlyph — purely decorative SVG node illustrations ─────────────
function GuardianGlyph({ variant, color, phase }: { variant: number; color: string; phase: number }) {
  const style = { "--guardian-color": color, "--guardian-delay": `${-(phase % 7) * 0.63}s` } as CSSProperties;
  if (variant === 0) return (
    <g className="node-guardian guardian-moth" style={style}>
      <path className="guardian-wing guardian-wing-left" d="M80 51C70 30 51 28 54 45C56 59 68 66 81 57Z" />
      <path className="guardian-wing guardian-wing-right" d="M90 51C100 30 119 28 116 45C114 59 102 66 89 57Z" />
      <ellipse className="guardian-body" cx="85" cy="52" rx="6" ry="18" />
      <circle className="guardian-head" cx="85" cy="33" r="6" />
      <path className="guardian-line" d="M82 29C77 22 72 23 70 18M88 29C93 22 98 23 100 18" />
    </g>
  );
  if (variant === 1) return (
    <g className="node-guardian guardian-fox" style={style}>
      <path className="guardian-tail" d="M101 62C124 68 127 45 111 44C102 44 102 53 110 54" />
      <ellipse className="guardian-body" cx="87" cy="59" rx="23" ry="14" />
      <circle className="guardian-head" cx="68" cy="43" r="14" />
      <path className="guardian-body" d="M57 34L59 20L68 31L78 20L80 36Z" />
      <circle className="guardian-eye" cx="64" cy="42" r="2" />
      <circle className="guardian-eye" cx="72" cy="42" r="2" />
    </g>
  );
  if (variant === 2) return (
    <g className="node-guardian guardian-jelly" style={style}>
      <path className="guardian-body" d="M59 53C59 31 70 21 85 21C100 21 111 31 111 53C98 59 72 59 59 53Z" />
      <circle className="guardian-eye" cx="77" cy="42" r="2.4" />
      <circle className="guardian-eye" cx="93" cy="42" r="2.4" />
      <path className="guardian-line guardian-tentacles" d="M68 55C64 65 72 68 68 78M80 57C76 68 84 70 80 82M92 57C88 68 96 70 92 82M103 55C99 64 106 68 102 77" />
    </g>
  );
  if (variant === 3) return (
    <g className="node-guardian guardian-owl" style={style}>
      <ellipse className="guardian-body" cx="85" cy="53" rx="24" ry="29" />
      <path className="guardian-wing guardian-wing-left" d="M65 45C50 50 52 66 70 69Z" />
      <path className="guardian-wing guardian-wing-right" d="M105 45C120 50 118 66 100 69Z" />
      <circle className="guardian-face" cx="76" cy="43" r="9" />
      <circle className="guardian-face" cx="94" cy="43" r="9" />
      <circle className="guardian-eye" cx="76" cy="43" r="3" />
      <circle className="guardian-eye" cx="94" cy="43" r="3" />
      <path className="guardian-beak" d="M82 49L85 55L88 49Z" />
    </g>
  );
  return (
    <g className="node-guardian guardian-deer" style={style}>
      <ellipse className="guardian-body" cx="83" cy="60" rx="25" ry="14" />
      <path className="guardian-line guardian-legs" d="M69 69L66 82M91 70L94 82" />
      <path className="guardian-neck" d="M98 59C98 47 101 40 107 36" />
      <ellipse className="guardian-head" cx="108" cy="33" rx="10" ry="8" />
      <path className="guardian-line guardian-antlers" d="M105 27L100 18M101 23L95 21M111 27L116 18M115 23L121 21" />
      <circle className="guardian-eye" cx="111" cy="32" r="1.8" />
    </g>
  );
}

// ── AtlasMap ─────────────────────────────────────────────────────────────────
export function AtlasMap({
  atlas,
  atlasIndex,
  selectedId,
  unlockedConceptIds,
  frontierIds,
  openedConceptIds,
  visibleMatches,
  progress,
  runId,
  onSelectConcept,
  onConceptOpened,
  ref,
}: AtlasMapProps) {
  // ── Internal view state (pan/zoom never bubbles to parent) ──
  const [view, setView] = useState<ViewState>({ x: 40, y: 40, scale: 0.82 });
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredId, setHoveredId] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // ── Layout computation (only needed inside the map) ──
  const layout = useMemo(() => {
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
      const concepts = rawConcepts.filter((c) => c.id !== "__center__");
      const angle = (moduleIndex / atlas.modules.length) * 2 * Math.PI - Math.PI / 2;
      const clusterX = cx + Math.cos(angle) * ringR;
      const clusterY = cy + Math.sin(angle) * ringR;
      modulePositions.set(module.id, { x: clusterX, y: clusterY });
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const SPREAD = (Math.PI * 2) / 3;
      const DIST = 260;
      concepts.forEach((concept, i) => {
        if (i === 0) {
          positions.set(concept.id, { x: clusterX - NODE_WIDTH / 2, y: clusterY - NODE_HEIGHT / 2 });
        } else {
          const leafIndex = i - 1;
          const leafCount = concepts.length - 1;
          const step = leafCount > 0 ? SPREAD / leafCount : 0;
          const localAngle = -SPREAD / 2 + step / 2 + leafIndex * step;
          const rx = Math.cos(localAngle) * DIST;
          const ry = Math.sin(localAngle) * DIST;
          const worldRx = rx * cosA - ry * sinA;
          const worldRy = rx * sinA + ry * cosA;
          positions.set(concept.id, { x: clusterX + worldRx - NODE_WIDTH / 2, y: clusterY + worldRy - NODE_HEIGHT / 2 });
        }
      });
    });

    if (atlas.concepts[0]?.id === "__center__") {
      positions.set(atlas.concepts[0].id, { x: cx - NODE_WIDTH / 2, y: cy - NODE_HEIGHT / 2 });
    }
    return { width, height, positions, modulePositions };
  }, [atlas, atlasIndex]);

  // ── Entry centering on load / resize ──
  const entryConceptId = atlasIndex.learningOrder[0];
  const entryPosition = entryConceptId ? layout.positions.get(entryConceptId) : undefined;

  useEffect(() => {
    if (!entryPosition) return;
    function centerEntry() {
      const viewport = viewportRef.current;
      if (!viewport || !entryPosition) return;
      const scale = 1.14;
      setView({
        scale,
        x: viewport.clientWidth / 2 - (entryPosition.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (entryPosition.y + NODE_HEIGHT / 2) * scale + 26,
      });
    }
    let frame = requestAnimationFrame(centerEntry);
    let lastW = window.innerWidth, lastH = window.innerHeight;
    function onResize() {
      const dw = Math.abs(window.innerWidth - lastW);
      const dh = Math.abs(window.innerHeight - lastH);
      lastW = window.innerWidth; lastH = window.innerHeight;
      if (dw < 30 && dh < 30) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(centerEntry);
    }
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", onResize); };
  }, [entryPosition?.x, entryPosition?.y, runId]);

  // ── Pan / zoom internals ──
  const fitToViewport = useCallback((minimumScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerPos = layout.positions.get("__center__");
    const ccx = centerPos ? centerPos.x + NODE_WIDTH / 2 : layout.width / 2;
    const ccy = centerPos ? centerPos.y + NODE_HEIGHT / 2 : layout.height / 2;
    let maxDist = 300;
    atlas.concepts.forEach((c) => {
      if (!unlockedConceptIds.has(c.id)) return;
      const p = layout.positions.get(c.id);
      if (p) maxDist = Math.max(maxDist, ccx - p.x, p.x + NODE_WIDTH - ccx, ccy - p.y, p.y + NODE_HEIGHT - ccy);
    });
    const needed = maxDist * 2 - 100;
    const scale = clamp(Math.min((viewport.clientWidth - 72) / needed, (viewport.clientHeight - 120) / needed), minimumScale, 1);
    setView({ scale, x: viewport.clientWidth / 2 - ccx * scale + 100, y: viewport.clientHeight / 2 - ccy * scale + 20 });
  }, [layout, atlas, unlockedConceptIds]);

  function zoomBy(factor: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    setView((cur) => {
      const scale = clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE);
      return { scale, x: cx - ((cx - cur.x) / cur.scale) * scale, y: cy - ((cy - cur.y) / cur.scale) * scale };
    });
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setView((cur) => {
      const scale = clamp(cur.scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
      return { scale, x: px - ((px - cur.x) / cur.scale) * scale, y: py - ((py - cur.y) / cur.scale) * scale };
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button, a, input, summary, [role='button']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y };
    setIsPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((cur) => ({ ...cur, x: drag.viewX + event.clientX - drag.startX, y: drag.viewY + event.clientY - drag.startY }));
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  }

  // ── Imperative API for parent (focus/fit without lifting view state) ──
  useImperativeHandle(ref, () => ({
    panTo(conceptId: string, preferredScale = 0.9) {
      const viewport = viewportRef.current;
      const position = layout.positions.get(conceptId);
      if (!viewport || !position) return;
      const scale = clamp(Math.max(view.scale, preferredScale), MIN_SCALE, MAX_SCALE);
      setView({
        scale,
        x: viewport.clientWidth / 2 - (position.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (position.y + NODE_HEIGHT / 2) * scale,
      });
    },
    fitMap() { fitToViewport(MIN_SCALE); },
  }), [layout, view.scale, fitToViewport]);

  const conceptsByModule = atlasIndex.conceptsByModule;
  const selected = selectedId ? atlasIndex.conceptsById.get(selectedId) : undefined;

  return (
    <section className="map-area" aria-hidden={selectedId ? true : undefined} aria-label="可交互概念关系地图">
      <div className="map-toolbar">
        <div><strong>理解一个概念，显现与它直接关联的知识分支</strong></div>
        <nav aria-label="地图控制">
          <output className="zoom-readout" aria-label="当前地图缩放比例">{Math.round(view.scale * 100)}%</output>
          <button onClick={() => zoomBy(1.25)} aria-label="放大地图">＋</button>
          <button onClick={() => zoomBy(0.8)} aria-label="缩小地图">−</button>
          <button className="fit-map" onClick={() => fitToViewport(MIN_SCALE)}>全图</button>
        </nav>
      </div>

      <div
        className={`map-viewport ${isPanning ? "panning" : ""}`}
        onPointerCancel={endPan}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onWheel={handleWheel}
        ref={viewportRef}
      >
        <svg className="atlas-stage" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMid yMid meet" aria-label="SVG 矢量知识地图">
          {STATIC_SVG_DEFS}
          <defs>
            {atlas.modules.map((module, moduleIndex) => (
              <radialGradient id={`module-field-${moduleIndex}`} key={module.id}>
                <stop offset="0" stopColor={module.color} stopOpacity=".16" />
                <stop offset=".58" stopColor={module.color} stopOpacity=".055" />
                <stop offset="1" stopColor={module.color} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          <g className="vector-map-layer" transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
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
              const moduleDiscovered = (conceptsByModule.get(module.id) ?? []).some((c) => unlockedConceptIds.has(c.id));
              if (!moduleDiscovered) return null;
              return (
                <g aria-hidden="true" className={`module-terrain discovered ${module.id === selected?.module_id ? "active" : ""}`} key={module.id} transform={`translate(${position.x} ${position.y})`}>
                  <ellipse className="module-field" cx="0" cy="0" rx="300" ry="200" fill={`url(#module-field-${moduleIndex})`} />
                  <ellipse className="module-orbit" cx="0" cy="0" rx="290" ry="190" stroke={module.color} opacity="0.4" />
                </g>
              );
            })}

            <g className="relation-overlay" aria-hidden="true">
              {atlas.relations.map((relation) => {
                if (!unlockedConceptIds.has(relation.source_id) || !unlockedConceptIds.has(relation.target_id)) return null;
                const source = layout.positions.get(relation.source_id);
                const target = layout.positions.get(relation.target_id);
                if (!source || !target) return null;
                const cx1 = source.x + NODE_WIDTH / 2, cy1 = source.y + 56;
                const cx2 = target.x + NODE_WIDTH / 2, cy2 = target.y + 56;
                const tdx = cx2 - cx1, tdy = cy2 - cy1;
                const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
                const stopR = 55;
                const x2 = cx2 - (tdx / tdist) * stopR, y2 = cy2 - (tdy / tdist) * stopR;
                const bend = Math.max(40, tdist * 0.15);
                const cpx1 = cx1 + (tdx / tdist) * bend, cpy1 = cy1 + (tdy / tdist) * bend;
                const cpx2 = x2 - (tdx / tdist) * bend, cpy2 = y2 - (tdy / tdist) * bend;
                const active = (selectedId && (relation.source_id === selectedId || relation.target_id === selectedId))
                  || (hoveredId && (relation.source_id === hoveredId || relation.target_id === hoveredId));
                return (
                  <path
                    className={active ? "active" : ""}
                    d={`M${cx1} ${cy1}C${cpx1} ${cpy1} ${cpx2} ${cpy2} ${x2} ${y2}`}
                    key={relation.id}
                    markerEnd={`url(#arrow-${active ? "active" : "muted"})`}
                  />
                );
              })}
            </g>

            {atlas.concepts.map((concept) => {
              if (!unlockedConceptIds.has(concept.id)) return null;
              const position = layout.positions.get(concept.id);
              if (!position) return null;
              const module = atlasIndex.modulesById.get(concept.module_id);
              const nodeColor = module?.color ?? "#6267dc";
              const relationCount = atlasIndex.relationsByConcept.get(concept.id)?.length ?? 0;
              const isSelected = concept.id === selectedId;
              const isDimmed = visibleMatches.size > 0 && !visibleMatches.has(concept.id);
              const conceptOrder = atlasIndex.conceptOrder.get(concept.id) ?? 1;
              return (
                <g
                  aria-label={`${cleanLabel(concept.name)} ${relationCount} 条知识路径`}
                  className={`explorer-node ${concept.id === atlas.concepts[0]?.id ? "root-node" : ""} ${frontierIds.has(concept.id) ? "frontier" : ""} ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""} ${progress[concept.id] === "understood" ? "understood" : ""}`}
                  key={concept.id}
                  onClick={() => { onConceptOpened(concept.id); onSelectConcept(concept.id); }}
                  onMouseEnter={() => setHoveredId(concept.id)}
                  onMouseLeave={() => setHoveredId("")}
                  onDragStart={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onConceptOpened(concept.id); onSelectConcept(concept.id); }
                  }}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${position.x} ${position.y})`}
                >
                  <ellipse className="node-aura" cx="85" cy="53" rx="54" ry="46" stroke={nodeColor} />
                  <GuardianGlyph variant={(conceptOrder - 1) % 5} color={nodeColor} phase={conceptOrder} />
                  {!openedConceptIds.has(concept.id) ? (
                    <circle className="node-state" cx="123" cy="23" r="6" fill={progress[concept.id] === "understood" ? "#278e73" : nodeColor} />
                  ) : null}
                  <text className="node-label" x="85" y="122">{cleanLabel(concept.name)}</text>
                  <text className="node-relations" x="85" y="142">{frontierIds.has(concept.id) ? "待探索" : `${relationCount} 条知识关联`}</text>
                </g>
              );
            })}

            {atlas.modules.map((module, moduleIndex) => {
              const modConcepts = conceptsByModule.get(module.id) ?? [];
              const modDiscovered = modConcepts.some((c) => unlockedConceptIds.has(c.id));
              if (!modDiscovered) return null;
              const firstConcept = modConcepts.find((c) => c.id !== "__center__");
              if (!firstConcept) return null;
              const pos = layout.positions.get(firstConcept.id);
              if (!pos) return null;
              return (
                <foreignObject key={`label-${module.id}`} x={pos.x} y={pos.y - 44} width="500" height="44">
                  <div style={{ display: "inline-block", background: "rgba(255,255,255,0.93)", border: `1.5px solid ${module.color}`, borderRadius: "6px", padding: "4px 10px", fontSize: "12px", lineHeight: "1.4", whiteSpace: "nowrap" }}>
                    <span style={{ color: module.color, fontWeight: 700, fontSize: "11px" }}>区域 {String(moduleIndex + 1).padStart(2, "0")}</span>
                    <br />
                    <span style={{ color: "#1e2b4f", fontWeight: 600 }}>{cleanLabel(module.title)}</span>
                  </div>
                </foreignObject>
              );
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}
