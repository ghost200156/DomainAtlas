import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router";

import { demoApi } from "../lib/api";
import { useRunPolling } from "../lib/useRunPolling";
import { RunModeBadge } from "../RunModeBadge";
import "../atlas-v2.css";

const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u;
const NODE_WIDTH = 170;
const NODE_HEIGHT = 156;
const CLUSTER_WIDTH = 760;
const CLUSTER_HEIGHT = 560;
const MAP_TOP = 104;
const MIN_SCALE = 0.78;
const MAX_SCALE = 3.2;

const RELATION_LABELS: Record<string, string> = {
  enables: "促成",
  constrains: "约束",
  informs: "支撑",
  evaluates: "检验",
  depends_on: "依赖",
};

type ViewState = { x: number; y: number; scale: number };
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  viewX: number;
  viewY: number;
};

function cleanLabel(value: string) {
  return value.replace(LEADING_SYMBOLS, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function GuardianGlyph({ variant, color, phase }: { variant: number; color: string; phase: number }) {
  const style = {
    "--guardian-color": color,
    "--guardian-delay": `${-(phase % 7) * 0.63}s`,
  } as CSSProperties;

  if (variant === 0) {
    return (
      <g className="node-guardian guardian-moth" style={style}>
        <path className="guardian-wing guardian-wing-left" d="M80 51C70 30 51 28 54 45C56 59 68 66 81 57Z" />
        <path className="guardian-wing guardian-wing-right" d="M90 51C100 30 119 28 116 45C114 59 102 66 89 57Z" />
        <ellipse className="guardian-body" cx="85" cy="52" rx="6" ry="18" />
        <circle className="guardian-head" cx="85" cy="33" r="6" />
        <path className="guardian-line" d="M82 29C77 22 72 23 70 18M88 29C93 22 98 23 100 18" />
      </g>
    );
  }
  if (variant === 1) {
    return (
      <g className="node-guardian guardian-fox" style={style}>
        <path className="guardian-tail" d="M101 62C124 68 127 45 111 44C102 44 102 53 110 54" />
        <ellipse className="guardian-body" cx="87" cy="59" rx="23" ry="14" />
        <circle className="guardian-head" cx="68" cy="43" r="14" />
        <path className="guardian-body" d="M57 34L59 20L68 31L78 20L80 36Z" />
        <circle className="guardian-eye" cx="64" cy="42" r="2" />
        <circle className="guardian-eye" cx="72" cy="42" r="2" />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <g className="node-guardian guardian-jelly" style={style}>
        <path className="guardian-body" d="M59 53C59 31 70 21 85 21C100 21 111 31 111 53C98 59 72 59 59 53Z" />
        <circle className="guardian-eye" cx="77" cy="42" r="2.4" />
        <circle className="guardian-eye" cx="93" cy="42" r="2.4" />
        <path className="guardian-line guardian-tentacles" d="M68 55C64 65 72 68 68 78M80 57C76 68 84 70 80 82M92 57C88 68 96 70 92 82M103 55C99 64 106 68 102 77" />
      </g>
    );
  }
  if (variant === 3) {
    return (
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
  }
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

export default function AtlasRoute() {
  const { runId } = useParams();
  const { run, error, setRun } = useRunPolling(runId);
  const atlas = run?.atlas;
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewState>({ x: 40, y: 40, scale: 0.82 });
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const atlasIndex = useMemo(() => {
    if (!atlas) return null;
    const conceptsById = new Map(atlas.concepts.map((concept) => [concept.id, concept]));
    const modulesById = new Map(atlas.modules.map((module) => [module.id, module]));
    const conceptsByModule = new Map(
      atlas.modules.map((module) => [
        module.id,
        atlas.concepts.filter((concept) => concept.module_id === module.id),
      ]),
    );
    const relationsByConcept = new Map(
      atlas.concepts.map((concept) => [
        concept.id,
        atlas.relations.filter(
          (relation) => relation.source_id === concept.id || relation.target_id === concept.id,
        ),
      ]),
    );
    const evidenceById = new Map(
      (run?.research_pack?.evidence ?? []).map((evidence) => [evidence.id, evidence]),
    );
    const sourcesById = new Map(atlas.sources.map((source) => [source.id, source]));
    const learningOrder = Array.from(new Set([
      ...atlas.learning_path.flatMap((stage) => stage.concept_ids),
      ...atlas.concepts.map((concept) => concept.id),
    ])).filter((conceptId) => conceptsById.has(conceptId));
    const conceptOrder = new Map(learningOrder.map((conceptId, index) => [conceptId, index + 1]));
    return {
      conceptsById,
      modulesById,
      conceptsByModule,
      relationsByConcept,
      evidenceById,
      sourcesById,
      conceptOrder,
      learningOrder,
    };
  }, [atlas, run?.research_pack?.evidence]);

  const layout = useMemo(() => {
    if (!atlas || !atlasIndex) {
      return {
        width: 1160,
        height: 680,
        positions: new Map<string, { x: number; y: number }>(),
        modulePositions: new Map<string, { x: number; y: number }>(),
      };
    }

    const columns = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(atlas.modules.length))));
    const rows = Math.ceil(atlas.modules.length / columns);
    const width = Math.max(1080, columns * CLUSTER_WIDTH + 80);
    const height = Math.max(650, MAP_TOP + rows * CLUSTER_HEIGHT + 68);
    const positions = new Map<string, { x: number; y: number }>();
    const modulePositions = new Map<string, { x: number; y: number }>();
    const offsets = [
      { x: 295, y: 196 },
      { x: 295, y: 8 },
      { x: 520, y: 82 },
      { x: 540, y: 332 },
      { x: 295, y: 408 },
      { x: 46, y: 304 },
    ];

    atlas.modules.forEach((module, moduleIndex) => {
      const concepts = atlasIndex.conceptsByModule.get(module.id) ?? [];
      const column = moduleIndex % columns;
      const row = Math.floor(moduleIndex / columns);
      const stagger = row % 2 === 1 ? 42 : 0;
      const clusterX = 34 + column * CLUSTER_WIDTH + stagger;
      const clusterY = MAP_TOP + row * CLUSTER_HEIGHT;
      modulePositions.set(module.id, { x: clusterX, y: clusterY });
      concepts.forEach((concept, conceptIndex) => {
        const offset = offsets[conceptIndex % offsets.length];
        const ring = Math.floor(conceptIndex / offsets.length);
        positions.set(concept.id, {
          x: clusterX + offset.x + ring * 18,
          y: clusterY + offset.y + ring * 18,
        });
      });
    });

    return { width, height, positions, modulePositions };
  }, [atlas, atlasIndex]);

  const entryConceptId = atlasIndex?.learningOrder[0];
  const entryPosition = entryConceptId ? layout.positions.get(entryConceptId) : undefined;

  const fitToViewport = useCallback((minimumScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scale = clamp(
      Math.min((viewport.clientWidth - 72) / layout.width, (viewport.clientHeight - 64) / layout.height),
      minimumScale,
      1,
    );
    setView({
      scale,
      x:
        minimumScale >= 1 && viewport.clientWidth < layout.width
          ? 16
          : (viewport.clientWidth - layout.width * scale) / 2,
      y: Math.max(
        (viewport.clientHeight - layout.height * scale) / 2,
        minimumScale >= 1 ? 118 - MAP_TOP * scale : Number.NEGATIVE_INFINITY,
      ),
    });
  }, [layout.height, layout.width]);

  const fitMap = useCallback(() => fitToViewport(MIN_SCALE), [fitToViewport]);

  useEffect(() => {
    if (!entryPosition) return;
    function centerEntryPoint() {
      const viewport = viewportRef.current;
      if (!viewport || !entryPosition) return;
      const scale = 1.14;
      setView({
        scale,
        x: viewport.clientWidth / 2 - (entryPosition.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (entryPosition.y + NODE_HEIGHT / 2) * scale + 26,
      });
    }
    let frame = requestAnimationFrame(centerEntryPoint);
    function recenterAfterResize() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(centerEntryPoint);
    }
    window.addEventListener("resize", recenterAfterResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", recenterAfterResize);
    };
  }, [entryPosition?.x, entryPosition?.y, runId]);

  useEffect(() => {
    if (!selectedId) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId("");
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [selectedId]);

  const focusConcept = useCallback(
    (conceptId: string, preferredScale = 0.9) => {
      const viewport = viewportRef.current;
      const position = layout.positions.get(conceptId);
      if (!viewport || !position) return;
      const scale = clamp(Math.max(view.scale, preferredScale), MIN_SCALE, MAX_SCALE);
      setSelectedId(conceptId);
      setView({
        scale,
        x: viewport.clientWidth / 2 - (position.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (position.y + NODE_HEIGHT / 2) * scale,
      });
    },
    [layout.positions, view.scale],
  );

  function zoomBy(factor: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (centerX - current.x) / current.scale;
      const worldY = (centerY - current.y) / current.scale;
      return { scale, x: centerX - worldX * scale, y: centerY - worldY * scale };
    });
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setView((current) => {
      const scale = clamp(current.scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return { scale, x: pointerX - worldX * scale, y: pointerY - worldY * scale };
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button, a, input, summary, [role='button']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    setIsPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x: drag.viewX + event.clientX - drag.startX,
      y: drag.viewY + event.clientY - drag.startY,
    }));
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  }

  const unlockedConceptIds = useMemo(() => {
    if (!atlasIndex) return new Set<string>();
    const rootId = atlasIndex.learningOrder[0];
    const unlocked = new Set<string>(rootId ? [rootId] : []);
    const understoodIds = atlasIndex.learningOrder.filter(
      (conceptId) => run?.progress[conceptId] === "understood",
    );

    understoodIds.forEach((conceptId) => {
      unlocked.add(conceptId);
      (atlasIndex.relationsByConcept.get(conceptId) ?? []).forEach((relation) => {
        unlocked.add(relation.source_id === conceptId ? relation.target_id : relation.source_id);
      });
    });
    return unlocked;
  }, [atlasIndex, run?.progress]);

  const matchingConcepts = useMemo(() => {
    if (!atlas || !query.trim()) return [];
    const keyword = query.trim().toLocaleLowerCase();
    return atlas.concepts.filter(
      (concept) => unlockedConceptIds.has(concept.id)
        && `${concept.name} ${concept.definition}`.toLocaleLowerCase().includes(keyword),
    );
  }, [atlas, query, unlockedConceptIds]);

  if (error) return <main className="state-page"><p className="form-error">{error}</p></main>;
  if (!atlas || !runId || !atlasIndex) {
    return <main className="state-page"><div className="survey-loader"><span /><span /><span /></div><h1>正在装载地图</h1></main>;
  }
  if (atlas.modules.length === 0 || atlas.concepts.length === 0) {
    return <main className="state-page"><p className="eyebrow">ATLAS INCOMPLETE</p><h1>这份地图没有生成完整</h1><p>模型返回了空结构，请重新开始一次测绘。</p></main>;
  }

  const currentRunId = runId;
  const learningOrder = atlasIndex.learningOrder;
  const frontierIds = new Set(
    [...unlockedConceptIds].filter((conceptId) => run.progress[conceptId] !== "understood"),
  );
  const unlockedCount = unlockedConceptIds.size;
  const selected = selectedId ? atlasIndex.conceptsById.get(selectedId) : undefined;
  const selectedModule = selected ? atlasIndex.modulesById.get(selected.module_id) : undefined;
  const selectedRelations = selected
    ? (atlasIndex.relationsByConcept.get(selected.id) ?? []).filter((relation) => {
        const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
        return unlockedConceptIds.has(otherId);
      })
    : [];
  const selectedEvidence = (selected?.evidence_ids ?? [])
    .map((evidenceId) => atlasIndex.evidenceById.get(evidenceId))
    .filter((item) => item !== undefined);
  const selectedMechanisms = selected
    ? atlas.mechanisms.filter((item) => item.concept_ids.includes(selected.id))
    : [];
  const selectedCases = selected
    ? atlas.cases.filter((item) => item.concept_ids.includes(selected.id))
    : [];
  const understood = Object.values(run.progress).filter((state) => state === "understood").length;
  const progressPercent = Math.round((understood / atlas.concepts.length) * 100);
  const visibleMatches = new Set(matchingConcepts.map((concept) => concept.id));
  const conceptsByModule = atlasIndex.conceptsByModule;

  async function markUnderstood() {
    if (!selected) return;
    setRun(await demoApi.updateProgress(currentRunId, selected.id, "understood"));
    setSelectedId("");
  }

  function focusModule(moduleId: string) {
    const firstConcept = conceptsByModule.get(moduleId)?.find((concept) => unlockedConceptIds.has(concept.id));
    if (firstConcept) focusConcept(firstConcept.id, 0.72);
  }

  function keepFocusInDialog(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <main className={`atlas-explorer ${selected ? "details-open" : ""}`}>
      <header className="explorer-topbar" aria-hidden={selected ? true : undefined}>
        <div className="explorer-title">
          <div className="explorer-title-row">
            <Link className="explorer-home" to="/" aria-label="返回首页">← 首页</Link>
            <p>DOMAIN ATLAS · 迷雾探索</p>
          </div>
          <h1>{cleanLabel(atlas.title)}</h1>
          <span>已发现 {unlockedCount} / {atlas.concepts.length} 个节点</span>
        </div>
        <label className="concept-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索概念"
            autoComplete="off"
            name="concept-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matchingConcepts[0]) focusConcept(matchingConcepts[0].id);
            }}
            placeholder="搜索概念，按 Enter 定位…"
            value={query}
          />
          {query ? <b aria-live="polite">{matchingConcepts.length}</b> : null}
        </label>
        <div className="explorer-status">
          <RunModeBadge run={run} />
          <div className="compact-progress" aria-label={`学习进度 ${progressPercent}%`}>
            <span><b>{understood}</b> / {atlas.concepts.length}</span>
            <i><em style={{ width: `${progressPercent}%` }} /></i>
          </div>
        </div>
      </header>

      <section className="map-area" aria-hidden={selected ? true : undefined} aria-label="可交互概念关系地图">
          <div className="map-toolbar">
            <div>
              <strong>理解一个概念，显现与它直接关联的知识分支</strong>
            </div>
            <nav aria-label="地图控制">
              <output className="zoom-readout" aria-label="当前地图缩放比例">{Math.round(view.scale * 100)}%</output>
              <button onClick={() => zoomBy(1.25)} aria-label="放大地图">＋</button>
              <button onClick={() => zoomBy(0.8)} aria-label="缩小地图">−</button>
              <button className="fit-map" onClick={fitMap}>全图</button>
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
            <svg className="atlas-stage" aria-label="SVG 矢量知识地图">
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
                  <stop offset="0" stopColor="#eef3fb" stopOpacity="1" />
                  <stop offset=".64" stopColor="#eef3fb" stopOpacity=".94" />
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
                        <ellipse cx="380" cy="275" rx="352" ry="244" />
                        <ellipse cx="380" cy="275" rx="288" ry="195" />
                        <ellipse cx="380" cy="275" rx="218" ry="142" />
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
                      className={`module-terrain discovered ${module.id === selected?.module_id ? "active" : ""}`}
                      key={module.id}
                      transform={`translate(${position.x} ${position.y})`}
                    >
                      <ellipse className="module-field" cx="380" cy="275" rx="365" ry="252" fill={`url(#module-field-${moduleIndex})`} />
                      <ellipse className="module-orbit" cx="380" cy="275" rx="344" ry="232" stroke={module.color} />
                      <circle cx="24" cy="20" r="4" fill={module.color} />
                      <text className="module-index" x="36" y="24" fill={module.color}>区域 {String(moduleIndex + 1).padStart(2, "0")}</text>
                      <text className="module-name" x="20" y="50">{cleanLabel(module.title)}</text>
                    </g>
                  );
                })}

                <g className="relation-overlay" aria-hidden="true">
                  {atlas.relations.map((relation) => {
                    if (!unlockedConceptIds.has(relation.source_id) || !unlockedConceptIds.has(relation.target_id)) return null;
                    const source = layout.positions.get(relation.source_id);
                    const target = layout.positions.get(relation.target_id);
                    if (!source || !target) return null;
                    const x1 = source.x + NODE_WIDTH / 2;
                    const y1 = source.y + 56;
                    const x2 = target.x + NODE_WIDTH / 2;
                    const y2 = target.y + 56;
                    const bend = Math.max(75, Math.abs(y2 - y1) * 0.45);
                    const active = selected
                      ? relation.source_id === selected.id || relation.target_id === selected.id
                      : false;
                    return (
                      <path
                        className={active ? "active" : ""}
                        d={`M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`}
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
                  const isSelected = concept.id === selected?.id;
                  const isDimmed = query.trim().length > 0 && !visibleMatches.has(concept.id);
                  const conceptOrder = atlasIndex.conceptOrder.get(concept.id) ?? 1;
                  const accessibleName = `${cleanLabel(concept.name)} ${relationCount} 条知识路径`;
                  return (
                    <g
                      aria-label={accessibleName}
                      className={`explorer-node ${frontierIds.has(concept.id) ? "frontier" : ""} ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""} ${run.progress[concept.id] === "understood" ? "understood" : ""}`}
                      key={concept.id}
                      onClick={() => setSelectedId(concept.id)}
                      onDragStart={(event) => event.preventDefault()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(concept.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      transform={`translate(${position.x} ${position.y})`}
                    >
                      <ellipse className="node-aura" cx="85" cy="53" rx="54" ry="46" stroke={nodeColor} />
                      <GuardianGlyph variant={(conceptOrder - 1) % 5} color={nodeColor} phase={conceptOrder} />
                      <circle className="node-state" cx="123" cy="23" r="6" fill={run.progress[concept.id] === "understood" ? "#278e73" : nodeColor} />
                      <text className="node-label" x="85" y="122">{cleanLabel(concept.name)}</text>
                      <text className="node-relations" x="85" y="142">{frontierIds.has(concept.id) ? "待探索" : `${relationCount} 条知识关联`}</text>
                    </g>
                  );
                })}

              </g>
            </svg>
          </div>
        </section>

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
              onClick={() => focusModule(module.id)}
            >
              <i style={{ background: module.color }} />
              <b>{String(index + 1).padStart(2, "0")}</b>
              {cleanLabel(module.title)}
            </button>
          );
        })}
      </nav>

      {selected ? (
        <div className="dossier-layer" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedId("");
        }}>
        <aside
          className="explorer-dossier"
          role="dialog"
          aria-modal="true"
          aria-labelledby="concept-title"
          aria-describedby="concept-definition"
          onKeyDown={keepFocusInDialog}
        >
          <i className="liquid-orb liquid-orb-one" aria-hidden="true" />
          <i className="liquid-orb liquid-orb-two" aria-hidden="true" />
          <button className="dossier-close" onClick={() => setSelectedId("")} aria-label="关闭概念详情" ref={closeButtonRef}>×</button>
          <div className="dossier-scroll">
          <header className="dossier-hero jelly-fragment jelly-from-top">
            <span className="module-chip"><i style={{ background: selectedModule?.color }} />{selectedModule ? cleanLabel(selectedModule.title) : "概念"}</span>
            <p>概念 {String(atlasIndex.conceptOrder.get(selected.id)).padStart(2, "0")}</p>
            <h2 id="concept-title">{cleanLabel(selected.name)}</h2>
            <div id="concept-definition">{selected.definition}</div>
          </header>

          <section className="dossier-focus jelly-fragment jelly-from-right">
            <h3>为什么重要</h3>
            <p>{selected.why_it_matters}</p>
          </section>

          {selected.key_points.length > 0 ? (
            <section className="explorer-detail-section jelly-fragment jelly-from-left">
              <h3>核心认识</h3>
              <ul>{selected.key_points.slice(0, 4).map((point) => <li key={point}>{point}</li>)}</ul>
            </section>
          ) : null}

          {selected.example ? (
            <section className="explorer-example jelly-fragment jelly-from-bottom"><span>例子</span><p>{selected.example}</p></section>
          ) : null}

          <section className="explorer-detail-section relation-section jelly-fragment jelly-from-bottom">
            <h3>沿关系探索 <span>{selectedRelations.length}</span></h3>
            <div className="explorer-relations">
              {selectedRelations.map((relation) => {
                const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
                const other = atlasIndex.conceptsById.get(otherId);
                return (
                  <button key={relation.id} onClick={() => other && focusConcept(other.id)}>
                    <span>{RELATION_LABELS[relation.relation_type] ?? relation.relation_type}</span>
                    <b>{other ? cleanLabel(other.name) : otherId}</b>
                    <small>{relation.explanation}</small>
                    <i>→</i>
                  </button>
                );
              })}
              {selectedRelations.length === 0 ? <p className="empty-detail">完成当前概念后，关联的知识分支将在地图中显现。</p> : null}
            </div>
          </section>

          {(selected.misconception || selected.uncertainty || selectedMechanisms.length > 0 || selectedCases.length > 0) ? (
            <details className="dossier-more">
              <summary>深入理解</summary>
              {selected.misconception ? <div><b>常见误区</b><p>{selected.misconception}</p></div> : null}
              {selected.uncertainty ? <div><b>边界与不确定性</b><p>{selected.uncertainty}</p></div> : null}
              {selectedMechanisms.map((mechanism) => <div key={mechanism.id}><b>{mechanism.title}</b><p>{mechanism.explanation}</p></div>)}
              {selectedCases.map((item) => <div key={item.id}><b>案例 · {item.title}</b><p>{item.summary}</p></div>)}
            </details>
          ) : null}

          <details className="dossier-more evidence-drawer">
            <summary>证据与来源 <span>{selectedEvidence.length}</span></summary>
            {selectedEvidence.map((evidence) => {
              const source = atlasIndex.sourcesById.get(evidence.source_id);
              return (
                <article key={evidence.id}>
                  <span>{evidence.evidence_type} · {evidence.confidence}</span>
                  <p>{evidence.statement}</p>
                  {source ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> : null}
                </article>
              );
            })}
            {selectedEvidence.length === 0 ? <p className="empty-detail">当前概念没有可展示的证据卡片。</p> : null}
          </details>
          </div>
          <footer className="dossier-footer">
            <span>{run.progress[selected.id] === "understood" ? "该区域已经完成探索" : "读完后继续，地图将显现相关知识分支"}</span>
            <button className="understood-button" onClick={markUnderstood} disabled={run.progress[selected.id] === "understood"}>
              {run.progress[selected.id] === "understood" ? "✓ 已完成探索" : "完成探索，揭开关联分支"}
            </button>
          </footer>
        </aside>
        </div>
      ) : null}
    </main>
  );
}
