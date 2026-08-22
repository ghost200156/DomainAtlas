import type {
  AssessmentFeedback,
  DemoRun,
  FrameworkPlan,
  LearningBrief,
  QuizQuestion,
  TeachStepResult,
} from "./types";

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
  teachNext: (runId: string, answer?: string) =>
    request<TeachStepResult>(`/runs/${runId}/teach/next`, {
      method: "POST",
      body: JSON.stringify({ answer: answer ?? null }),
    }),
  growNode: (runId: string) =>
    request<DemoRun>(`/runs/${runId}/grow`, { method: "POST" }),
  recordQuizAnswer: (
    runId: string,
    body: { concept_id: string; question_index: number; selected_index: number; correct: boolean },
  ) =>
    request<DemoRun>(`/runs/${runId}/quiz/answer`, { method: "POST", body: JSON.stringify(body) }),
  explain: (runId: string, conceptId: string, question: string) =>
    request<{ reply: string }>(`/runs/${runId}/explain`, {
      method: "POST",
      body: JSON.stringify({ concept_id: conceptId, question }),
    }),
  explainFree: (runId: string, question: string) =>
    request<{ reply: string }>(`/runs/${runId}/explain-free`, {
      method: "POST",
      body: JSON.stringify({ message: question }),
    }),
  saveNode: (runId: string, question: string, answer: string) =>
    request<DemoRun>(`/runs/${runId}/save-node`, {
      method: "POST",
      body: JSON.stringify({ question, answer }),
    }),
  chat: (runId: string, question: string, history: { role: string; text: string }[]) =>
    request<{ reply: string; node_name: string | null; node_definition: string }>(`/runs/${runId}/chat`, {
      method: "POST",
      body: JSON.stringify({ question, history }),
    }),
  saveChatNode: (runId: string, name: string, definition: string) =>
    request<DemoRun>(`/runs/${runId}/save-chat-node`, {
      method: "POST",
      body: JSON.stringify({ name, definition }),
    }),
  suggestQuestions: (domain: string) =>
    request<{ goals: { label: string; desc: string }[]; backgrounds: { label: string; desc: string }[] }>(`/suggest-questions`, {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  reviewQuestions: (runId: string, conceptId: string) =>
    request<{ concept_name: string; knowledge: string; questions: QuizQuestion[] }>(`/runs/${runId}/review-questions`, {
      method: "POST",
      body: JSON.stringify({ concept_id: conceptId }),
    }),
  expandQuestion: (runId: string, conceptId: string) =>
    request<{ options: string[] }>(`/runs/${runId}/expand-question`, {
      method: "POST",
      body: JSON.stringify({ concept_id: conceptId }),
    }),
  expandNode: (runId: string, conceptId: string, question: string) =>
    request<{ reply: string; quiz: QuizQuestion[]; node_name: string; node_id: string; run: DemoRun }>(`/runs/${runId}/expand`, {
      method: "POST",
      body: JSON.stringify({ concept_id: conceptId, question }),
    }),
  saveReview: (runId: string, conceptId: string, conceptName: string, questions: QuizQuestion[]) =>
    request<DemoRun>(`/runs/${runId}/save-review`, {
      method: "POST",
      body: JSON.stringify({ concept_id: conceptId, concept_name: conceptName, questions }),
    }),
  verifyConcept: (runId: string, conceptId: string, explanation: string) =>
    request<{ passed: boolean; feedback: string }>(`/runs/${runId}/concepts/${conceptId}/verify`, {
      method: "POST",
      body: JSON.stringify({ explanation }),
    }),
};
