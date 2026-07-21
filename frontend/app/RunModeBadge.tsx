import type { DemoRun } from "./lib/types";

const MODE_LABELS = {
  live: "LIVE AGENTS",
  hybrid: "HYBRID MODE",
  fixture: "DEMO FIXTURE",
};

export function RunModeBadge({ run }: { run: DemoRun }) {
  return (
    <span className={`run-mode mode-${run.execution_mode}`}>
      <i />
      {MODE_LABELS[run.execution_mode]}
      {run.model_name && run.execution_mode !== "fixture" && <small>{run.model_name}</small>}
    </span>
  );
}
