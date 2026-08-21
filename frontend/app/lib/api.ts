import type {
  AssessmentFeedback,
  DemoRun,
  FrameworkPlan,
  LearningBrief,
} from "./types";
import type { SourceSearchResult } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
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
  tutor: (runId: string, message: string) =>
    request<{ reply: string }>(`/runs/${runId}/tutor`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  verifyConcept: (runId: string, conceptId: string, explanation: string) =>
    request<{ passed: boolean; feedback: string }>(`/runs/${runId}/concepts/${conceptId}/verify`, {
      method: "POST",
      body: JSON.stringify({ explanation }),
    }),
  recommendSources: (runId: string, message: string) =>
    request<SourceSearchResult[]>(`/runs/${runId}/recommend-sources`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};
