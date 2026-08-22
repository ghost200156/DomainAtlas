import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { demoApi } from "../lib/api";
import type { LearningBrief } from "../lib/types";

const FALLBACK_GOALS = [
  { label: "能给别人讲明白", desc: "能解释清楚核心概念和机制" },
  { label: "能动手做出来", desc: "能实现一个可运行的小项目" },
  { label: "能解决真实问题", desc: "能把学到的东西用起来" },
];

const FALLBACK_BACKGROUNDS = [
  { label: "完全没接触过", desc: "这个领域对我完全陌生" },
  { label: "知道一点概念", desc: "听过一些名词，但没实操过" },
  { label: "有相关基础", desc: "会编程，或有相邻领域的经验" },
];

const TIME_OPTIONS = [
  { value: 30, label: "每天几分钟", desc: "碎片化学习，每课 5-10 分钟" },
  { value: 180, label: "每周几小时", desc: "每周固定几小时，每课 15-20 分钟" },
  { value: 360, label: "集中一次搞定", desc: "一次性投入半天，深入一点" },
  { value: 120, label: "时间不定", desc: "看情况，课灵活一点" },
];

const TOTAL_STEPS = 4;
const STEPS = [
  { title: "想学习什么知识？" },
  { title: "你想达成的具体目标是？" },
  { title: "你现在的起点是？" },
  { title: "能投入多少时间？" },
];

function Card({ label, desc, selected, onClick }: {
  label: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`option-card ${selected ? "selected" : ""}`} onClick={onClick}>
      <b>{label}</b>
      <small>{desc}</small>
    </button>
  );
}

const INITIAL_BRIEF: LearningBrief = {
  domain: "",
  primary_intent: "task_driven",
  learner_background: "",
  desired_outcome: "",
  learning_time_minutes: 50,
  focus_items: [],
  exclusions: [],
};

