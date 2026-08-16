import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

import { demoApi } from "../api";
import type { ConceptNode, DemoRun } from "../types";

import type { SearchableDemoRun, SourceSearchResult } from "./types";

function withStableId(result: SourceSearchResult): SourceSearchResult {
  return {
    ...result,
    id: result.id ?? `${result.source}:${result.title}:${result.url}`,
  };
}

export type SourceSearchController = ReturnType<typeof useSourceSearch>;

export function useSourceSearch(
  runId: string | undefined,
  selected: ConceptNode | undefined,
  run: DemoRun | undefined,
  setRun?: Dispatch<SetStateAction<DemoRun | undefined>>,
) {
  const [cachedResults, setCachedResults] = useState<SourceSearchResult[]>([]);
  const [extraResults, setExtraResults] = useState<SourceSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchResults = [...cachedResults, ...extraResults];

  const searchForSources = useCallback(async (queryText?: string, append = false) => {
    if (searchLoading || !runId) return;
    setSearchLoading(true);
    if (!append) { setCachedResults([]); setExtraResults([]); }
    try {
      // Use concept-specific content as context for AI
      const msg = queryText || (selected ? `概念：${selected.name}\n定义：${selected.definition.slice(0, 500)}\n关键点：${selected.key_points.join('\n')}` : "");
      if (!msg) { setSearchLoading(false); return; }
      const data = await demoApi.recommendSources(runId, msg);
      if (Array.isArray(data)) {
        if (append) {
          setExtraResults(prev => [...prev, ...data.map((result) => ({ ...withStableId(result), source: 'NEW', isNew: true }))]);
        } else {
          const results = data.map(withStableId);
          setCachedResults(results);
          // Persist to local cache so the concept won't need re-searching
          if (selected && setRun) {
            setRun((prev) => prev ? {
              ...prev,
              pre_search_results: {
                ...((prev as SearchableDemoRun).pre_search_results ?? {}),
                [selected.id]: results,
              },
            } : prev);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  }, [runId, searchLoading, selected, setRun]);

  // Polling replaces `run` frequently; only a concept selection should auto-search.
  useEffect(() => {
    setExtraResults([]);
    if (selected?.id && run) {
      const cached = (run as SearchableDemoRun).pre_search_results?.[selected.id];
      if (Array.isArray(cached) && cached.length > 0) {
        setCachedResults(cached.map(withStableId));
        setSearchLoading(false);
      } else {
        setCachedResults([]);
        void searchForSources();
      }
    } else {
      setCachedResults([]);
      setSearchLoading(false);
    }
  }, [selected?.id]);

  return { searchResults, searchLoading, searchForSources };
}
