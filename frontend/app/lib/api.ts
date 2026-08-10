import type {
  AssessmentFeedback,
  DemoRun,
  FrameworkPlan,
  LearningBrief,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api";
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "请求没有成功，请稍后重试。");
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("后端请求超时，请确认服务已启动后重试。", { cause: error });
    }
    if (error instanceof TypeError) {
      throw new Error("无法连接后端服务，请确认 127.0.0.1:8000 可访问。", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const demoApi = {
  createRun: (brief: LearningBrief) =>
    request<DemoRun>("/runs", { method: "POST", body: JSON.stringify(brief) }),
  getRun: (runId: string) => request<DemoRun>(`/runs/${runId}`),
  confirmPlan: (runId: string, plan?: FrameworkPlan) =>
    request<DemoRun>(`/runs/${runId}/plan/confirm`, {
      method: "POST",
      body: JSON.stringify({ plan: plan ?? null }),
    }),
  retryRun: (runId: string) =>
    request<DemoRun>(`/runs/${runId}/retry`, { method: "POST" }),
  updateProgress: (
    runId: string,
    conceptId: string,
    state: "unvisited" | "unclear" | "understood",
  ) =>
    request<DemoRun>(`/runs/${runId}/progress/${conceptId}`, {
      method: "PATCH",
      body: JSON.stringify({ state }),
    }),
  attemptAssessment: (runId: string, assessmentId: string, answer: string) =>
    request<AssessmentFeedback>(`/runs/${runId}/assessments/${assessmentId}`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    }),
};