export default function CreateRun() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState(INITIAL_BRIEF);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [timeSelected, setTimeSelected] = useState(false);
  const [goals, setGoals] = useState<{ label: string; desc: string }[] | null>(null);
  const [backgrounds, setBackgrounds] = useState<{ label: string; desc: string }[] | null>(null);

  function update<K extends keyof LearningBrief>(key: K, value: LearningBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    setError("");
  }, [step]);

  async function next() {
    if (loading) return;
    if (step === 0 && brief.domain.trim().length < 2) { setError("请先填写想学习的领域"); return; }
    if (step === 1 && !brief.desired_outcome.trim()) { setError("请选择或填写你的目标"); return; }
    if (step === 2 && !brief.learner_background.trim()) { setError("请选择或填写你的起点"); return; }
    setError("");
    setCustomOpen(false);
    setLoading(true);
    try {
      if (step === 0 && goals === null) {
        try {
          const data = await demoApi.suggestQuestions(brief.domain.trim());
          if (data.goals?.length) setGoals(data.goals);
          if (data.backgrounds?.length) setBackgrounds(data.backgrounds);
        } catch { /* keep fallback options on failure */ }
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!timeSelected) { setError("还未选择，请先选择可投入时间"); return; }
    setSubmitting(true);
    setError("");
    try {
      const run = await demoApi.createRun({
        ...brief,
        domain: brief.domain.trim(),
        learner_background: brief.learner_background.trim(),
        desired_outcome: brief.desired_outcome.trim(),
      });
      navigate(`/runs/${run.id}/plan`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务创建失败");
      setSubmitting(false);
    }
  }

  const goalOptions = goals ?? FALLBACK_GOALS;
  const backgroundOptions = backgrounds ?? FALLBACK_BACKGROUNDS;

  return (
    <main className="work-page page-width">
      <div className="page-intro compact">
        <p className="eyebrow">NEW EXPEDITION · {String(step + 1).padStart(2, "0")} / 04</p>
        <h1>{STEPS[step].title}</h1>
      </div>

      <div className="workspace-grid">
        <form className="brief-form panel" style={step === 0 ? { marginTop: 100 } : undefined}>
          {step === 0 ? (
            <div className="domain-row">
              <input
                value={brief.domain}
                onChange={(event) => update("domain", event.target.value)}
                placeholder="比如：Agent 系统设计…"
                autoFocus
              />
              <button type="button" className="button button-primary" onClick={next} disabled={loading}>
                {loading ? "加载中…" : "下一步 →"}
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="option-list">
              {goalOptions.map((opt) => (
                <Card key={opt.label} label={opt.label} desc={opt.desc} selected={!customOpen && brief.desired_outcome === opt.label} onClick={() => { setCustomOpen(false); update("desired_outcome", opt.label); }} />
              ))}
              <Card label="其他" desc="上面的都不太符合，我自己写" selected={customOpen} onClick={() => { setCustomOpen(true); update("desired_outcome", ""); }} />
              {customOpen ? (
                <textarea rows={2} placeholder="描述你想达成的具体目标…" value={brief.desired_outcome} onChange={(event) => update("desired_outcome", event.target.value)} />
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="option-list">
              {backgroundOptions.map((opt) => (
                <Card key={opt.label} label={opt.label} desc={opt.desc} selected={!customOpen && brief.learner_background === opt.label} onClick={() => { setCustomOpen(false); update("learner_background", opt.label); }} />
              ))}
              <Card label="其他" desc="上面的都不太符合，我自己写" selected={customOpen} onClick={() => { setCustomOpen(true); update("learner_background", ""); }} />
              {customOpen ? (
                <textarea rows={2} placeholder="简单说说你现在的水平…" value={brief.learner_background} onChange={(event) => update("learner_background", event.target.value)} />
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="option-list">
              {TIME_OPTIONS.map((opt) => (
                <Card key={opt.value} label={opt.label} desc={opt.desc} selected={timeSelected && brief.learning_time_minutes === opt.value} onClick={() => { setTimeSelected(true); setError(""); update("learning_time_minutes", opt.value); }} />
              ))}
              <Card label="其他" desc="输入具体分钟数" selected={timeSelected && !TIME_OPTIONS.some((o) => o.value === brief.learning_time_minutes)} onClick={() => { setTimeSelected(true); setError(""); update("learning_time_minutes", 60); }} />
              {timeSelected && !TIME_OPTIONS.some((o) => o.value === brief.learning_time_minutes) ? (
                <input type="number" min={30} max={1440} value={brief.learning_time_minutes} onChange={(event) => update("learning_time_minutes", Number(event.target.value))} placeholder="分钟数" />
              ) : null}
            </div>
          ) : null}

          {error && <p className="form-error">{error}</p>}

          {step > 0 ? (
            <div className="wizard-nav">
              <button type="button" className="button" onClick={() => { setError(""); setCustomOpen(false); setStep((s) => s - 1); }}>
                ← 上一步
              </button>
              {step < TOTAL_STEPS - 1 ? (
                <button type="button" className="button button-primary" onClick={next} disabled={loading}>
                  {loading ? "加载中…" : "下一步 →"}
                </button>
              ) : (
                <button type="button" className="button button-primary" onClick={submit} disabled={submitting}>
                  {submitting ? "正在建立任务…" : "下一步 →"}
                </button>
              )}
            </div>
          ) : null}
        </form>

        <aside className="field-notes" style={{ width: 380, padding: "24px 28px", flexShrink: 0 }}>
          <p className="eyebrow">FIELD NOTES</p>
          <h2>范围越清楚，<br />地图越有用。</h2>
          <ol>
            <li><span>01</span> 用一个能解释清楚的任务代替“大而全”。</li>
            <li><span>02</span> 规划完成后仍可以先检查，再决定是否生成。</li>
            <li><span>03</span> 你的回答会直接影响 Agent 生成的地图深度与数量。</li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
