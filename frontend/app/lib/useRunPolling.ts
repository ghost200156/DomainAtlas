import { useCallback, useEffect, useState } from "react";

import { demoApi } from "./api";
import type { DemoRun } from "./types";

const ACTIVE_STATUSES = new Set(["PREPARING_PLAN", "GENERATING"]);

export function useRunPolling(runId: string | undefined) {
  const [run, setRun] = useState<DemoRun>();
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const updateRun = useCallback((nextRun: DemoRun) => {
    setRun(nextRun);
    if (ACTIVE_STATUSES.has(nextRun.status)) {
      setRefreshToken((current) => current + 1);
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const nextRun = await demoApi.getRun(runId as string);
        if (!active) return;
        setRun(nextRun);
        setError("");
        if (ACTIVE_STATUSES.has(nextRun.status)) {
          timer = setTimeout(load, 700);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "无法读取任务");
      }
    }

    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, refreshToken]);

  return { run, error, setRun: updateRun };
}
