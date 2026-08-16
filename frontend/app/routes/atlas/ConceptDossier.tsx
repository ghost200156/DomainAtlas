import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

import type { AtlasDocument, ConceptNode } from "../../lib/types";

import { cleanLabel } from "../../lib/atlas/labels";
import { renderMarkdown } from "../../lib/atlas/markdown";
import type { AtlasIndex, SourceSearchResult } from "../../lib/atlas/types";
import { ExampleBlock } from "./ExampleBlock";

const RELATION_LABELS: Record<string, string> = {
  enables: "促成",
  constrains: "约束",
  informs: "支撑",
  evaluates: "检验",
  depends_on: "依赖",
};

type ConceptDossierProps = {
  selected: ConceptNode;
  selectedModule?: AtlasDocument["modules"][number];
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export function ConceptDossier({
  children,
  closeButtonRef,
  footer,
  onClose,
  selected,
  selectedModule,
}: ConceptDossierProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [selected.id]);

  function keepFocusInDialog(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
    ));
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
    <div className="dossier-layer" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
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
        <button className="dossier-close" onClick={onClose} aria-label="关闭概念详情" ref={closeButtonRef}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="dossier-scroll">
          <header className="dossier-hero">
            <span className="module-chip"><i style={{ background: selectedModule?.color }} />{selectedModule ? cleanLabel(selectedModule.title) : "概念"}</span>
            <h2 id="concept-title">{cleanLabel(selected.name)}</h2>
          </header>
          {children}
        </div>
        <footer className="dossier-footer">{footer}</footer>
      </aside>
    </div>
  );
}

export function DossierAnswer({ text }: { text: string }) {
  return (
    <section className="dossier-answer">
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    </section>
  );
}

export function DossierFacts({ points }: { points: string[] }) {
  if (points.length === 0) return null;
  return (
    <section className="dossier-facts">
      <ul>{points.slice(0, 4).map((point) => <li key={point} dangerouslySetInnerHTML={{ __html: renderMarkdown(point) }} />)}</ul>
    </section>
  );
}

export function DossierWhy({ text }: { text: string }) {
  return (
    <section className="dossier-why">
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    </section>
  );
}

type DossierSectionsProps = {
  selected: ConceptNode;
  atlasIndex: AtlasIndex;
  unlockedConceptIds: ReadonlySet<string>;
  revealedExamples: ReadonlySet<string>;
  onToggleExample: (exampleId: string) => void;
  searchResults: SourceSearchResult[];
  searchLoading: boolean;
  onSearchMore: () => void;
  onFocusConcept: (conceptId: string) => void;
};

export function DossierSections({
  atlasIndex,
  onFocusConcept,
  onSearchMore,
  onToggleExample,
  revealedExamples,
  searchLoading,
  searchResults,
  selected,
  unlockedConceptIds,
}: DossierSectionsProps) {
  return (
    <>
      <DossierAnswer text={selected.definition} />
      <DossierFacts points={selected.key_points} />
      <DossierWhy text={selected.why_it_matters} />
      {selected.example ? (
        <ExampleBlock
          conceptId={selected.id}
          onToggle={onToggleExample}
          revealedExamples={revealedExamples}
          text={selected.example}
        />
      ) : null}
      <DossierSources loading={searchLoading} onSearchMore={onSearchMore} results={searchResults} />
      <DossierRelations
        atlasIndex={atlasIndex}
        onFocusConcept={onFocusConcept}
        selected={selected}
        unlockedConceptIds={unlockedConceptIds}
      />
      <DossierNotes selected={selected} />
    </>
  );
}

function getSearchResultKey(result: SourceSearchResult): string {
  return result.id ?? result.url ?? `${result.source}:${result.title}:${result.snippet}`;
}

type DossierSourcesProps = {
  results: SourceSearchResult[];
  loading: boolean;
  onSearchMore: () => void;
};

export function DossierSources({ results, loading, onSearchMore }: DossierSourcesProps) {
  return (
    <section className="dossier-evidence">
      <h3>相关链接</h3>
      {loading && results.length === 0 ? (
        <p className="empty-detail">搜索中...</p>
      ) : null}
      {results.length > 0 ? (
        <div className="search-results">
          {results.map((result) => (
            <a key={getSearchResultKey(result)} href={result.url} target="_blank" rel="noreferrer" className="search-result-item">
              {result.isNew ? <span className="search-source">NEW</span> : null}
              <b>{result.title}</b>
              <p>{result.url}</p>
            </a>
          ))}
        </div>
      ) : !loading ? (
        <p className="empty-detail">正在加载来源...</p>
      ) : null}
      <button className="button button-small" onClick={onSearchMore} disabled={loading} style={{marginTop:10}}>
        {loading ? "搜索中..." : "搜索更多链接"}
      </button>
    </section>
  );
}

type DossierRelationsProps = {
  selected: ConceptNode;
  atlasIndex: AtlasIndex;
  unlockedConceptIds: ReadonlySet<string>;
  onFocusConcept: (conceptId: string) => void;
};

export function DossierRelations({
  atlasIndex,
  onFocusConcept,
  selected,
  unlockedConceptIds,
}: DossierRelationsProps) {
  const selectedRelations = (atlasIndex.relationsByConcept.get(selected.id) ?? []).filter((relation) => {
    const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
    return unlockedConceptIds.has(otherId);
  });
  if (selectedRelations.length === 0) return null;
  return (
    <section className="dossier-related">
      <h3>关联概念</h3>
      <div className="explorer-relations">
        {selectedRelations.map((relation) => {
          const otherId = relation.source_id === selected.id ? relation.target_id : relation.source_id;
          const other = atlasIndex.conceptsById.get(otherId);
          return (
            <button key={relation.id} onClick={() => other && onFocusConcept(other.id)}>
              <span>{RELATION_LABELS[relation.relation_type] ?? relation.relation_type}</span>
              <b>{other ? cleanLabel(other.name) : otherId}</b>
              <small>{relation.explanation}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function DossierNotes({ selected }: { selected: ConceptNode }) {
  if (!selected.misconception && !selected.uncertainty) return null;
  return (
    <section className="dossier-notes">
      {selected.misconception ? <div className="note"><b>误区</b><p>{selected.misconception}</p></div> : null}
      {selected.uncertainty ? <div className="note"><b>不确定</b><p>{selected.uncertainty}</p></div> : null}
    </section>
  );
}

type ConceptDossierFooterProps = {
  understood: boolean;
  onMarkUnderstood: () => void;
  onOpenChat: () => void;
};

export function ConceptDossierFooter({
  onMarkUnderstood,
  onOpenChat,
  understood,
}: ConceptDossierFooterProps) {
  return (
    <div className="dossier-actions">
      {!understood ? (
        <button className="understood-button" onClick={onMarkUnderstood}>标记为已理解</button>
      ) : (
        <span className="verify-passed">✓ 已理解</span>
      )}
      <button className="button button-small" onClick={onOpenChat}>💬 向AI提问</button>
    </div>
  );
}
