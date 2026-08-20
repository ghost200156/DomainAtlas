import { type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

import { type AtlasModule, type ConceptNode, type DemoRun } from "../lib/types";
import { cleanLabel, RELATION_LABELS, renderMarkdown } from "../lib/atlasUtils";

// Pre-enriched by the parent so ConceptDossier doesn't need the full atlas index
export type EnrichedRelation = {
  id: string;
  otherId: string;
  otherName: string;
  relation_type: string;
  explanation: string;
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  isNew?: boolean;
};

export interface ConceptDossierProps {
  selected: ConceptNode;
  selectedModule: AtlasModule | undefined;
  selectedRelations: EnrichedRelation[];
  run: DemoRun;
  revealedExamples: Set<string>;
  searchLoading: boolean;
  searchResults: SearchResult[];
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onMarkUnderstood: () => void;
  onFocusConcept: (conceptId: string) => void;
  onRevealToggle: (qid: string) => void;
  onSearchMore: (queryText: string, append: boolean) => void;
  onOpenChat: () => void;
  onKeepFocusInDialog: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export function ConceptDossier({
  selected,
  selectedModule,
  selectedRelations,
  run,
  revealedExamples,
  searchLoading,
  searchResults,
  closeButtonRef,
  onClose,
  onMarkUnderstood,
  onFocusConcept,
  onRevealToggle,
  onSearchMore,
  onOpenChat,
  onKeepFocusInDialog,
}: ConceptDossierProps) {
  // Parse example Q&A pairs
  const examplePairs = (() => {
    const text = selected.example;
    if (!text) return null;
    const segments = text.split(/【解】/);
    const pairs: { q: string; a: string }[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].trim();
      if (!seg) continue;
      if (i === 0) {
        pairs.push({ q: seg, a: "" });
      } else {
        const nextQIdx = seg.search(/\n(?=题目?\d+|问题\d*[：:]|判断|代码|\d+\.)/);
        if (nextQIdx >= 0) {
          if (pairs.length > 0) pairs[pairs.length - 1].a = seg.slice(0, nextQIdx).trim();
          pairs.push({ q: seg.slice(nextQIdx).trim(), a: "" });
        } else {
          if (pairs.length > 0) pairs[pairs.length - 1].a = seg;
        }
      }
    }
    return pairs.length > 0 ? pairs : null;
  })();

  return (
    <div
      className="dossier-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="explorer-dossier"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concept-title"
        aria-describedby="concept-definition"
        onKeyDown={onKeepFocusInDialog}
      >
        <i className="liquid-orb liquid-orb-one" aria-hidden="true" />
        <i className="liquid-orb liquid-orb-two" aria-hidden="true" />
        <button
          className="dossier-close"
          onClick={onClose}
          aria-label="关闭概念详情"
          ref={closeButtonRef}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="dossier-scroll">
          <header className="dossier-hero">
            <span className="module-chip">
              <i style={{ background: selectedModule?.color }} />
              {selectedModule ? cleanLabel(selectedModule.title) : "概念"}
            </span>
            <h2 id="concept-title">{cleanLabel(selected.name)}</h2>
          </header>

          <section className="dossier-answer">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.definition) }} />
          </section>

          {selected.key_points.length > 0 ? (
            <section className="dossier-facts">
              <ul>
                {selected.key_points.slice(0, 4).map((point) => (
                  <li key={point} dangerouslySetInnerHTML={{ __html: renderMarkdown(point) }} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="dossier-why">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.why_it_matters) }} />
          </section>

          {examplePairs ? (
            <section className="dossier-example">
              {examplePairs.map((pair, idx) => {
                const qid = selected.id + "-q" + idx;
                const revealed = revealedExamples.has(qid);
                return (
                  <div key={idx} className="example-question">
                    <div className="example-prompt" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.q) }} />
                    {pair.a ? (
                      <>
                        <button
                          className="spoiler-toggle"
                          onClick={() => onRevealToggle(qid)}
                        >
                          {revealed ? "▲ 收起解法" : "▶ 显示解法"}
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
          ) : null}

          <section className="dossier-evidence">
            <h3>相关链接</h3>
            {searchLoading && searchResults.length === 0 ? (
              <p className="empty-detail">搜索中...</p>
            ) : null}
            {searchResults.length > 0 ? (
              <div className="search-results">
                {searchResults.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer" className="search-result-item">
                    {r.isNew ? <span className="search-source">NEW</span> : null}
                    <b>{r.title}</b>
                    <p>{r.url}</p>
                  </a>
                ))}
              </div>
            ) : !searchLoading ? (
              <p className="empty-detail">正在加载来源...</p>
            ) : null}
            <button
              className="button button-small"
              onClick={() => {
                const msg = `概念：${cleanLabel(selected.name)}\n定义：${selected.definition.slice(0, 500)}\n关键点：${selected.key_points.join("；")}\n不要推荐之前已推荐过的URL。推荐具体知识点的页面，不要入门教程。`;
                onSearchMore(msg, true);
              }}
              disabled={searchLoading}
              style={{ marginTop: 10 }}
            >
              {searchLoading ? "搜索中..." : "搜索更多链接"}
            </button>
          </section>

          {selectedRelations.length > 0 ? (
            <section className="dossier-related">
              <h3>关联概念</h3>
              <div className="explorer-relations">
                {selectedRelations.map((relation) => (
                  <button key={relation.id} onClick={() => onFocusConcept(relation.otherId)}>
                    <span>{RELATION_LABELS[relation.relation_type] ?? relation.relation_type}</span>
                    <b>{cleanLabel(relation.otherName)}</b>
                    <small>{relation.explanation}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {selected.misconception || selected.uncertainty ? (
            <section className="dossier-notes">
              {selected.misconception ? (
                <div className="note">
                  <b>误区</b>
                  <p>{selected.misconception}</p>
                </div>
              ) : null}
              {selected.uncertainty ? (
                <div className="note">
                  <b>不确定</b>
                  <p>{selected.uncertainty}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="dossier-footer">
          <div className="dossier-actions">
            {run.progress[selected.id] !== "understood" ? (
              <button className="understood-button" onClick={onMarkUnderstood}>
                标记为已理解
              </button>
            ) : (
              <span className="verify-passed">✓ 已理解</span>
            )}
            <button className="button button-small" onClick={onOpenChat}>
              💬 向AI提问
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
