import type { FormEvent } from "react";

import type { ChatMessage } from "../../lib/atlas/types";

type TutorPanelProps = {
  modelName?: string;
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function TutorPanel({
  input,
  loading,
  messages,
  modelName,
  onClose,
  onInputChange,
  onSubmit,
}: TutorPanelProps) {
  return (
    <aside className="tutor-panel">
      <header className="tutor-header">
        <h3>{modelName || "AI"}</h3>
        <button onClick={onClose} aria-label="关闭">×</button>
      </header>
      <div className="tutor-messages">
        {messages.map((message) => (
          <div key={message.id} className={`tutor-msg tutor-msg-${message.role}`}>
            <b>{message.role === "user" ? "你" : (modelName || "AI")}</b>
            <p style={{whiteSpace:"pre-wrap"}}>{message.text}</p>
          </div>
        ))}
        {loading ? <div className="tutor-msg tutor-msg-tutor"><b>{modelName || "AI"}</b><p>...</p></div> : null}
      </div>
      <form className="tutor-input" onSubmit={onSubmit}>
        <input value={input} onChange={event => onInputChange(event.target.value)} placeholder="输入问题..." disabled={loading} />
        <button type="submit" disabled={loading || !input.trim()}>发送</button>
      </form>
    </aside>
  );
}
