import { useEffect, useRef, useState } from "react";

import { demoApi } from "../lib/api";
import { cleanLabel, renderMarkdown } from "../lib/atlasUtils";
import { type DemoRun, type QuizQuestion } from "../lib/types";
import { Quiz } from "./Quiz";

type ChatMsg = { role: "user" | "tutor"; text: string };

export function TeachingSession({
  runId,
  modelName,
  selectedConceptId,
  selectedConceptName,
  wrongOffer,
  onDismissOffer,
  onRunUpdated,
  collapsed,
  onToggleCollapse,
  expandTarget,
  onExpandTargetConsumed,
}: {
  runId: string;
  modelName?: string;
  selectedConceptId?: string;
  selectedConceptName?: string;
  wrongOffer?: { conceptId: string; conceptName: string } | null;
  onDismissOffer?: () => void;
  onRunUpdated?: (run: DemoRun) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  expandTarget?: { conceptId: string; conceptName: string } | null;
  onExpandTargetConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<{ conceptId: string; conceptName: string; knowledge: string; questions: QuizQuestion[] } | null>(null);
  const [reviewDone, setReviewDone] = useState(false);
  const [pendingChat, setPendingChat] = useState<{ name: string; definition: string } | null>(null);
  const [expandOptions, setExpandOptions] = useState<string[] | null>(null);
  const [expandQuiz, setExpandQuiz] = useState<{ nodeName: string; nodeId: string; questions: QuizQuestion[] } | null>(null);
  const [expandQuizDone, setExpandQuizDone] = useState(false);
  const [expandLoading, setExpandLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // When a new「哪里不理解」question is showing, pin it (and its options) to the
    // top of the view. During「拓展中…」loading we do nothing (the question isn't
    // rendered yet). Only in normal chat do we keep the latest message at the bottom.
    const el = scrollRef.current;
    if (!el) return;
    if (expandOptions && expandOptions.length > 0 && lastMessageRef.current) {
      el.scrollTop = lastMessageRef.current.offsetTop - el.offsetTop - 8;
    } else if (!expandLoading) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading, review, pendingChat, reviewDone, expandOptions, expandLoading, expandQuiz]);

  async function loadExpandOptions() {
    if (!expandTarget) return;
    setExpandLoading(true);
    setExpandOptions(null);
    setExpandQuiz(null);
    setExpandQuizDone(false);
    // Each new「哪里不理解」round starts fresh — the previous Q&A already lives in
    // the generated nodes, so clear the chat so the new question sits at the top.
    setMessages([]);
    const conceptName = cleanLabel(expandTarget.conceptName);
    try {
      const data = await demoApi.expandQuestion(runId, expandTarget.conceptId);
      if (data.options?.length) {
        setExpandOptions(data.options);
        setMessages((prev) => [...prev, { role: "tutor", text: `关于「${conceptName}」，你哪里不理解？选一个，或者直接输入。` }]);
      } else {
        setMessages((prev) => [...prev, { role: "tutor", text: `关于「${conceptName}」，你哪里不理解？直接输入。` }]);
      }
      // Pin the freshly asked question to the top after the DOM has updated.
      setTimeout(() => {
        const el = scrollRef.current;
        if (el && lastMessageRef.current) {
          el.scrollTop = lastMessageRef.current.offsetTop - el.offsetTop - 8;
        }
      }, 0);
    } catch {
      setMessages((prev) => [...prev, { role: "tutor", text: `关于「${conceptName}」，你哪里不理解？直接输入。` }]);
    } finally {
      setExpandLoading(false);
    }
    inputRef.current?.focus();
  }

  // When the user clicks「拓展该节点」, ask the agent for selectable「哪里不理解」options.
  useEffect(() => {
    if (expandTarget) loadExpandOptions();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: fire once per expand target
  }, [expandTarget?.conceptId, expandTarget?.conceptName]);

  async function sendText(text: string) {
    if (!text || loading) return;
    setInput("");
    const isExpand = !!expandTarget;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      if (isExpand && expandTarget?.conceptId) {
        const data = await demoApi.expandNode(runId, expandTarget.conceptId, text);
        setMessages((prev) => [...prev, { role: "tutor", text: data.reply }]);
        setExpandQuiz({ nodeName: data.node_name, nodeId: data.node_id, questions: data.quiz || [] });
        setExpandQuizDone(false);
        onRunUpdated?.(data.run);
      } else if (selectedConceptId) {
        const data = await demoApi.explain(runId, selectedConceptId, text);
        setMessages((prev) => [...prev, { role: "tutor", text: data.reply }]);
      } else {
        const data = await demoApi.chat(runId, text, messages);
        setMessages((prev) => [...prev, { role: "tutor", text: data.reply }]);
        if (data.node_name) {
          setPendingChat({ name: data.node_name, definition: data.node_definition });
        }
      }
      setExpandOptions(null);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: error instanceof Error ? error.message : "讲解失败，请重试。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    await sendText(input.trim());
  }

  async function chooseExpandOption(option: string) {
    setExpandOptions(null);
    await sendText(option);
  }

  async function saveChat() {
    if (!pendingChat) return;
    setLoading(true);
    try {
      const updated = await demoApi.saveChatNode(runId, pendingChat.name, pendingChat.definition);
      onRunUpdated?.(updated);
      setMessages((prev) => [...prev, { role: "tutor", text: `（已整理成节点「${cleanLabel(pendingChat.name)}」）` }]);
      setPendingChat(null);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: error instanceof Error ? error.message : "保存节点失败。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function acceptReview() {
    if (!wrongOffer || loading) return;
    setLoading(true);
    try {
      const data = await demoApi.reviewQuestions(runId, wrongOffer.conceptId);
      setReview({
        conceptId: wrongOffer.conceptId,
        conceptName: wrongOffer.conceptName,
        knowledge: data.knowledge,
        questions: data.questions,
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: error instanceof Error ? error.message : "出题失败。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function saveReview() {
    if (!review) return;
    setLoading(true);
    try {
      const updated = await demoApi.saveReview(runId, review.conceptId, review.conceptName, review.questions);
      onRunUpdated?.(updated);
      setMessages((prev) => [...prev, { role: "tutor", text: `（已把复习总结成节点「复习：${cleanLabel(review.conceptName)}」）` }]);
      setReview(null);
      setReviewDone(false);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: error instanceof Error ? error.message : "保存复习节点失败。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <aside className="teach-session" aria-label="教学会话">
        <header className="teach-header">
          {!collapsed ? (
            <div className="teach-header-title">
              <h3>教学会话</h3>
              <span>{modelName || "AI 导师"}</span>
            </div>
          ) : null}
          {!collapsed && selectedConceptName ? (
            <span className="teach-mastery">关于「{cleanLabel(selectedConceptName)}」</span>
          ) : null}
          <button className="teach-collapse-btn" onClick={onToggleCollapse} aria-label={collapsed ? "展开" : "收起"}>
            {collapsed ? "＋" : "−"}
          </button>
        </header>

        {!collapsed ? (
          <div className="teach-scroll" ref={scrollRef}>
            {loading ? <div className="teach-thinking">{modelName || "AI 导师"} 思考中…</div> : null}
            {expandLoading ? <div className="teach-thinking">{modelName || "AI 导师"} 拓展中…</div> : null}

            {review ? (
              <div className="teach-review">
                <h4>复习「{cleanLabel(review.conceptName)}」</h4>
                <div className="teach-review-knowledge" dangerouslySetInnerHTML={{ __html: renderMarkdown(review.knowledge) }} />
                <Quiz
                  questions={review.questions}
                  runId={runId}
                  conceptId={review.conceptId}
                  onComplete={() => setReviewDone(true)}
                />
              </div>
            ) : null}

            <div className="teach-messages">
              {messages.length === 0 && !review ? (
                <p className="teach-empty">
                  {selectedConceptName
                    ? `你选中了「${cleanLabel(selectedConceptName)}」。问我任何关于它的细节——指哪儿讲哪儿。`
                    : <>可以问我任何问题<br />比如「XX 这里我不懂，能讲讲吗」。</>}
                </p>
              ) : (
                messages.map((msg, index) => {
                  const isLast = index === messages.length - 1;
                  return (
                    <div key={index} ref={isLast ? lastMessageRef : undefined} className={`tutor-msg tutor-msg-${msg.role}`}>
                      <b>{msg.role === "user" ? "你" : "导师"}</b>
                      {msg.role === "tutor" ? (
                        <div className="tutor-msg-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                      ) : (
                        <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
                      )}
                    </div>
                  );
                })
              )}

              {expandOptions && expandOptions.length > 0 ? (
                <div className="teach-expand-options">
                  {expandOptions.map((option, index) => (
                    <button key={index} onClick={() => chooseExpandOption(option)} disabled={loading}>
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {expandQuiz ? (
              <div className="teach-review">
                <h4>考察一下「{cleanLabel(expandQuiz.nodeName)}」</h4>
                <Quiz
                  questions={expandQuiz.questions}
                  storageKey={`${runId}-${expandQuiz.nodeId}`}
                  runId={runId}
                  conceptId={expandQuiz.nodeId}
                  onComplete={() => setExpandQuizDone(true)}
                />
              </div>
            ) : null}

            {expandQuiz && expandQuizDone ? (
              <div className="teach-offer">
                <p>还有没有不理解的地方？</p>
                <div>
                  <button onClick={() => loadExpandOptions()}>有，继续</button>
                  <button onClick={() => { setExpandQuiz(null); setExpandQuizDone(false); onExpandTargetConsumed?.(); }}>没有了</button>
                </div>
              </div>
            ) : null}

            {wrongOffer && !review ? (
              <div className="teach-offer">
                <p>「{cleanLabel(wrongOffer.conceptName)}」这道题你答错了，要不要我再出几道类似的练练？</p>
                <div>
                  <button onClick={acceptReview}>要，出几道</button>
                  <button onClick={onDismissOffer}>不用了</button>
                </div>
              </div>
            ) : null}

            {reviewDone && review ? (
              <div className="teach-offer">
                <p>这次复习做完了，要不要把它整理成一个地图节点？</p>
                <div>
                  <button onClick={saveReview}>要，存成节点</button>
                  <button onClick={() => setReviewDone(false)}>不用了</button>
                </div>
              </div>
            ) : null}

            {pendingChat ? (
              <div className="teach-offer">
                <p>这次讲解要不要整理成地图节点「{cleanLabel(pendingChat.name)}」？</p>
                <div>
                  <button onClick={saveChat}>要，存成节点</button>
                  <button onClick={() => setPendingChat(null)}>不用了</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      {!collapsed ? (
        <div className="teach-input-bar">
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") send(); }}
            placeholder={selectedConceptName ? `问「${cleanLabel(selectedConceptName)}」…` : "问任何问题…"}
            disabled={loading}
          />
          <button onClick={send} disabled={loading || !input.trim()}>发送</button>
        </div>
      ) : null}
    </>
  );
}
