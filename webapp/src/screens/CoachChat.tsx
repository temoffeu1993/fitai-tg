import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCoachChatHistory, sendCoachChat } from "@/api/plan";
import { getPlannedWorkouts, replacePlannedWorkoutExercise, type PlannedWorkout } from "@/api/schedule";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import mascotImg from "@/assets/robonew.webp";

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
  const pageRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll while chat is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
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

  useEffect(() => { autosizeInput(); }, [text]);

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
    return () => { canceled = true; };
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
        open: true, action, planned: [], loading: false,
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
      try { window.dispatchEvent(new Event("schedule_updated" as any)); } catch {}
    } catch (e) {
      console.error(e);
      setApplyModal((prev) => ({ ...prev, loading: false, error: "Не удалось применить замену. Попробуй ещё раз." }));
    } finally {
      setApplyModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div ref={pageRef} style={s.page}>
      <style>{`
        .cc-typing { display:inline-flex; align-items:center; gap:6px; padding:2px }
        .cc-typing-dot { width:6px; height:6px; border-radius:999px; background:rgba(15,23,42,0.45); animation:ccBounce 1.2s ease-in-out infinite }
        .cc-typing-dot:nth-child(2){animation-delay:.15s}
        .cc-typing-dot:nth-child(3){animation-delay:.3s}
        @keyframes ccBounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}
      `}</style>

      {/* ── Header ─────────────────────────────────────── */}
      <header style={s.header}>
        <div style={s.avatarCircle}>
          <img src={mascotImg} alt="" style={s.avatarImg} />
        </div>
        <div style={s.headerText}>
          <div style={s.headerTitle}>Moro — твой тренер</div>
          <div style={s.headerSub}>ИИ-ассистент</div>
        </div>
      </header>

      {/* ── Error ──────────────────────────────────────── */}
      {error && <div style={s.errorBanner}>{error}</div>}

      {/* ── Messages ───────────────────────────────────── */}
      <section ref={listRef} style={s.messages}>
        {loading ? (
          <div style={s.loadingWrap}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="cc-typing-dot" style={{ width: 10, height: 10, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
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
              <div key={m.id} style={{ ...s.bubbleRow, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
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
                            style={s.actionBtn}
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
            {sending && (
              <div style={{ ...s.bubbleRow, justifyContent: "flex-start" }}>
                <div style={{ ...s.bubble, ...s.assistantBubble }}>
                  <div className="cc-typing" aria-label="Тренер печатает">
                    <span className="cc-typing-dot" />
                    <span className="cc-typing-dot" />
                    <span className="cc-typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Apply Replacement Modal ────────────────────── */}
      {applyModal.open && (
        <div style={s.modalOverlay} onClick={closeApplyModal} role="dialog" aria-modal="true">
          <div style={s.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1e1f22" }}>Куда применить замену</div>
              <button type="button" onClick={closeApplyModal} style={s.modalClose}>✕</button>
            </div>

            {applyModal.error && (
              <div style={s.modalError}>{applyModal.error}</div>
            )}

            {applyModal.loading ? (
              <div style={{ marginTop: 12, fontSize: 13, color: "rgba(15,23,42,0.55)" }}>Загружаю…</div>
            ) : applyModal.planned.length === 0 ? (
              <div style={{ marginTop: 12, fontSize: 13, color: "rgba(15,23,42,0.55)" }}>Нет запланированных тренировок.</div>
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
                      style={s.modalWorkoutBtn}
                      onClick={() => void applyReplacementToPlanned(pw)}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e1f22" }}>{title}</div>
                      {when && <div style={{ fontSize: 12, color: "rgba(15,23,42,0.55)", marginTop: 3 }}>{when}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Composer ───────────────────────────────────── */}
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
            style={{
              ...s.sendBtn,
              opacity: sending || !text.trim() ? 0.45 : 1,
              cursor: sending || !text.trim() ? "default" : "pointer",
            }}
            type="button"
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            aria-label="Отправить"
          >
            <Send size={18} strokeWidth={2.5} color="#fff" />
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 44;

const s: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    height: "calc(100dvh - var(--layout-nav-height, 72px))",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },

  // ── Header
  header: {
    padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
    padding: 2,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e1f22",
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 13,
    fontWeight: 400,
    color: "rgba(15,23,42,0.55)",
    marginTop: 2,
  },

  // ── Error
  errorBanner: {
    margin: "0 16px 8px",
    background: "rgba(239,68,68,.10)",
    border: "1px solid rgba(239,68,68,.2)",
    color: "#7f1d1d",
    borderRadius: 16,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
  },

  // ── Messages area
  messages: {
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    padding: "8px 16px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    touchAction: "pan-y",
  },
  loadingWrap: {
    flex: 1,
    display: "grid",
    placeItems: "center",
  },

  // ── Empty state
  empty: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    padding: 18,
    display: "grid",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1e1f22",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    border: "1px solid rgba(15,23,42,0.12)",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "#1e1f22",
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },

  // ── Bubbles
  bubbleRow: {
    display: "flex",
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: 18,
    padding: "10px 14px",
    whiteSpace: "pre-wrap",
  } as CSSProperties,
  assistantBubble: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    color: "#0f172a",
    border: "1px solid rgba(255,255,255,0.75)",
    borderTopLeftRadius: 6,
    boxShadow: "0 4px 12px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  userBubble: {
    background: "#1e1f22",
    color: "rgba(255,255,255,0.96)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderTopRightRadius: 6,
    boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 1.42,
    fontWeight: 400,
  },
  actionBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
    color: "#1e1f22",
  } as CSSProperties,

  // ── Composer
  composer: {
    padding: "10px 16px calc(10px + max(var(--tg-viewport-inset-bottom, 0px), env(safe-area-inset-bottom, 0px)))",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(242,242,247,0.88) 100%)",
    borderTop: "1px solid rgba(255,255,255,0.75)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  composerInner: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "end",
  },
  inputBox: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    boxShadow: "inset 0 1px 3px rgba(15,23,42,0.08), 0 1px 0 rgba(255,255,255,0.9)",
    padding: "6px 14px",
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
    fontWeight: 400,
    color: "#0f172a",
    caretColor: "#0f172a",
    height: 44,
  } as CSSProperties,
  sendBtn: {
    border: "none",
    borderRadius: 999,
    width: 44,
    height: 44,
    padding: 0,
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 4px 10px rgba(0,0,0,0.20)",
    display: "grid",
    placeItems: "center",
    transition: "opacity 200ms ease",
  },

  // ── Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: 14,
    zIndex: 70,
  },
  modalCard: {
    width: "min(720px, 100%)",
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,242,247,0.95) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.9)",
    padding: 18,
  },
  modalClose: {
    border: "1px solid rgba(15,23,42,0.1)",
    borderRadius: 12,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    color: "#1e1f22",
  },
  modalError: {
    marginTop: 10,
    padding: 10,
    borderRadius: 14,
    background: "rgba(239,68,68,.08)",
    border: "1px solid rgba(239,68,68,.15)",
    color: "#7f1d1d",
    fontWeight: 600,
    fontSize: 13,
  },
  modalWorkoutBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    boxShadow: "0 4px 12px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    cursor: "pointer",
    textAlign: "left",
  } as CSSProperties,
};
