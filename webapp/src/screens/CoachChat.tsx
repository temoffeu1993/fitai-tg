import { useEffect, useMemo, useRef, useState } from "react";
import { getCoachChatHistory, sendCoachChat } from "@/api/plan";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

export default function CoachChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const suggested = useMemo(
    () => [
      "Проанализируй мою последнюю тренировку и скажи, что улучшить",
      "Почему у меня не растёт вес в жиме? Посмотри по истории",
      "Последние тренировки я устаю сильнее обычного — почему так может быть?",
      "Как сделать тренировки эффективнее, если у меня только 45–60 минут?",
    ],
    []
  );

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    let canceled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getCoachChatHistory(60);
        const raw = Array.isArray(res?.messages) ? res.messages : [];
        const normalized: Msg[] = raw
          .filter((m: any) => m?.role === "user" || m?.role === "assistant")
          .map((m: any) => ({
            id: String(m.id || crypto.randomUUID()),
            role: m.role,
            content: String(m.content || ""),
            createdAt: String(m.createdAt || nowIso()),
          }));
        if (!canceled) setMessages(normalized);
      } catch (e: any) {
        if (!canceled) setError("Не удалось загрузить чат. Проверь интернет и попробуй ещё раз.");
      } finally {
        if (!canceled) setLoading(false);
        setTimeout(scrollToBottom, 50);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  const send = async (value?: string) => {
    const msg = String(value ?? text ?? "").trim();
    if (!msg) return;
    if (sending) return;
    setSending(true);
    setError(null);
    setText("");

    const tempUser: Msg = {
      id: (crypto as any)?.randomUUID?.() || String(Date.now()),
      role: "user",
      content: msg,
      createdAt: nowIso(),
    };
    setMessages((prev) => [...prev, tempUser]);
    setTimeout(scrollToBottom, 50);

    try {
      const res = await sendCoachChat(msg);
      const a = res?.assistantMessage;
      const assistant: Msg = {
        id: String(a?.id || ((crypto as any)?.randomUUID?.() || String(Date.now() + 1))),
        role: "assistant",
        content: String(a?.content || ""),
        createdAt: String(a?.createdAt || nowIso()),
      };
      setMessages((prev) => [...prev, assistant]);
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setError("Не удалось отправить сообщение. Попробуй ещё раз.");
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
      setText(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>Тренер</div>
        <div style={s.subtitle}>Задай вопрос — я посмотрю твои тренировки и самочувствие и дам рекомендации.</div>
      </div>

      {error ? <div style={s.error}>{error}</div> : null}

      {loading ? (
        <div style={s.loading}>Загружаю чат…</div>
      ) : messages.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyTitle}>Спроси что важно именно тебе</div>
          <div style={s.chips}>
            {suggested.map((q) => (
              <button key={q} type="button" style={s.chip} onClick={() => void send(q)} disabled={sending}>
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={listRef} style={s.list}>
        {messages.map((m) => (
          <div key={m.id} style={{ ...s.bubbleRow, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ ...s.bubble, ...(m.role === "user" ? s.userBubble : s.assistantBubble) }}>
              <div style={s.bubbleText}>{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={s.composerWrap}>
        <div style={s.composer}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Напиши вопрос…"
            rows={1}
            style={s.input}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button style={s.sendBtn} type="button" onClick={() => void send()} disabled={sending || !text.trim()}>
            {sending ? "…" : "Отправить"}
          </button>
        </div>
        <div style={s.hint}>Enter — отправить, Shift+Enter — новая строка</div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 680,
    margin: "0 auto",
    padding: "18px 16px 96px",
    display: "grid",
    gap: 12,
  },
  header: {
    display: "grid",
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: -0.2,
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 13.5,
    color: "rgba(15,23,42,0.74)",
    lineHeight: 1.35,
  },
  error: {
    background: "rgba(239,68,68,.12)",
    border: "1px solid rgba(239,68,68,.25)",
    color: "#7f1d1d",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 650,
  },
  loading: {
    padding: "10px 12px",
    fontSize: 14,
    color: "rgba(15,23,42,0.7)",
  },
  empty: {
    background: "rgba(255,255,255,0.5)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    display: "grid",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 850,
    color: "#0f172a",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.75)",
    color: "#0f172a",
    padding: "8px 10px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 750,
    cursor: "pointer",
    textAlign: "left",
  },
  list: {
    minHeight: 180,
    maxHeight: "calc(100vh - 260px)",
    overflow: "auto",
    padding: "6px 2px 6px",
    display: "grid",
    gap: 10,
  },
  bubbleRow: {
    display: "flex",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 16,
    padding: "10px 12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    whiteSpace: "pre-wrap",
  },
  userBubble: {
    background: "rgba(15,23,42,0.92)",
    color: "rgba(255,255,255,0.96)",
    borderTopRightRadius: 8,
  },
  assistantBubble: {
    background: "rgba(255,255,255,0.75)",
    color: "#0f172a",
    border: "1px solid rgba(0,0,0,0.06)",
    borderTopLeftRadius: 8,
  },
  bubbleText: {
    fontSize: 13.5,
    lineHeight: 1.4,
    fontWeight: 600,
  },
  composerWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 72,
    padding: "0 16px 12px",
    pointerEvents: "none",
    zIndex: 10,
  },
  composer: {
    pointerEvents: "auto",
    maxWidth: 680,
    margin: "0 auto",
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: 10,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    boxShadow: "0 12px 30px rgba(0,0,0,.14)",
    backdropFilter: "blur(14px) saturate(160%)",
    WebkitBackdropFilter: "blur(14px) saturate(160%)",
  },
  input: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    fontSize: 14,
    lineHeight: 1.35,
    fontWeight: 650,
    color: "#0f172a",
  },
  sendBtn: {
    border: "none",
    borderRadius: 14,
    padding: "10px 12px",
    background: "rgba(99,102,241,0.95)",
    color: "white",
    fontSize: 13.5,
    fontWeight: 850,
    cursor: "pointer",
  },
  hint: {
    pointerEvents: "none",
    maxWidth: 680,
    margin: "8px auto 0",
    fontSize: 12,
    color: "rgba(15,23,42,0.6)",
    paddingLeft: 6,
  },
};

