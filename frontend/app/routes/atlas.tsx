import {
  type KeyboardEvent as ReactKeyboardEvent,
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
import { ConceptDossier, type EnrichedRelation } from "../components/ConceptDossier";
import { AtlasMap, type AtlasMapHandle } from "../components/AtlasMap";
import { RunModeBadge } from "../RunModeBadge";
import "../atlas-v2.css";

export default function AtlasRoute() {
  const { runId } = useParams();
  const { run, error, setRun } = useRunPolling(runId);
  const atlas = run?.atlas;
  const [selectedId, setSelectedId] = useState("");
  const [openedConceptIds, setOpenedConceptIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const mapRef = useRef<AtlasMapHandle>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
      markConceptOpened(conceptId);
      setSelectedId(conceptId);
      mapRef.current?.panTo(conceptId, preferredScale);
    },
    [markConceptOpened],
  );

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
  const selectedRelations: EnrichedRelation[] = selected
    ? (atlasIndex.relationsByConcept.get(selected.id) ?? [])
        .filter((relation) => {
          const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
          return unlockedConceptIds.has(otherId);
        })
        .map((relation) => {
          const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
          const other = atlasIndex.conceptsById.get(otherId);
          return {
            id: relation.id,
            otherId,
            otherName: other ? other.name : otherId,
            relation_type: relation.relation_type,
            explanation: relation.explanation,
          };
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
    // Capture selected.id before the first await — it may change while the fetch is in flight
    const conceptId = selected?.id;
    setSearchLoading(true);
    if (!append) { setCachedResults([]); setExtraResults([]); }
    try {
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
            if (conceptId) {
              setRun((prev: any) => prev ? {
                ...prev,
                pre_search_results: { ...(prev.pre_search_results ?? {}), [conceptId]: data },
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
    const firstConcept = atlasIndex?.conceptsByModule.get(moduleId)?.find((concept) => unlockedConceptIds.has(concept.id));
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
        <ConceptDossier
          selected={selected}
          selectedModule={selectedModule}
          selectedRelations={selectedRelations}
          run={run}
          revealedExamples={revealedExamples}
          searchLoading={searchLoading}
          searchResults={searchResults}
          closeButtonRef={closeButtonRef}
          onClose={() => setSelectedId("")}
          onMarkUnderstood={markUnderstood}
          onFocusConcept={(id) => focusConcept(id)}
          onRevealToggle={(qid) => setRevealedExamples(prev => {
            const next = new Set(prev);
            if (next.has(qid)) next.delete(qid);
            else next.add(qid);
            return next;
          })}
          onSearchMore={(msg, append) => searchForSources(msg, append)}
          onOpenChat={() => {
            setChatOpen(true);
            if (chatMessages.length === 0) {
              setChatMessages([{ role: "tutor" as const, text: `可以追问关于「${cleanLabel(selected.name)}」的任何细节。` }]);
            }
          }}
          onKeepFocusInDialog={keepFocusInDialog}
        />
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
