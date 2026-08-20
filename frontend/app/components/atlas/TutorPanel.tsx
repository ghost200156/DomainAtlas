import { type FormEvent } from "react";

interface TutorPanelProps {
  messages: { role: "user" | "tutor"; text: string }[];
  input: string;
  loading: boolean;
  modelName: string | undefined;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function TutorPanel({
  messages,
  input,
  loading,
  modelName,
  onInputChange,
  onSubmit,
  onClose,
}: TutorPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <aside className="tutor-panel">
      <header className="tutor-header">
        <h3>{modelName || "AI"}</h3>
        <button onClick={onClose} aria-label="关闭">×</button>
      </header>
      <div className="tutor-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`tutor-msg tutor-msg-${msg.role}`}>
            <b>{msg.role === "user" ? "你" : (modelName || "AI")}</b>
            <p style={{whiteSpace:"pre-wrap"}}>{msg.text}</p>
          </div>
        ))}
        {loading ? <div className="tutor-msg tutor-msg-tutor"><b>{modelName || "AI"}</b><p>...</p></div> : null}
      </div>
      <form className="tutor-input" onSubmit={handleSubmit}>
        <input value={input} onChange={e => onInputChange(e.target.value)} placeholder="输入问题..." disabled={loading} />
        <button type="submit" disabled={loading || !input.trim()}>发送</button>
      </form>
    </aside>
  );
}
