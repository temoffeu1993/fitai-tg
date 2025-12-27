import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

export default function FloatingCoachChat() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollLockRef = useRef<{
    scrollY: number;
    body: Partial<CSSStyleDeclaration>;
    html: Partial<CSSStyleDeclaration>;
  } | null>(null);

  const canSend = useMemo(() => Boolean(text.trim()) && !sending, [text, sending]);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (!open) return;
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
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      const prev = scrollLockRef.current;
      if (prev) {
        document.body.style.position = prev.body.position || "";
        document.body.style.top = prev.body.top || "";
        document.body.style.left = prev.body.left || "";
        document.body.style.right = prev.body.right || "";
        document.body.style.width = prev.body.width || "";
        document.body.style.overflow = prev.body.overflow || "";
        document.documentElement.style.overflow = prev.html.overflow || "";
        window.scrollTo(0, prev.scrollY || 0);
        scrollLockRef.current = null;
      }
      return;
    }

    const scrollY = window.scrollY || 0;
    scrollLockRef.current = {
      scrollY,
      body: {
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        overflow: document.body.style.overflow,
      },
      html: {
        overflow: document.documentElement.style.overflow,
      },
    };

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      const prev = scrollLockRef.current;
      if (!prev) return;
      document.body.style.position = prev.body.position || "";
      document.body.style.top = prev.body.top || "";
      document.body.style.left = prev.body.left || "";
      document.body.style.right = prev.body.right || "";
      document.body.style.width = prev.body.width || "";
      document.body.style.overflow = prev.body.overflow || "";
      document.documentElement.style.overflow = prev.html.overflow || "";
      window.scrollTo(0, prev.scrollY || 0);
      scrollLockRef.current = null;
    };
  }, [open]);

  const onSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
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
    setTimeout(scrollToBottom, 30);

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
      setTimeout(scrollToBottom, 30);
    } catch {
      setError("Не удалось отправить сообщение. Попробуй ещё раз.");
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
      setText(msg);
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 180,
          right: 10,
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          border: "none",
          fontSize: 24,
          zIndex: 9999,
          cursor: "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
        }}
        aria-label="Открыть чат с тренером"
        title="Чат с тренером"
      >
        🤖
      </button>
    );
  }

  return (
    <div
      style={s.wrap}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div style={s.card} onMouseDown={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>🤖 Тренер ИИ</div>
          <button style={s.closeBtn} onClick={() => setOpen(false)} aria-label="Закрыть чат">
            ✕
          </button>
        </div>

        <div style={s.list} ref={listRef}>
          {loading && <div style={s.hint}>Загружаю чат…</div>}
          {error && <div style={s.error}>{error}</div>}
          {!loading && messages.length === 0 && !error && <div style={s.hint}>Напиши сообщение — тренер ответит.</div>}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                ...s.bubble,
                ...(m.role === "user" ? s.bubbleUser : s.bubbleAssistant),
              }}
            >
              {m.content}
            </div>
          ))}
        </div>

        <div style={s.inputRow}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Сообщение…"
            style={s.input}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            onClick={() => void onSend()}
            disabled={!canSend}
            style={{
              ...s.sendBtn,
              ...(canSend ? null : s.sendBtnDisabled),
            }}
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    padding: 0,
    display: "block",
    background: "transparent",
    overscrollBehavior: "contain",
  },
  card: {
    position: "fixed",
    right: 10,
    bottom: 240,
    width: "min(92vw, 420px)",
    height: "min(72vh, 520px)",
    maxHeight: "calc(100vh - 260px)",
    background: "rgba(255,255,255,0.62)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 14px 40px rgba(0,0,0,0.18)",
    borderRadius: 20,
    padding: 12,
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: 10,
    overflow: "hidden",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { fontSize: 14, fontWeight: 800, color: "#111" },
  closeBtn: {
    border: "none",
    background: "transparent",
    color: "#1b1b1b",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 6,
    borderRadius: 10,
  },
  list: {
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 4,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overscrollBehavior: "contain",
  },
  hint: { fontSize: 12, color: "rgba(0,0,0,.65)", padding: "6px 2px" },
  error: { fontSize: 12, color: "#b42318", padding: "6px 2px" },
  bubble: {
    maxWidth: "90%",
    padding: "10px 12px",
    borderRadius: 16,
    fontSize: 13,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    background: "rgba(0,0,0,0.08)",
    border: "1px solid rgba(0,0,0,0.06)",
    color: "#111",
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.06)",
    color: "#111",
  },
  inputRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" },
  input: {
    resize: "none",
    width: "100%",
    minHeight: 42,
    maxHeight: 120,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.75)",
    outline: "none",
    color: "#111",
    fontSize: 13,
    lineHeight: 1.3,
  },
  sendBtn: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.85)",
    color: "#111",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform .12s ease, filter .12s ease",
  },
  sendBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
