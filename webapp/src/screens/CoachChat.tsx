import { useEffect, useMemo, useRef, useState } from "react";
import { getCoachChatHistory, sendCoachChat } from "@/api/plan";
import { getPlannedWorkouts, replacePlannedWorkoutExercise, type PlannedWorkout } from "@/api/schedule";
import { useNavigate } from "react-router-dom";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: any;
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
      .typing {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 2px;
      }
      .typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(15,23,42,0.5);
        animation: typingBounce 1.2s ease-in-out infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.15s; }
      .typing-dot:nth-child(3) { animation-delay: 0.3s; }
      @keyframes glowShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.12) saturate(1.06); transform: scale(1.01) } }
      @keyframes typingBounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
        40% { transform: translateY(-4px); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
    `}</style>
  );
}

export default function CoachChat() {
  const nav = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [applyModal, setApplyModal] = useState<{
    open: boolean;
    action: any | null;
    planned: PlannedWorkout[];
    loading: boolean;
    error: string | null;
  }>({ open: false, action: null, planned: [], loading: false, error: null });
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const prevWindowScrollY = window.scrollY || 0;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const rootEl = document.getElementById("root");
    const prevRootScrollTop = rootEl ? (rootEl as any).scrollTop ?? 0 : 0;
    const prevRootOverflowY = rootEl?.style.overflowY;
    const prevRootOverscroll = rootEl?.style.overscrollBehavior;
    const prevRootTouchAction = rootEl?.style.touchAction;

    // Важно: если предыдущий экран был проскроллен, то новый экран может открыться "со сдвигом".
    // Сбрасываем скролл, но вернём его обратно при выходе.
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (rootEl) (rootEl as any).scrollTop = 0;
    } catch {}

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (rootEl) {
      rootEl.style.overflowY = "hidden";
      rootEl.style.overscrollBehavior = "none";
      rootEl.style.touchAction = "none";
    }
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      if (rootEl) {
        rootEl.style.overflowY = prevRootOverflowY ?? "";
        rootEl.style.overscrollBehavior = prevRootOverscroll ?? "";
        rootEl.style.touchAction = prevRootTouchAction ?? "";
      }
      try {
        if (rootEl) (rootEl as any).scrollTop = prevRootScrollTop;
        window.scrollTo(0, prevWindowScrollY);
      } catch {}
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

  const autosizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(140, Math.max(44, el.scrollHeight));
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    autosizeInput();
  }, [text]);

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
            meta: m?.meta ?? null,
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
    requestAnimationFrame(() => autosizeInput());

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
        meta: a?.meta ?? null,
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

  const openApplyReplacement = async (action: any) => {
    setApplyModal({ open: true, action, planned: [], loading: true, error: null });
    try {
      const list = await getPlannedWorkouts();
      const remaining = (Array.isArray(list) ? list : []).filter(
        (w) => w && w.status !== "cancelled" && w.status !== "completed"
      );
      setApplyModal({ open: true, action, planned: remaining, loading: false, error: null });
    } catch (e) {
      console.error(e);
      setApplyModal({
        open: true,
        action,
        planned: [],
        loading: false,
        error: "Не удалось загрузить список тренировок. Попробуй ещё раз.",
      });
    }
  };

  const closeApplyModal = () => setApplyModal({ open: false, action: null, planned: [], loading: false, error: null });

  const findExerciseIndexInPlanned = (pw: PlannedWorkout, fromExerciseId: string, fromName?: string | null): number => {
    const p: any = pw?.plan || {};
    const exs: any[] = Array.isArray(p?.exercises) ? p.exercises : [];
    const byId = exs.findIndex((ex) => String(ex?.exerciseId || ex?.id || ex?.exercise?.id || "") === fromExerciseId);
    if (byId >= 0) return byId;
    const name = String(fromName || "").trim().toLowerCase();
    if (!name) return -1;
    return exs.findIndex((ex) => String(ex?.exerciseName || ex?.name || "").toLowerCase().includes(name.slice(0, 8)));
  };

  const applyReplacementToPlanned = async (pw: PlannedWorkout) => {
    const a = applyModal.action;
    if (!a || a.type !== "replace_exercise") return;
    const fromId = String(a.fromExerciseId || "");
    const toId = String(a.toExerciseId || "");
    if (!fromId || !toId) return;

    const idx = findExerciseIndexInPlanned(pw, fromId, a.fromName);
    if (idx < 0) {
      setApplyModal((prev) => ({ ...prev, error: "В этой тренировке не нашёл упражнение для замены." }));
      return;
    }

    setApplyModal((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await replacePlannedWorkoutExercise({
        plannedWorkoutId: pw.id,
        index: idx,
        newExerciseId: toId,
        reason: "coach_suggested",
        source: "coach",
      });
      closeApplyModal();
      try {
        window.dispatchEvent(new Event("schedule_updated" as any));
      } catch {}
    } catch (e) {
      console.error(e);
      setApplyModal((prev) => ({ ...prev, loading: false, error: "Не удалось применить замену. Попробуй ещё раз." }));
    } finally {
      setApplyModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div style={s.page}>
      <SoftGlowStyles />

      <div style={s.screen}>
        <header style={s.headerBar}>
          <button
            type="button"
            style={s.backBtn}
            onClick={() => {
              try {
                if (window.history.length > 1) nav(-1);
                else nav("/");
              } catch {
                nav("/");
              }
            }}
            aria-label="Назад"
          >
            <span style={s.backChevron}>‹</span>
            <span style={s.backLabel}>Назад</span>
          </button>

          <div style={s.headerTitleWrap}>
            <div style={s.headerTitle}>Moro — твой тренер</div>
            <div style={s.headerSubtitle}>чат с ИИ</div>
          </div>

          <div style={s.avatar} aria-hidden title="Moro">
            <span style={s.avatarEmoji}>🤖</span>
          </div>
        </header>

        {error ? <div style={s.errorBanner}>{error}</div> : null}

        <section style={s.thread}>
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
              <>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{ ...s.bubbleRow, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}
                  >
                    <div style={{ ...s.bubble, ...(m.role === "user" ? s.userBubble : s.assistantBubble) }}>
                      <div style={s.bubbleText}>{m.content}</div>
                      {m.role === "assistant" &&
                      Array.isArray((m as any)?.meta?.actions) &&
                      (m as any).meta.actions.some((a: any) => a?.type === "replace_exercise") ? (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          {(m as any).meta.actions
                            .filter((a: any) => a?.type === "replace_exercise")
                            .slice(0, 3)
                            .map((a: any, i: number) => (
                              <button
                                key={`apply-${m.id}-${i}`}
                                type="button"
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  borderRadius: 14,
                                  border: "1px solid rgba(0,0,0,0.10)",
                                  background: "rgba(255,255,255,0.75)",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                                onClick={() => void openApplyReplacement(a)}
                              >
                                Применить замену: {String(a?.fromName || "").trim() || "упражнение"} →{" "}
                                {String(a?.toName || "").trim() || "вариант"}
                              </button>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {sending ? (
                  <div style={{ ...s.bubbleRow, justifyContent: "flex-start" }}>
                    <div style={{ ...s.bubble, ...s.assistantBubble }}>
                      <div className="typing" aria-label="Тренер печатает">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        {applyModal.open ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              padding: 14,
              zIndex: 70,
            }}
            onClick={closeApplyModal}
            role="dialog"
            aria-modal="true"
          >
            <div
              style={{
                width: "min(820px, 100%)",
                background: "#fff",
                borderRadius: 18,
                boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                padding: 14,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#0B1220" }}>Куда применить замену</div>
                <button
                  type="button"
                  onClick={closeApplyModal}
                  style={{
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 10,
                    background: "#fff",
                    padding: "8px 10px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {applyModal.error ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(239,68,68,.10)",
                    border: "1px solid rgba(239,68,68,.2)",
                    color: "#7f1d1d",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {applyModal.error}
                </div>
              ) : null}

              {applyModal.loading ? (
                <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>Загружаю…</div>
              ) : applyModal.planned.length === 0 ? (
                <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>Нет запланированных тренировок.</div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {applyModal.planned.slice(0, 20).map((pw) => {
                    const p: any = pw.plan || {};
                    const title = String(p.dayLabel || p.title || "Тренировка");
                    const when = pw.scheduledFor ? new Date(pw.scheduledFor).toLocaleString("ru-RU") : "";
                    return (
                      <button
                        key={pw.id}
                        type="button"
                        disabled={applyModal.loading}
                        style={{
                          width: "100%",
                          padding: "12px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "rgba(15,23,42,0.03)",
                          fontWeight: 900,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onClick={() => void applyReplacementToPlanned(pw)}
                      >
                        <div style={{ fontWeight: 900 }}>{title}</div>
                        {when ? <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{when}</div> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <footer style={s.composer}>
          <div style={s.composerInner}>
            <div style={s.inputBox}>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сообщение"
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
              aria-label="Отправить"
              title="Отправить"
            >
              {sending ? "…" : "➤"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
    overscrollBehavior: "none",
    background: "transparent",
  },
  screen: {
    width: "min(720px, 100%)",
    height: "100%",
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto",
    padding: 0,
    boxSizing: "border-box",
    overflow: "hidden",
  },
  headerBar: {
    gridRow: 1,
    padding: "calc(10px + var(--tg-viewport-inset-top, 0px)) 14px 10px",
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    background: "rgba(255,255,255,0.70)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    backdropFilter: "blur(18px) saturate(180%)",
    WebkitBackdropFilter: "blur(18px) saturate(180%)",
  },
  backBtn: {
    border: "none",
    background: "transparent",
    padding: "8px 10px",
    marginLeft: -8,
    borderRadius: 14,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 650,
    letterSpacing: -0.2,
    cursor: "pointer",
  },
  backChevron: {
    fontSize: 22,
    lineHeight: 1,
    marginTop: -2,
  },
  backLabel: {
    fontSize: 15,
    lineHeight: 1,
  },
  headerTitleWrap: {
    display: "grid",
    justifyItems: "center",
    gap: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: 800,
    letterSpacing: -0.2,
    color: "#0f172a",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(15,23,42,0.55)",
    lineHeight: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
    display: "grid",
    placeItems: "center",
  },
  avatarEmoji: {
    fontSize: 20,
    lineHeight: 1,
  },
  errorBanner: {
    gridRow: 2,
    margin: "10px 14px 0",
    background: "rgba(239,68,68,.12)",
    border: "1px solid rgba(239,68,68,.25)",
    color: "#7f1d1d",
    borderRadius: 16,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 750,
  },
  thread: {
    gridRow: 3,
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background:
      "radial-gradient(circle at 20% 10%, rgba(236,227,255,.35) 0%, rgba(236,227,255,0) 38%), radial-gradient(circle at 90% 40%, rgba(255,216,194,.30) 0%, rgba(255,216,194,0) 42%), rgba(255,255,255,0.22)",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  loading: {
    padding: "18px 12px",
    fontSize: 14,
    color: "rgba(15,23,42,0.7)",
    textAlign: "center",
  },
  empty: {
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: 14,
    display: "grid",
    gap: 10,
    margin: "12px 14px",
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
    padding: "14px 14px 10px",
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
    maxWidth: "86%",
    borderRadius: 18,
    padding: "10px 12px",
    whiteSpace: "pre-wrap",
  },
  assistantBubble: {
    background: "rgba(255,255,255,0.70)",
    color: "#0f172a",
    border: "1px solid rgba(0,0,0,0.08)",
    borderTopLeftRadius: 8,
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
  },
  userBubble: {
    background: "rgba(15,23,42,0.92)",
    color: "rgba(255,255,255,0.96)",
    border: "1px solid rgba(15,23,42,0.14)",
    borderTopRightRadius: 8,
    boxShadow: "0 6px 16px rgba(0,0,0,0.14)",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 1.38,
    fontWeight: 450,
  },
  composer: {
    gridRow: 4,
    padding:
      "10px 14px calc(14px + max(var(--tg-viewport-inset-bottom, 0px), env(safe-area-inset-bottom, 0px)))",
    background: "rgba(255,255,255,0.72)",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    backdropFilter: "blur(18px) saturate(180%)",
    WebkitBackdropFilter: "blur(18px) saturate(180%)",
  },
  composerInner: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "end",
  },
  inputBox: {
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.78)",
    boxShadow: "none",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    minHeight: 48,
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
    caretColor: "#0f172a",
    height: 44,
  },
  sendBtn: {
    border: "none",
    borderRadius: 999,
    width: 48,
    height: 48,
    padding: 0,
    background: "rgba(15,23,42,0.92)",
    color: "rgba(255,255,255,0.96)",
    fontSize: 18,
    fontWeight: 900,
    boxShadow: "none",
    display: "grid",
    placeItems: "center",
  },
};
