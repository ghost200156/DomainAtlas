import { useEffect, useRef, useState } from "react";

import { demoApi } from "../lib/api";
import { type QuizQuestion } from "../lib/types";

/** Multiple-choice quiz: immediate grading, running score, persistence, and feedback recording. */
export function Quiz({
  questions,
  storageKey,
  runId,
  conceptId,
  onWrongAnswer,
  onComplete,
}: {
  questions: QuizQuestion[];
  storageKey?: string;
  runId?: string;
  conceptId?: string;
  onWrongAnswer?: () => void;
  onComplete?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>(() => {
    if (!storageKey) return {};
    try {
      const saved = localStorage.getItem(`domainatlas-quiz-${storageKey}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(`domainatlas-quiz-${storageKey}`, JSON.stringify(answers));
  }, [answers, storageKey]);

  const completedRef = useRef(false);
  useEffect(() => {
    if (questions.length > 0 && Object.keys(answers).length === questions.length && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [answers, questions.length, onComplete]);

  const correctCount = questions.reduce(
    (n, q, i) => n + (answers[i] === q.correct_index ? 1 : 0),
    0,
  );

  function pick(qi: number, oi: number) {
    const correct = oi === questions[qi].correct_index;
    setAnswers((prev) => ({ ...prev, [qi]: oi }));
    if (runId && conceptId) {
      demoApi
        .recordQuizAnswer(runId, {
          concept_id: conceptId,
          question_index: qi,
          selected_index: oi,
          correct,
        })
        .catch(() => {});
    }
    if (!correct) onWrongAnswer?.();
  }

  return (
    <div className="quiz">
      <div className="quiz-score">
        <span className="quiz-title">小测</span>
        <span className="quiz-count">{correctCount} / {questions.length}</span>
      </div>
      {questions.map((q, qi) => {
        const picked = answers[qi];
        const answered = picked !== undefined;
        return (
          <div key={qi} className="quiz-q">
            <p className="quiz-prompt">{q.question}</p>
            {q.options.map((opt, oi) => {
              let cls = "quiz-opt";
              if (answered) {
                if (oi === q.correct_index) cls += " correct";
                else if (oi === picked) cls += " wrong";
              }
              return (
                <button
                  key={oi}
                  className={cls}
                  disabled={answered}
                  onClick={() => pick(qi, oi)}
                >
                  {opt}
                </button>
              );
            })}
            {answered ? (
              <p className={`quiz-feedback ${picked === q.correct_index ? "ok" : "no"}`}>
                {picked === q.correct_index ? "✓ 正确。" : "✗ 不对。"} {q.explanation}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
