import { Link } from "react-router";

import type { ConceptNode, DemoRun } from "../../lib/types";
import { RunModeBadge } from "../../RunModeBadge";

type ExplorerTopbarProps = {
  run: DemoRun;
  title: string;
  unlockedCount: number;
  matchingConcepts: ConceptNode[];
  query: string;
  selected: boolean;
  progressPercent: number;
  understood: number;
  onQueryChange: (value: string) => void;
  onSearchSubmit: (conceptId: string) => void;
};

export function ExplorerTopbar({
  matchingConcepts,
  onQueryChange,
  onSearchSubmit,
  progressPercent,
  query,
  run,
  selected,
  title,
  understood,
  unlockedCount,
}: ExplorerTopbarProps) {
  return (
    <header className="explorer-topbar" aria-hidden={selected ? true : undefined}>
      <div className="explorer-title">
        <div className="explorer-title-row">
          <Link className="explorer-home" to="/" aria-label="返回首页">← 首页</Link>
          <p>DOMAIN ATLAS · 迷雾探索</p>
        </div>
        <h1>{title}</h1>
        <span>已发现 {unlockedCount} / {run.atlas?.concepts.length ?? 0} 个节点</span>
      </div>
      <label className="concept-search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="搜索概念"
          autoComplete="off"
          name="concept-search"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matchingConcepts[0]) onSearchSubmit(matchingConcepts[0].id);
          }}
          placeholder="搜索概念，按 Enter 定位…"
          value={query}
        />
        {query ? <b aria-live="polite">{matchingConcepts.length}</b> : null}
      </label>
      <div className="explorer-status">
        <RunModeBadge run={run} />
        <div className="compact-progress" aria-label={`学习进度 ${progressPercent}%`}>
          <span><b>{understood}</b> / {run.atlas?.concepts.length ?? 0}</span>
          <i><em style={{ width: `${progressPercent}%` }} /></i>
        </div>
      </div>
    </header>
  );
}
