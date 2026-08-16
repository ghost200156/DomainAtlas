import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";

import { buildAtlasIndex } from "../lib/atlas/buildIndex";
import { computeAtlasLayout } from "../lib/atlas/layout";
import { cleanLabel } from "../lib/atlas/labels";
import { computeUnlocked } from "../lib/atlas/unlock";
import { useConceptChat } from "../lib/atlas/useConceptChat";
import { useConceptVerify } from "../lib/atlas/useConceptVerify";
import { usePanZoom } from "../lib/atlas/usePanZoom";
import { useSourceSearch } from "../lib/atlas/useSourceSearch";
import type { ViewState } from "../lib/atlas/types";
import { demoApi } from "../lib/api";
import { useRunPolling } from "../lib/useRunPolling";
import { AtlasDossier } from "./atlas/AtlasDossier";
import { AtlasMapSection } from "./atlas/AtlasMapSection";
import { ExplorerTopbar } from "./atlas/ExplorerTopbar";
import { TutorPanel } from "./atlas/TutorPanel";
import "../atlas-v2.css";

const INITIAL_VIEW: ViewState = { x: 40, y: 40, scale: 0.82 };

export default function AtlasRoute() {
  const { runId } = useParams();
  const { run, error, setRun } = useRunPolling(runId);
  const atlas = run?.atlas;
  const [selectedId, setSelectedId] = useState("");
  const [hoveredId, setHoveredId] = useState("");
  const [openedConceptIds, setOpenedConceptIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [revealedExamples, setRevealedExamples] = useState<Set<string>>(new Set());
  const viewportRef = useRef<HTMLDivElement>(null);

  const atlasIndex = useMemo(
    () => atlas ? buildAtlasIndex(atlas, run?.research_pack?.evidence ?? []) : null,
    [atlas, run?.research_pack?.evidence],
  );
  const layout = useMemo(() => computeAtlasLayout(atlas, atlasIndex), [atlas, atlasIndex]);
  const entryConceptId = atlasIndex?.learningOrder[0];
  const entryPosition = entryConceptId ? layout.positions.get(entryConceptId) : undefined;
  const unlockedConceptIds = useMemo(
    () => computeUnlocked(atlasIndex, run?.progress),
    [atlasIndex, run?.progress],
  );
  const selected = selectedId && atlasIndex ? atlasIndex.conceptsById.get(selectedId) : undefined;

  const markConceptOpened = useCallback((conceptId: string) => {
    setOpenedConceptIds((current) => {
      if (current.has(conceptId)) return current;
      const next = new Set(current);
      next.add(conceptId);
      return next;
    });
  }, []);
  const selectConcept = useCallback((conceptId: string) => {
    markConceptOpened(conceptId);
    setSelectedId(conceptId);
  }, [markConceptOpened]);
  const panZoom = usePanZoom(viewportRef, INITIAL_VIEW, {
    atlas,
    entryPosition,
    layout,
    onFocus: selectConcept,
    runId,
    unlockedConceptIds,
  });
  const sourceSearch = useSourceSearch(runId, selected, run, setRun);
  const chat = useConceptChat(runId, selected);
  useConceptVerify(runId, setRun);

  useEffect(() => {
    setOpenedConceptIds(new Set());
  }, [runId]);

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
  const currentAtlasIndex = atlasIndex;
  const understood = Object.values(run.progress).filter((state) => state === "understood").length;
  const progressPercent = Math.round((understood / atlas.concepts.length) * 100);
  const visibleMatches = new Set(matchingConcepts.map((concept) => concept.id));

  async function markUnderstood() {
    if (!selected) return;
    setRun(await demoApi.updateProgress(currentRunId, selected.id, "understood"));
    setSelectedId("");
  }

  function focusModule(moduleId: string) {
    const firstConcept = currentAtlasIndex.conceptsByModule.get(moduleId)?.find((concept) => unlockedConceptIds.has(concept.id));
    if (firstConcept) panZoom.focusOn(firstConcept.id, 0.72);
  }

  const toggleExample = (exampleId: string) => setRevealedExamples((current) => {
    const next = new Set(current);
    if (next.has(exampleId)) next.delete(exampleId);
    else next.add(exampleId);
    return next;
  });

  return (
    <main className="atlas-explorer">
      <ExplorerTopbar
        matchingConcepts={matchingConcepts} onQueryChange={setQuery} onSearchSubmit={panZoom.focusOn}
        progressPercent={progressPercent} query={query} run={run}
        selected={Boolean(selected)} title={cleanLabel(atlas.title)} understood={understood} unlockedCount={unlockedConceptIds.size}
      />
      <AtlasMapSection
        atlas={atlas} atlasIndex={atlasIndex} layout={layout}
        mapState={{ hoveredId, query, visibleMatches, unlockedConceptIds, openedConceptIds }}
        onFocusModule={focusModule} onHover={setHoveredId} onSelect={selectConcept}
        panZoom={panZoom} run={run} selected={selected} viewportRef={viewportRef}
      />
      {selected ? (
        <AtlasDossier
          atlasIndex={atlasIndex} chat={chat} onClose={() => setSelectedId("")}
          onMarkUnderstood={() => void markUnderstood()} onToggleExample={toggleExample} panZoom={panZoom}
          revealedExamples={revealedExamples} run={run} selected={selected} sourceSearch={sourceSearch} unlockedConceptIds={unlockedConceptIds}
        />
      ) : null}
      {chat.chatOpen ? (
        <TutorPanel
          input={chat.chatInput} loading={chat.chatLoading} messages={chat.chatMessages} modelName={run.model_name}
          onClose={() => chat.setChatOpen(false)} onInputChange={chat.setChatInput}
          onSubmit={(event) => { event.preventDefault(); void chat.sendChatMessage(); }}
        />
      ) : null}
    </main>
  );
}
