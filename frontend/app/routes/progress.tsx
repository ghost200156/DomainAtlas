import { Link, useParams } from "react-router";

import { demoApi } from "../lib/api";
import { useRunPolling } from "../lib/useRunPolling";
import { RunModeBadge } from "../RunModeBadge";

const PIPELINE = [
  { step: "researching", agent: "Research Agent", title: "整理证据卡片" },
  { step: "building_structure", agent: "Atlas Agent", title: "建立概念与关系" },
  { step: "validating", agent: "Python Validator", title: "检查结构引用" },
  { step: "reviewing", agent: "Quality Review", title: "复核覆盖和路径" },
  { step: "publishing", agent: "Atlas Agent", title: "发布可交互地图" },
];

const STEP_INDEX = new Map(PIPELINE.map((item, index) => [item.step, index]));

export default function ProgressRoute() {
  const { runId } = useParams();
  const { run, error, setRun } = useRunPolling(runId);
  const currentIndex = run?.status === "READY" ? PIPELINE.length : (STEP_INDEX.get(run?.current_step ?? "") ?? -1);

  async function retry() {
    if (!runId) return;
    setRun(await demoApi.retryRun(runId));
  }

  return (
    <main className="progress-page page-width">
      <section className="progress-copy">
        <p className="eyebrow">LIVE EXPEDITION · 03 / 04</p>
        <h1>{run?.status === "READY" ? "地图绘制完成" : "Agent 正在野外作业"}</h1>
        <p>{run?.events.at(-1)?.message ?? error ?? "正在读取任务进度…"}</p>
        {run && <RunModeBadge run={run} />}
        <br/>
        {run?.status === "READY" && runId && <Link className="button button-primary" to={`/runs/${runId}/atlas`}>打开领域地图 →</Link>}
      </section>
      <section className="expedition-log">
        <div className="log-header"><span>FIELD LOG</span><span>RUN {runId?.slice(0, 8).toUpperCase()}</span></div>
        {PIPELINE.map((item, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <article className={`log-step ${state}`} key={item.step}>
              <div className="step-marker">{state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</div>
              <div><p>{item.agent}</p><h2>{item.title}</h2></div>
              <span className="step-state">{state === "done" ? "完成" : state === "active" ? "作业中" : "等待"}</span>
            </article>
          );
        })}
      </section>
    </main>
  );
}
