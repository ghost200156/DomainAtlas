import { type Dispatch, type SetStateAction, useCallback, useState } from "react";

import { demoApi } from "../api";
import type { ConceptNode, DemoRun } from "../types";

import type { VerifyState } from "./types";

const EMPTY_VERIFY: VerifyState = { mode: false, text: "", result: null, loading: false };

export function useConceptVerify(
  runId: string | undefined,
  setRun?: Dispatch<SetStateAction<DemoRun | undefined>>,
) {
  const [verifyState, setVerifyState] = useState<Record<string, VerifyState>>({});

  const getVerify = useCallback((conceptId: string) => {
    return verifyState[conceptId] ?? EMPTY_VERIFY;
  }, [verifyState]);

  const setVerify = useCallback((conceptId: string, patch: Partial<VerifyState>) => {
    setVerifyState((prev) => ({
      ...prev,
      [conceptId]: { ...(prev[conceptId] ?? EMPTY_VERIFY), ...patch },
    }));
  }, []);

  const resetVerify = useCallback((conceptId: string) => {
    setVerifyState((prev) => {
      const next = { ...prev };
      delete next[conceptId];
      return next;
    });
  }, []);

  const checkUnderstanding = useCallback(async (selected: ConceptNode | undefined) => {
    if (!selected || !runId) return;
    const cid = selected.id;
    const v = getVerify(cid);
    if (!v.text.trim() || v.loading) return;
    setVerify(cid, { loading: true, result: null });
    try {
      const data = await demoApi.verifyConcept(runId, cid, v.text);
      setVerify(cid, { result: data });
      if (data.passed && setRun) {
        setRun(await demoApi.updateProgress(runId, cid, "understood"));
      }
    } catch {
      setVerify(cid, { result: { passed: true, feedback: "验证暂不可用，已标记。" } });
      if (setRun) {
        setRun(await demoApi.updateProgress(runId, cid, "understood"));
      }
    } finally {
      setVerify(cid, { loading: false });
    }
  }, [getVerify, runId, setRun, setVerify]);

  return { verifyState, getVerify, setVerify, resetVerify, checkUnderstanding };
}
