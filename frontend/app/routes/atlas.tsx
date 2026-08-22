import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router";

import { demoApi } from "../lib/api";
import { useRunPolling } from "../lib/useRunPolling";
import { cleanLabel } from "../lib/atlasUtils";
import { NodeLesson } from "../components/NodeLesson";
import { AtlasMap, type AtlasMapHandle } from "../components/AtlasMap";
import { TeachingSession } from "../components/TeachingSession";
import { type AtlasIndex } from "../lib/types";
import { RunModeBadge } from "../RunModeBadge";
import "../atlas-v2.css";

export default function AtlasRoute() {
  const { runId } = useParams();
  const { run, error, setRun } = useRunPolling(runId);
  const atlas = run?.atlas;
  const [selectedId, setSelectedId] = useState("");
  const [openedConceptIds, setOpenedConceptIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [growing, setGrowing] = useState(false);
  const [growError, setGrowError] = useState("");
  const [wrongOffer, setWrongOffer] = useState<{ conceptId: string; conceptName: string } | null>(null);
  const [expandTarget, setExpandTarget] = useState<{ conceptId: string; conceptName: string } | null>(null);
  const [teachCollapsed, setTeachCollapsed] = useState(false);
  const growChainRef = useRef<Promise<void>>(Promise.resolve());
  const mapRef = useRef<AtlasMapHandle>(null);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { setOpenedConceptIds(new Set()); }, [runId]);

  const atlasIndex = useMemo((): AtlasIndex | null => {
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
    const learningOrder = Array.from(new Set([
      ...atlas.learning_path.flatMap((stage) => stage.concept_ids),
      ...atlas.concepts.map((concept) => concept.id),
    ])).filter((conceptId) => conceptsById.has(conceptId));
    const conceptOrder = new Map(learningOrder.map((conceptId, index) => [conceptId, index + 1]));
    return { conceptsById, modulesById, conceptsByModule, relationsByConcept, conceptOrder, learningOrder };
  }, [atlas]);

  // Incremental growth: every grown node is visible. The reveal happens by
  // growing a node, not by fog — so all concepts in the atlas are unlocked.
  const unlockedConceptIds = useMemo(() => {
    if (!atlas) return new Set<string>();
    return new Set(atlas.concepts.map((concept) => concept.id));
  }, [atlas]);

  useEffect(() => {
    if (!selectedId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId("");
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedId]);

  const markConceptOpened = useCallback((conceptId: string) => {
    setOpenedConceptIds((current) => {
      if (current.has(conceptId)) return current;
      const next = new Set(current);
      next.add(conceptId);
      return next;
    });
  }, []);

  function focusConcept(conceptId: string, preferredScale = 0.9) {
    markConceptOpened(conceptId);
    setSelectedId(conceptId);
    mapRef.current?.panTo(conceptId, preferredScale);
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
  const frontierIds = new Set(
    [...unlockedConceptIds].filter((conceptId) => run.progress[conceptId] !== "understood"),
  );
  const unlockedCount = unlockedConceptIds.size;
  const selected = selectedId ? atlasIndex.conceptsById.get(selectedId) : undefined;
  const selectedModule = selected ? atlasIndex.modulesById.get(selected.module_id) : undefined;
  const selectedLabel = selected
    ? selected.id === "__center__"
      ? "中心节点"
      : selected.module_id === "__center__"
        ? `拓展 ${String(atlas.concepts.filter((c) => c.module_id === "__center__" && c.id !== "__center__").findIndex((c) => c.id === selected.id) + 1).padStart(2, "0")}`
        : `章节 ${String(atlas.modules.findIndex((m) => m.id === selected.module_id) + 1).padStart(2, "0")}`
    : undefined;
  const understood =Object.values(run.progress).filter((state) => state === "understood").length;
  const progressPercent = Math.round((understood / atlas.concepts.length) * 100);
  const visibleMatches = new Set(matchingConcepts.map((concept) => concept.id));

  async function markUnderstood() {
    if (!selected) return;
    setRun(await demoApi.updateProgress(currentRunId, selected.id, "understood"));
    setSelectedId("");
    // Marking any node understood (including the center overview) grows the next chapter.
    await growNext();
  }

  const allGrown = run?.growth_complete === true;

  async function growNext() {
    if (allGrown) return;
    const next = growChainRef.current.then(async () => {
      setGrowing(true);
      setGrowError("");
      try {
        setRun(await demoApi.growNode(currentRunId));
      } catch (reason) {
        setGrowError(reason instanceof Error ? reason.message : "生成失败，请稍后重试。");
      } finally {
        setGrowing(false);
      }
    });
    growChainRef.current = next;
    await next;
  }

  function focusModule(moduleId: string) {
    const firstConcept = atlasIndex?.conceptsByModule.get(moduleId)?.find((concept) => unlockedConceptIds.has(concept.id));
    if (firstConcept) focusConcept(firstConcept.id, 0.72);
  }

  return (
    <main className={`atlas-explorer teach-mode ${teachCollapsed ? "teach-collapsed" : ""} ${selected ? "details-open" : ""}`}>
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
          {growing ? <span className="grow-indicator">正在生成下一章（约需 1 分钟）…</span> : null}
          {!growing && growError ? (
            <button className="grow-error" onClick={() => growNext()} title="重试生成">
              {growError} · 点此重试
            </button>
          ) : null}
          <div className="compact-progress" aria-label={`学习进度 ${progressPercent}%`}>
            <span><b>{understood}</b> / {atlas.concepts.length}</span>
            <i><em style={{ width: `${progressPercent}%` }} /></i>
          </div>
        </div>
      </header>

      <AtlasMap
        ref={mapRef}
        atlas={atlas}
        atlasIndex={atlasIndex}
        selectedId={selectedId}
        unlockedConceptIds={unlockedConceptIds}
        frontierIds={frontierIds}
        openedConceptIds={openedConceptIds}
        visibleMatches={visibleMatches}
        progress={run.progress}
        runId={runId}
        onSelectConcept={setSelectedId}
        onConceptOpened={markConceptOpened}
      />

      <nav className="layer-dock" aria-hidden={selected ? true : undefined} aria-label="知识区域">
        <span>地图区域</span>
        {atlas.modules.map((module, index) => {
          const moduleDiscovered = (atlasIndex.conceptsByModule.get(module.id) ?? []).some((concept) =>
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
        <NodeLesson
          concept={selected}
          module={selectedModule}
          run={run}
          label={selectedLabel}
          onClose={() => setSelectedId("")}
          onMarkUnderstood={markUnderstood}
          onWrongAnswer={(conceptId, conceptName) => setWrongOffer({ conceptId, conceptName })}
          onExpand={(conceptId, conceptName) => {
            setTeachCollapsed(false);
            setExpandTarget({ conceptId, conceptName });
          }}
        />
      ) : null}
      <TeachingSession
        runId={runId}
        modelName={run.model_name}
        selectedConceptId={selected?.id}
        selectedConceptName={selected?.name}
        wrongOffer={wrongOffer}
        onDismissOffer={() => setWrongOffer(null)}
        onRunUpdated={setRun}
        collapsed={teachCollapsed}
        onToggleCollapse={() => setTeachCollapsed((v) => !v)}
        expandTarget={expandTarget}
        onExpandTargetConsumed={() => setExpandTarget(null)}
      />
    </main>
  );
}
