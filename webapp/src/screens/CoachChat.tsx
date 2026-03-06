import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCoachChatHistory, sendCoachChat } from "@/api/plan";
import { getPlannedWorkouts, replacePlannedWorkoutExercise, type PlannedWorkout } from "@/api/schedule";
import { useNavigate } from "react-router-dom";
import { ArrowUp } from "lucide-react";
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

  // Lock body scroll while chat is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const suggested = useMemo(
    () => [
      "Проанализируй мою последнюю тренировку",
      "Почему не растёт вес в жиме?",
      "Последние тренировки устаю сильнее",
      "Как уложиться в 45–60 минут?",
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
    const next = Math.min(140, Math.max(22, el.scrollHeight));
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

  const hasText = text.trim().length > 0;

  return (
    <div style={s.page}>
      <style>{`
        .cc-typing{display:inline-flex;align-items:center;gap:5px;padding:2px 0}
        .cc-dot{width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,0.38);animation:ccPulse 1.4s ease-in-out infinite}
        .cc-dot:nth-child(2){animation-delay:.2s}
        .cc-dot:nth-child(3){animation-delay:.4s}
        @keyframes ccPulse{0%,80%,100%{opacity:.35;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}
      `}</style>

      {/* ── Header ─────────────────────────────────── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.avatarWrap}>
            <img src={mascotImg} alt="" style={s.avatarImg} />
          </div>
          <div style={s.headerName}>Moro</div>
          <div style={s.headerRole}>ИИ-тренер</div>
        </div>
      </header>

      {/* ── Error ──────────────────────────────────── */}
      {error && <div style={s.errorBanner}>{error}</div>}

      {/* ── Messages ───────────────────────────────── */}
      <section ref={listRef} style={s.messages}>
        {loading ? (
          <div style={s.loadingWrap}>
            <div className="cc-typing">
              <span className="cc-dot" /><span className="cc-dot" /><span className="cc-dot" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div style={s.emptyWrap}>
            <div style={s.emptyAvatar}>
              <img src={mascotImg} alt="" style={s.emptyAvatarImg} />
            </div>
            <div style={s.emptyTitle}>Moro — твой ИИ-тренер</div>
            <div style={s.emptySub}>Спроси что-нибудь или выбери тему</div>
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
              <div key={m.id} style={{ ...s.row, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ ...s.bubble, ...(m.role === "user" ? s.userBubble : s.aiBubble) }}>
                  <span style={s.bubbleText}>{m.content}</span>
                  {m.role === "assistant" &&
                  Array.isArray((m as any)?.meta?.actions) &&
                  (m as any).meta.actions.some((a: any) => a?.type === "replace_exercise") ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {(m as any).meta.actions
                        .filter((a: any) => a?.type === "replace_exercise")
                        .slice(0, 3)
                        .map((a: any, i: number) => (
                          <button key={`apply-${m.id}-${i}`} type="button" style={s.actionBtn}
                            onClick={() => void openApplyReplacement(a)}>
                            Применить: {String(a?.fromName || "").trim() || "упражнение"} → {String(a?.toName || "").trim() || "вариант"}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ ...s.row, justifyContent: "flex-start" }}>
                <div style={{ ...s.bubble, ...s.aiBubble, padding: "12px 16px" }}>
                  <div className="cc-typing">
                    <span className="cc-dot" /><span className="cc-dot" /><span className="cc-dot" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Modal ──────────────────────────────────── */}
      {applyModal.open && (
        <div style={s.modalOverlay} onClick={closeApplyModal} role="dialog" aria-modal="true">
          <div style={s.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 17, color: "#000" }}>Куда применить замену</div>
              <button type="button" onClick={closeApplyModal} style={s.modalClose}>✕</button>
            </div>
            {applyModal.error && <div style={s.modalError}>{applyModal.error}</div>}
            {applyModal.loading ? (
              <div style={{ marginTop: 12, fontSize: 13, color: "#8e8e93" }}>Загружаю…</div>
            ) : applyModal.planned.length === 0 ? (
              <div style={{ marginTop: 12, fontSize: 13, color: "#8e8e93" }}>Нет запланированных тренировок.</div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                {applyModal.planned.slice(0, 20).map((pw) => {
                  const p: any = pw.plan || {};
                  const title = String(p.dayLabel || p.title || "Тренировка");
                  const when = pw.scheduledFor ? new Date(pw.scheduledFor).toLocaleString("ru-RU") : "";
                  return (
                    <button key={pw.id} type="button" disabled={applyModal.loading}
                      style={s.modalItem} onClick={() => void applyReplacementToPlanned(pw)}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "#000" }}>{title}</div>
                      {when && <div style={{ fontSize: 12, color: "#8e8e93", marginTop: 2 }}>{when}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Composer ───────────────────────────────── */}
      <footer style={s.composer}>
        <div style={s.composerRow}>
          <div style={s.inputWrap}>
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
            style={{ ...s.sendBtn, background: hasText && !sending ? "#007AFF" : "rgba(0,0,0,0.08)" }}
            type="button"
            onClick={() => void send()}
            disabled={sending || !hasText}
            aria-label="Отправить"
          >
            <ArrowUp size={20} strokeWidth={2.8} color={hasText && !sending ? "#fff" : "rgba(0,0,0,0.25)"} />
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    height: "calc(100dvh - var(--layout-nav-height, 72px))",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0,1fr) auto",
    overflow: "hidden",
    fontFamily: "-apple-system, SF Pro Text, SF Pro Display, system-ui, sans-serif",
  },

  // ── Header (iOS-style centered)
  header: {
    padding: "8px 16px 8px",
    borderBottom: "0.5px solid rgba(0,0,0,0.12)",
    background: "rgba(247,247,247,0.72)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
  },
  headerInner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    overflow: "hidden",
    background: "#e5e5ea",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: "center 10%",
  },
  headerName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#000",
    lineHeight: 1.15,
    marginTop: 2,
  },
  headerRole: {
    fontSize: 11,
    fontWeight: 400,
    color: "#8e8e93",
    lineHeight: 1.15,
  },

  // ── Error
  errorBanner: {
    margin: "8px 16px 0",
    background: "#fff2f2",
    border: "0.5px solid rgba(255,59,48,0.3)",
    color: "#ff3b30",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 500,
  },

  // ── Messages
  messages: {
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    padding: "10px 16px 6px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    touchAction: "pan-y",
  },
  loadingWrap: {
    flex: 1,
    display: "grid",
    placeItems: "center",
  },

  // ── Empty state
  emptyWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 12px",
  },
  emptyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 999,
    overflow: "hidden",
    background: "#e5e5ea",
    marginBottom: 4,
  },
  emptyAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: "center 10%",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: 600,
    color: "#000",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: "#8e8e93",
    textAlign: "center",
    marginBottom: 12,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  chip: {
    border: "0.5px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.85)",
    color: "#007AFF",
    padding: "7px 14px",
    borderRadius: 18,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
  },

  // ── Bubbles
  row: {
    display: "flex",
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "78%",
    padding: "8px 12px",
    whiteSpace: "pre-wrap",
  } as CSSProperties,
  aiBubble: {
    background: "#e9e9eb",
    color: "#000",
    borderRadius: "18px 18px 18px 4px",
  },
  userBubble: {
    background: "#007AFF",
    color: "#fff",
    borderRadius: "18px 18px 4px 18px",
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 1.35,
    fontWeight: 400,
    letterSpacing: -0.1,
  },
  actionBtn: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 12,
    border: "0.5px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.85)",
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
    color: "#007AFF",
  } as CSSProperties,

  // ── Composer
  composer: {
    padding: "6px 10px calc(6px + max(var(--tg-viewport-inset-bottom, 0px), env(safe-area-inset-bottom, 0px)))",
    background: "rgba(247,247,247,0.72)",
    borderTop: "0.5px solid rgba(0,0,0,0.12)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
  },
  composerRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 6,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 20,
    border: "0.5px solid rgba(0,0,0,0.18)",
    background: "#fff",
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    minHeight: 36,
  },
  input: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    fontSize: 16,
    lineHeight: 1.3,
    fontWeight: 400,
    color: "#000",
    caretColor: "#007AFF",
    height: 22,
    letterSpacing: -0.1,
  } as CSSProperties,
  sendBtn: {
    border: "none",
    borderRadius: 999,
    width: 34,
    height: 34,
    padding: 0,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    cursor: "pointer",
    transition: "background 150ms ease",
  },

  // ── Modal (iOS action sheet style)
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "10px",
    zIndex: 70,
  },
  modalCard: {
    width: "min(720px, 100%)",
    borderRadius: 14,
    background: "#fff",
    padding: 16,
  },
  modalClose: {
    border: "none",
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    fontWeight: 400,
    cursor: "pointer",
    fontSize: 15,
    color: "#8e8e93",
  },
  modalError: {
    marginTop: 8,
    padding: "8px 12px",
    borderRadius: 10,
    background: "#fff2f2",
    color: "#ff3b30",
    fontWeight: 500,
    fontSize: 13,
  },
  modalItem: {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    background: "rgba(0,0,0,0.04)",
    cursor: "pointer",
    textAlign: "left",
  } as CSSProperties,
};
