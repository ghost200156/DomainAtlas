import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { demoApi } from "../lib/api";
import { useRunPolling } from "../lib/useRunPolling";
import { RunModeBadge } from "../RunModeBadge";

export default function PlanRoute() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { run, error } = useRunPolling(runId);
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    if (!runId || !run?.plan) return;
    setConfirming(true);
    await demoApi.confirmPlan(runId, run.plan);
    navigate(`/runs/${runId}/progress`);
  }

  if (error) return <main className="state-page"><p className="form-error">{error}</p></main>;
  if (!run?.plan) {
    return (
      <main className="state-page">
        <div className="survey-loader"><span /><span /><span /></div>
        <p className="eyebrow">PLANNING AGENT · ACTIVE</p>
        <h1>正在校准边界与学习路线</h1>
        <p>{run?.events.at(-1)?.message ?? "任务正在进入测绘队列。"}</p>
      </main>
    );
  }

  return (
    <main className="work-page page-width">
      <div className="page-intro plan-heading">
        <div><p className="eyebrow">ROUTE PROPOSAL · 02 / 04</p><h1>先确认路线，再开始远征</h1></div>
        <div className="plan-stat"><strong>{run.plan.estimated_concepts}</strong><span>预计概念</span></div>
        <div className="plan-stat"><strong>{run.plan.estimated_minutes}</strong><span>预计分钟</span></div>
      </div>
      <section className="plan-summary panel">
        <div><span className="field-label">本次目标</span><p>{run.plan.goal_summary}</p></div>
        <div><span className="field-label">测绘边界</span><p>{run.plan.scope}</p></div>
      </section>
      <section className="module-route" aria-label="学习模块路线">
        {run.plan.modules.map((module, index) => (
          <article className="module-card" key={module.id}>
            <div className="module-card-head"><span>0{index + 1}</span><em>{module.priority}</em></div>
            <h2>{module.title}</h2>
            <p>{module.purpose}</p>
            <ul>{module.core_questions.map((question) => <li key={question}>{question}</li>)}</ul>
          </article>
        ))}
      </section>
      <div className="plan-confirm-bar">
        <div className="plan-status">
          <span><span className="status-dot" />Planning Agent 已完成结构检查</span>
          <RunModeBadge run={run} />
        </div>
        <button className="button button-primary" onClick={confirm} disabled={confirming}>
          {confirming ? "正在出发…" : "确认路线并开始生成 →"}
        </button>
      </div>
    </main>
  );
}
