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
const MIN_SCALE = 0.15;
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

function renderMarkdown(text: string): string {
  // Strip question number prefixes and convert markdown
  let html = text
    .replace(/^题目?\d+[：:．.\s]\s*/gm, '')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, _lang: string, code: string) =>
      `<pre><code>${code.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  // ## Heading → <h4>
  html = html.replace(/^## (.+)$/gm, '<h4 class="dossier-h4">$1</h4>');
  // ### Sub-heading → <h5>
  html = html.replace(/^### (.+)$/gm, '<h5 class="dossier-h5">$1</h5>');
  // **bold** → <strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Double newline = paragraph break, single newline = line break
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
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
  const [hoveredId, setHoveredId] = useState("");
  const [openedConceptIds, setOpenedConceptIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewState>({ x: 40, y: 40, scale: 0.82 });
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // ── Chat panel state (with localStorage persistence) ──
  const CHAT_STORAGE_KEY = `domainatlas-chat-${runId}`;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "tutor"; text: string }[]>(() => {
    try { const saved = localStorage.getItem(CHAT_STORAGE_KEY); return saved ? JSON.parse(saved) : []; }
    catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  // Persist chat on every change
  useEffect(() => { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages)); }, [chatMessages, CHAT_STORAGE_KEY]);

  // ── Per-concept verify state ──
  const [verifyState, setVerifyState] = useState<Record<string, { mode: boolean; text: string; result: { passed: boolean; feedback: string } | null; loading: boolean }>>({});
  function getVerify(cid: string) {
    return verifyState[cid] ?? { mode: false, text: "", result: null, loading: false };
  }
  function setVerify(cid: string, patch: Partial<ReturnType<typeof getVerify>>) {
    setVerifyState((prev) => ({ ...prev, [cid]: { ...getVerify(cid), ...patch } }));
  }
  // Reset verify when closing concept
  function resetVerify(cid: string) {
    setVerifyState((prev) => {
      const next = { ...prev };
      delete next[cid];
      return next;
    });
  }

  // ── Spoiler state for examples ──
  const [revealedExamples, setRevealedExamples] = useState<Set<string>>(new Set());

  // ── Search state ──
  const [cachedResults, setCachedResults] = useState<{ title: string; url: string; snippet: string; source: string }[]>([]);
  const [extraResults, setExtraResults] = useState<{ title: string; url: string; snippet: string; source: string }[]>([]);
  const searchResults = [...cachedResults, ...extraResults];
  const [searchLoading, setSearchLoading] = useState(false);
  const lastSearchedCid = useRef("");
  // Load cached results from run data.  If none cached, auto-search.
  useEffect(() => {
    setExtraResults([]);
    if (selectedId && run) {
      const cached = (run as any)?.pre_search_results?.[selectedId];
      if (Array.isArray(cached) && cached.length > 0) {
        setCachedResults(cached);
        setSearchLoading(false);
      } else {
        setCachedResults([]);
        searchForSources();
      }
    } else {
      setCachedResults([]);
      setSearchLoading(false);
    }
  }, [selectedId, run]);

  useEffect(() => {
    setOpenedConceptIds(new Set());
  }, [runId]);

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
  }, [atlas, atlasIndex]);

  const entryConceptId = atlasIndex?.learningOrder[0];
  const entryPosition = entryConceptId ? layout.positions.get(entryConceptId) : undefined;

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

  const fitToViewport = useCallback((minimumScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerPos = layout.positions.get('__center__');
    const ccx = centerPos ? centerPos.x + NODE_WIDTH / 2 : layout.width / 2;
    const ccy = centerPos ? centerPos.y + NODE_HEIGHT / 2 : layout.height / 2;
    // Find farthest edge distance from center node to any unlocked concept
    let maxDist = 300;
    atlas?.concepts.forEach(c => {
      if (!unlockedConceptIds.has(c.id)) return;
      const p = layout.positions.get(c.id);
      if (p) {
        maxDist = Math.max(maxDist,
          ccx - p.x,                    // left edge
          p.x + NODE_WIDTH - ccx,       // right edge
          ccy - p.y,                    // top edge
          p.y + NODE_HEIGHT - ccy,      // bottom edge
        );
      }
    });
    const needed = maxDist * 2 - 100;
    const scale = clamp(
      Math.min((viewport.clientWidth - 72) / needed, (viewport.clientHeight - 120) / needed),
      minimumScale, 1);
    setView({
      scale,
      x: viewport.clientWidth / 2 - ccx * scale + 100,
      y: viewport.clientHeight / 2 - ccy * scale + 20,
    });
  }, [layout, atlas, unlockedConceptIds]);

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
    let lastW = window.innerWidth, lastH = window.innerHeight;
    function recenterAfterResize() {
      const dw = Math.abs(window.innerWidth - lastW);
      const dh = Math.abs(window.innerHeight - lastH);
      lastW = window.innerWidth; lastH = window.innerHeight;
      if (dw < 30 && dh < 30) return; // ignore small changes (Alt key menu bar)
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

  const markConceptOpened = useCallback((conceptId: string) => {
    setOpenedConceptIds((current) => {
      if (current.has(conceptId)) return current;
      const next = new Set(current);
      next.add(conceptId);
      return next;
    });
  }, []);

  const focusConcept = useCallback(
    (conceptId: string, preferredScale = 0.9) => {
      const viewport = viewportRef.current;
      const position = layout.positions.get(conceptId);
      if (!viewport || !position) return;
      markConceptOpened(conceptId);
      const scale = clamp(Math.max(view.scale, preferredScale), MIN_SCALE, MAX_SCALE);
      setSelectedId(conceptId);
      setView({
        scale,
        x: viewport.clientWidth / 2 - (position.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (position.y + NODE_HEIGHT / 2) * scale,
      });
    },
    [layout.positions, markConceptOpened, view.scale],
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

  // ── Chat handlers ──
  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    // Include current concept context if one is selected
    let msg = text;
    if (selected) {
      msg = `[背景：用户在学习「${cleanLabel(selected.name)}」，定义：${selected.definition.slice(0, 400)}，关键点：${selected.key_points.join('；')}]\n\n用户问题：${text}`;
    }
    setChatMessages((prev) => [...prev, { role: "user", text }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "tutor", text: data.reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "tutor", text: "导师暂不可用，请重试。" }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Verify handlers (per-concept) ──
  async function checkUnderstanding() {
    if (!selected) return;
    const cid = selected.id;
    const v = getVerify(cid);
    if (!v.text.trim() || v.loading) return;
    setVerify(cid, { loading: true, result: null });
    try {
      const res = await fetch(`/api/runs/${runId}/concepts/${cid}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explanation: v.text }),
      });
      const data = await res.json();
      setVerify(cid, { result: data });
      if (data.passed) {
        setRun(await demoApi.updateProgress(currentRunId, cid, "understood"));
      }
    } catch {
      setVerify(cid, { result: { passed: true, feedback: "验证暂不可用，已标记。" } });
      setRun(await demoApi.updateProgress(currentRunId, cid, "understood"));
    } finally {
      setVerify(cid, { loading: false });
    }
  }

  async function searchForSources(query_text?: string, append = false) {
    if (searchLoading) return;
    setSearchLoading(true);
    if (!append) { setCachedResults([]); setExtraResults([]); }
    try {
      // Use concept-specific content as context for AI
      const msg = query_text || (selected ? `概念：${selected.name}\n定义：${selected.definition.slice(0, 500)}\n关键点：${selected.key_points.join('\n')}` : "");
      if (!msg) { setSearchLoading(false); return; }
      const res = await fetch(`/api/runs/${runId}/recommend-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          if (append) {
            setExtraResults(prev => [...prev, ...data.map((r: any) => ({...r, source: 'NEW', isNew: true}))]);
          } else {
            setCachedResults(data);
            // Persist to local cache so the concept won't need re-searching
            if (selected) {
              setRun((prev: any) => prev ? {
                ...prev,
                pre_search_results: { ...(prev.pre_search_results ?? {}), [selected.id]: data },
              } : prev);
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
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
                      className={`module-terrain discovered ${module.id === selected?.module_id ? "active" : ""}`}
                      key={module.id}
                      transform={`translate(${position.x} ${position.y})`}
                    >
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
                      className={`explorer-node ${concept.id === (atlas.concepts[0]?.id) ? "root-node" : ""} ${frontierIds.has(concept.id) ? "frontier" : ""} ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""} ${run.progress[concept.id] === "understood" ? "understood" : ""}`}
                      key={concept.id}
                      onClick={() => {
                        markConceptOpened(concept.id);
                        setSelectedId(concept.id);
                      }}
                      onMouseEnter={() => setHoveredId(concept.id)}
                      onMouseLeave={() => setHoveredId("")}
                      onDragStart={(event) => event.preventDefault()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          markConceptOpened(concept.id);
                          setSelectedId(concept.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      transform={`translate(${position.x} ${position.y})`}
                    >
                      <ellipse className="node-aura" cx="85" cy="53" rx="54" ry="46" stroke={nodeColor} />
                      <GuardianGlyph variant={(conceptOrder - 1) % 5} color={nodeColor} phase={conceptOrder} />
                      {!openedConceptIds.has(concept.id) ? (
                        <circle className="node-state" cx="123" cy="23" r="6" fill={run.progress[concept.id] === "understood" ? "#278e73" : nodeColor} />
                      ) : null}
                      <text className="node-label" x="85" y="122">{cleanLabel(concept.name)}</text>
                      <text className="node-relations" x="85" y="142">{frontierIds.has(concept.id) ? "待探索" : `${relationCount} 条知识关联`}</text>
                    </g>
                  );
                })}

                {/* Module labels on top - only show when module has discovered concepts */}
                {atlas.modules.map((module, moduleIndex) => {
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
                          {cleanLabel(module.title)}
                        </span>
                      </div>
                    </foreignObject>
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
          <button className="dossier-close" onClick={() => setSelectedId("")} aria-label="关闭概念详情" ref={closeButtonRef}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="dossier-scroll">
          <header className="dossier-hero">
            <span className="module-chip"><i style={{ background: selectedModule?.color }} />{selectedModule ? cleanLabel(selectedModule.title) : "概念"}</span>
            <h2 id="concept-title">{cleanLabel(selected.name)}</h2>
          </header>

          {/* ── Answer ── */}
          <section className="dossier-answer">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.definition) }} />
          </section>

          {/* ── Key points ── */}
          {selected.key_points.length > 0 ? (
            <section className="dossier-facts">
              <ul>{selected.key_points.slice(0, 4).map((point) => <li key={point} dangerouslySetInnerHTML={{ __html: renderMarkdown(point) }} />)}</ul>
            </section>
          ) : null}

          {/* ── Why it matters + example ── */}
          <section className="dossier-why">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.why_it_matters) }} />
          </section>
          {selected.example ? (() => {
            const text = selected.example;
            // Split by blank line before 【解】 markers
            // Split into Q&A pairs: split by 【解】, pair questions with answers
            const segments = text.split(/【解】/);
            const pairs: {q: string, a: string}[] = [];
            for (let i = 0; i < segments.length; i++) {
              const seg = segments[i].trim();
              if (!seg) continue;
              if (i === 0) {
                pairs.push({q: seg, a: ''});
              } else {
                // This segment contains: answer for previous Q + possibly next question
                const nextQIdx = seg.search(/\n(?=题目?\d|判断|代码|\d+\.)/);
                if (nextQIdx >= 0) {
                  if (pairs.length > 0) pairs[pairs.length - 1].a = seg.slice(0, nextQIdx).trim();
                  pairs.push({q: seg.slice(nextQIdx).trim(), a: ''});
                } else {
                  if (pairs.length > 0) pairs[pairs.length - 1].a = seg;
                }
              }
            }
            return (
            <section className="dossier-example">
              {pairs.map((pair, idx) => {
                const qid = selected.id + '-q' + idx;
                const revealed = revealedExamples.has(qid);
                return (
                  <div key={idx} className="example-question">
                    <div className="example-prompt" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.q) }} />
                    {pair.a ? (
                      <>
                      <button className="spoiler-toggle" onClick={() => {
                        setRevealedExamples(prev => {
                          const next = new Set(prev);
                          if (next.has(qid)) next.delete(qid);
                          else next.add(qid);
                          return next;
                        });
                      }}>
                        {revealed ? '▲ 收起解法' : '▶ 显示解法'}
                      </button>
                      {revealed ? (
                        <div className="example-solution" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.a) }} />
                      ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </section>
            );
          })() : null}

          {/* ── Sources ── */}
          <section className="dossier-evidence">
            <h3>相关链接</h3>
            {searchLoading && searchResults.length === 0 ? (
              <p className="empty-detail">搜索中...</p>
            ) : null}
            {searchResults.length > 0 ? (
              <div className="search-results">
                {searchResults.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer" className="search-result-item">
                    {(r as any).isNew ? <span className="search-source">NEW</span> : null}
                    <b>{r.title}</b>
                    <p>{r.url}</p>
                  </a>
                ))}
              </div>
            ) : !searchLoading ? (
              <p className="empty-detail">正在加载来源...</p>
            ) : null}
            <button className="button button-small" onClick={() => {
              if (selected) {
                const msg = `概念：${cleanLabel(selected.name)}\n定义：${selected.definition.slice(0, 500)}\n关键点：${selected.key_points.join('；')}\n不要推荐之前已推荐过的URL。推荐具体知识点的页面，不要入门教程。`;
                searchForSources(msg, true);
              }
            }} disabled={searchLoading} style={{marginTop:10}}>
              {searchLoading ? "搜索中..." : "搜索更多链接"}
            </button>
          </section>

          {/* ── Related ── */}
          {selectedRelations.length > 0 ? (
            <section className="dossier-related">
              <h3>关联概念</h3>
              <div className="explorer-relations">
                {selectedRelations.map((relation) => {
                  const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
                  const other = atlasIndex.conceptsById.get(otherId);
                  return (
                    <button key={relation.id} onClick={() => other && focusConcept(other.id)}>
                      <span>{RELATION_LABELS[relation.relation_type] ?? relation.relation_type}</span>
                      <b>{other ? cleanLabel(other.name) : otherId}</b>
                      <small>{relation.explanation}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {(selected.misconception || selected.uncertainty) ? (
            <section className="dossier-notes">
              {selected.misconception ? <div className="note"><b>误区</b><p>{selected.misconception}</p></div> : null}
              {selected.uncertainty ? <div className="note"><b>不确定</b><p>{selected.uncertainty}</p></div> : null}
            </section>
          ) : null}
          </div>

          {/* ── Footer: mark understood (bottom-right) + ask AI ── */}
          <footer className="dossier-footer">
            <div className="dossier-actions">
              {run.progress[selected.id] !== "understood" ? (
                <button className="understood-button" onClick={markUnderstood}>标记为已理解</button>
              ) : (
                <span className="verify-passed">✓ 已理解</span>
              )}
              <button className="button button-small" onClick={() => {
                setChatOpen(true);
                if (selected && chatMessages.length === 0) {
                  setChatMessages([{role: "tutor" as const, text: `可以追问关于「${cleanLabel(selected.name)}」的任何细节。`}]);
                }
              }}>💬 向AI提问</button>
            </div>
          </footer>
        </aside>
        </div>
      ) : null}
      {chatOpen ? (
        <aside className="tutor-panel">
          <header className="tutor-header">
            <h3>{run?.model_name || "AI"}</h3>
            <button onClick={() => setChatOpen(false)} aria-label="关闭">×</button>
          </header>
          <div className="tutor-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`tutor-msg tutor-msg-${msg.role}`}>
                <b>{msg.role === "user" ? "你" : (run?.model_name || "AI")}</b>
                <p style={{whiteSpace:"pre-wrap"}}>{msg.text}</p>
              </div>
            ))}
            {chatLoading ? <div className="tutor-msg tutor-msg-tutor"><b>{run?.model_name || "AI"}</b><p>...</p></div> : null}
          </div>
          <form className="tutor-input" onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="输入问题..." disabled={chatLoading} />
            <button type="submit" disabled={chatLoading || !chatInput.trim()}>发送</button>
          </form>
        </aside>
      ) : null}
    </main>
  );
}
