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

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow {
        background: linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);
        background-size: 300% 300%;
        animation: glowShift 6s ease-in-out infinite, pulseSoft 3s ease-in-out infinite;
        transition: background 0.3s ease;
      }
      @keyframes glowShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.12) saturate(1.06); transform: scale(1.01) } }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
    `}</style>
  );
}

export default function CoachChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

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
      } catch {
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
    } catch {
      setError("Не удалось отправить сообщение. Попробуй ещё раз.");
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
      setText(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={s.page}>
      <SoftGlowStyles />

      <div style={s.screen}>
        <header style={s.top}>
          <div style={s.title}>Чат с тренером</div>
          {error ? <div style={s.error}>{error}</div> : null}
        </header>

        <section style={s.glassBlock}>
          <div ref={listRef} style={s.messages}>
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
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  style={{ ...s.bubbleRow, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}
                >
                  <div style={{ ...s.bubble, ...(m.role === "user" ? s.userBubble : s.assistantBubble) }}>
                    <div style={s.bubbleText}>{m.content}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <footer style={s.bottom}>
          <div style={s.composerRow}>
            <div style={s.inputBox}>
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
            </div>

            <button
              className="soft-glow"
              style={{
                ...s.sendBtn,
                opacity: sending || !text.trim() ? 0.6 : 1,
                cursor: sending || !text.trim() ? "default" : "pointer",
              }}
              type="button"
              onClick={() => void send()}
              disabled={sending || !text.trim()}
            >
              {sending ? "…" : "Отправить"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100dvh",
    padding: "0 0 calc(132px + var(--tg-viewport-inset-bottom, 0px))",
    display: "grid",
    boxSizing: "border-box",
    overflow: "hidden",
    overscrollBehavior: "none",
  },
  screen: {
    height: "100%",
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    padding: "14px 14px 0",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  top: {
    padding: "6px 2px 10px",
    display: "grid",
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  error: {
    background: "rgba(239,68,68,.12)",
    border: "1px solid rgba(239,68,68,.25)",
    color: "#7f1d1d",
    borderRadius: 16,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 650,
    marginTop: 10,
  },
  glassBlock: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    borderRadius: 20,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.55)",
    boxShadow: "0 10px 28px rgba(0,0,0,.10)",
    backdropFilter: "blur(16px) saturate(160%)",
    WebkitBackdropFilter: "blur(16px) saturate(160%)",
    overflow: "hidden",
  },
  loading: {
    padding: "18px 12px",
    fontSize: 14,
    color: "rgba(15,23,42,0.7)",
    textAlign: "center",
  },
  empty: {
    background: "rgba(255,255,255,0.5)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    display: "grid",
    gap: 10,
    margin: 12,
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
  messages: {
    minHeight: 0,
    flex: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    padding: "14px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "transparent",
    touchAction: "pan-y",
  },
  bubbleRow: {
    display: "flex",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 18,
    padding: "10px 12px",
    whiteSpace: "pre-wrap",
  },
  assistantBubble: {
    background: "rgba(255,255,255,0.62)",
    color: "#0f172a",
    border: "1px solid rgba(0,0,0,0.08)",
    borderTopLeftRadius: 8,
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
  },
  userBubble: {
    background: "rgba(255,255,255,0.48)",
    color: "#0f172a",
    border: "1px solid rgba(0,0,0,0.10)",
    borderTopRightRadius: 8,
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 1.38,
    fontWeight: 450,
  },
  bottom: {
    padding: "14px 0 0",
    background: "transparent",
  },
  composerRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },
  inputBox: {
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.60)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    minHeight: 56,
  },
  input: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    fontSize: 14,
    lineHeight: 1.35,
    fontWeight: 450,
    color: "#0f172a",
  },
  sendBtn: {
    border: "none",
    borderRadius: 16,
    padding: "10px 14px",
    color: "#1b1b1b",
    fontSize: 13.5,
    fontWeight: 850,
    boxShadow: "0 10px 22px rgba(0,0,0,.14)",
    minHeight: 56,
  },
};
