import { parseExamples } from "../../lib/atlas/examples";
import { renderMarkdown } from "../../lib/atlas/markdown";

type ExampleBlockProps = {
  conceptId: string;
  text: string;
  revealedExamples: ReadonlySet<string>;
  onToggle: (exampleId: string) => void;
};

export function ExampleBlock({ conceptId, onToggle, revealedExamples, text }: ExampleBlockProps) {
  const pairs = parseExamples(text);
  return (
    <section className="dossier-example">
      {pairs.map((pair, idx) => {
        const qid = conceptId + '-q' + idx;
        const revealed = revealedExamples.has(qid);
        return (
          <div key={qid} className="example-question">
            <div className="example-prompt" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.q) }} />
            {pair.a ? (
              <>
              <button className="spoiler-toggle" onClick={() => onToggle(qid)}>
                {revealed ? '▲ 收起解法' : '▶ 显示解法'}
              </button>
              {revealed ? (
                <div className="example-solution" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.a) }} />
              ) : null}
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
