import { type AtlasModule, type ConceptNode, type DemoRun } from "../lib/types";
import { cleanLabel, renderMarkdown } from "../lib/atlasUtils";
import { Quiz } from "./Quiz";

export function NodeLesson({
  concept,
  module,
  run,
  onClose,
  onMarkUnderstood,
  onWrongAnswer,
  onExpand,
  label,
}: {
  concept: ConceptNode;
  module: AtlasModule | undefined;
  run: DemoRun;
  onClose: () => void;
  onMarkUnderstood: () => void;
  onWrongAnswer?: (conceptId: string, conceptName: string) => void;
  onExpand?: (conceptId: string, conceptName: string) => void;
  label?: string;
}) {
  const understood = run.progress[concept.id] === "understood";

  return (
    <div className="node-lesson" role="dialog" aria-label={cleanLabel(concept.name)}>
      <header className="node-lesson-head">
        <span className="module-chip">
          {module ? <i style={{ background: module.color }} /> : null}
          {label ?? (module ? cleanLabel(module.title) : "章节")}
        </span>
        <button className="node-lesson-close" onClick={onClose} aria-label="收起">×</button>
      </header>
      <h2>{cleanLabel(concept.name)}</h2>

      <div className="node-lesson-plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(concept.definition) }} />

      {concept.quiz && concept.quiz.length > 0 ? (
        <div className="node-lesson-section">
          <h4>小测</h4>
          <Quiz
            questions={concept.quiz}
            storageKey={`${run.id}-${concept.id}`}
            runId={run.id}
            conceptId={concept.id}
            onWrongAnswer={() => onWrongAnswer?.(concept.id, concept.name)}
          />
        </div>
      ) : null}

      {concept.hands_on ? (
        <div className="node-lesson-section">
          <h4>动手</h4>
          <div className="node-lesson-plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(concept.hands_on) }} />
        </div>
      ) : null}

      {concept.reading ? (
        <div className="node-lesson-section">
          <h4>读物</h4>
          <div className="node-lesson-plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(concept.reading) }} />
        </div>
      ) : null}

      {concept.key_points.length > 0 ? (
        <div className="node-lesson-section">
          <h4>关键点</h4>
          <ul>
            {concept.key_points.map((point) => (
              <li key={point} dangerouslySetInnerHTML={{ __html: renderMarkdown(point) }} />
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="node-lesson-foot">
        {concept.id !== "__center__" ? (
          <button className="expand-button" onClick={() => onExpand?.(concept.id, concept.name)}>拓展该节点</button>
        ) : null}
        {understood ? (
          <span className="verify-passed">✓ 已理解</span>
        ) : (
          <button className="understood-button" onClick={onMarkUnderstood}>标记为已理解</button>
        )}
      </footer>
    </div>
  );
}
