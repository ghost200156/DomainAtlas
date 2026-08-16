import { useCallback, useEffect, useState } from "react";

import { demoApi } from "../api";
import type { ConceptNode } from "../types";

import { cleanLabel } from "./labels";
import type { ChatMessage } from "./types";

let messageSequence = 0;

function createMessage(role: ChatMessage["role"], text: string): ChatMessage {
  messageSequence += 1;
  return { id: `${role}-${Date.now()}-${messageSequence}`, role, text };
}

function loadMessages(storageKey: string): ChatMessage[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message): message is { id?: string; role: ChatMessage["role"]; text: string } =>
        message && (message.role === "user" || message.role === "tutor") && typeof message.text === "string")
      .map((message) => ({
        id: message.id ?? createMessage("tutor", "").id,
        role: message.role,
        text: message.text,
      }));
  } catch {
    return [];
  }
}

export type ConceptChatController = ReturnType<typeof useConceptChat>;

export function useConceptChat(runId: string | undefined, selected: ConceptNode | undefined) {
  const storageKey = `domainatlas-chat-${runId}`;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadMessages(storageKey));
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(chatMessages));
    }
  }, [chatMessages, storageKey]);

  const openChat = useCallback(() => {
    setChatOpen(true);
    if (selected && chatMessages.length === 0) {
      setChatMessages([createMessage("tutor", `可以追问关于「${cleanLabel(selected.name)}」的任何细节。`)]);
    }
  }, [chatMessages.length, selected]);

  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading || !runId) return;
    // Include current concept context if one is selected
    let msg = text;
    if (selected) {
      msg = `[背景：用户在学习「${cleanLabel(selected.name)}」，定义：${selected.definition.slice(0, 400)}，关键点：${selected.key_points.join('；')}]

用户问题：${text}`;
    }
    setChatMessages((prev) => [...prev, createMessage("user", text)]);
    setChatInput("");
    setChatLoading(true);
    try {
      const data = await demoApi.tutor(runId, msg);
      setChatMessages((prev) => [...prev, createMessage("tutor", data.reply)]);
    } catch {
      setChatMessages((prev) => [...prev, createMessage("tutor", "导师暂不可用，请重试。")]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, runId, selected]);

  return {
    chatOpen,
    setChatOpen,
    chatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    openChat,
    sendChatMessage,
  };
}
