import { useState } from "react";
import { useNavigate } from "react-router";

import { demoApi } from "../lib/api";
import type { LearningBrief } from "../lib/types";

const INITIAL_BRIEF: LearningBrief = {
  domain: "Agent 系统设计",
  primary_intent: "task_driven",
  learner_background: "了解大模型基础，希望快速做出一个可以讲清楚的比赛 Demo。",
  desired_outcome: "理解最小 Agent 系统的结构，并能解释规划、研究、生成与评估的闭环。",
  learning_time_minutes: 50,
  focus_items: [],
  exclusions: [],
};

export default function CreateRun() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState(INITIAL_BRIEF);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof LearningBrief>(key: K, value: LearningBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const run = await demoApi.createRun(brief);
      navigate(`/runs/${run.id}/plan`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务创建失败");
      setSubmitting(false);
    }
  }

  return (
    <main className="work-page page-width">
      <div className="page-intro compact">
        <p className="eyebrow">NEW EXPEDITION · 01 / 04</p>
        <h1>先标出你要抵达的地方</h1>
        <p>不需要写复杂 Prompt。只要告诉 Planning Agent 你从哪里出发、最后想带走什么。</p>
      </div>
      <div className="workspace-grid">
        <form className="brief-form panel" onSubmit={submit}>
          <label>
            <span>想探索的领域</span>
            <input value={brief.domain} onChange={(event) => update("domain", event.target.value)} required minLength={2} />
          </label>
          <label>
            <span>这次探索的目的</span>
            <select value={brief.primary_intent} onChange={(event) => update("primary_intent", event.target.value as LearningBrief["primary_intent"])}>
              <option value="task_driven">完成一个具体任务</option>
              <option value="interest_exploration">建立兴趣认知</option>
              <option value="cross_domain_connection">连接已有领域</option>
              <option value="decision_preparation">为决策做准备</option>
            </select>
          </label>
          <label>
            <span>你现在的背景</span>
            <textarea rows={3} value={brief.learner_background} onChange={(event) => update("learner_background", event.target.value)} required />
          </label>
          <label>
            <span>希望最后能做到什么</span>
            <textarea rows={3} value={brief.desired_outcome} onChange={(event) => update("desired_outcome", event.target.value)} required />
          </label>
          <label>
            <span>可投入时间 <b>{brief.learning_time_minutes} 分钟</b></span>
            <input type="range" min="30" max="120" step="10" value={brief.learning_time_minutes} onChange={(event) => update("learning_time_minutes", Number(event.target.value))} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary wide" disabled={submitting}>
            {submitting ? "正在建立任务…" : "让 Agent 规划路线 →"}
          </button>
        </form>
        <aside className="field-notes" style={{width: 380, padding: '24px 28px', flexShrink: 0}}>
          <p className="eyebrow">FIELD NOTES</p>
          <h2>范围越清楚，<br />地图越有用。</h2>
          <ol>
            <li><span>01</span> 用一个能解释清楚的任务代替“大而全”。</li>
            <li><span>02</span> 规划完成后仍可以先检查，再决定是否生成。</li>
            <li><span>03</span> 当前 Demo 使用固定资料，结果可重复演示。</li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
