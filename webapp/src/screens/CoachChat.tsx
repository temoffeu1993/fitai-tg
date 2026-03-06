import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getCoachChatHistory, sendCoachChat } from "@/api/plan";
import { getPlannedWorkouts, replacePlannedWorkoutExercise, type PlannedWorkout } from "@/api/schedule";
import { ArrowUp } from "lucide-react";

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

// ─── Animation constants (match ScheduleBottomSheet) ───────────────────────
const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const ENTER_MS = 380;
const EXIT_MS = 260;
const OPEN_TICK = 12;

// ─── Exported bottom-sheet component ───────────────────────────────────────
export default function CoachChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SheetInner onClose={onClose} />;
}

function SheetInner({ onClose }: { onClose: () => void }) {
  // ── Animation state ──
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setEntered(true);
      const t2 = window.setTimeout(() => setAnimDone(true), ENTER_MS + 50);
      timers.current.push(t2);
    }, OPEN_TICK);
    timers.current.push(t1);
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setAnimDone(false);
    setEntered(false);
    const t = window.setTimeout(() => onClose(), EXIT_MS + 20);
    timers.current.push(t);
  }, [closing, onClose]);

  // ── Body scroll lock ──
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Chat logic ──
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [applyModal, setApplyModal] = useState<{
    open: boolean; action: any | null; planned: PlannedWorkout[]; loading: boolean; error: string | null;
  }>({ open: false, action: null, planned: [], loading: false, error: null });
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const suggested = useMemo(() => [
    "Проанализируй мою последнюю тренировку",
    "Почему не растёт вес в жиме?",
    "Последние тренировки устаю сильнее",
    "Как уложиться в 45–60 минут?",
  ], []);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const autosizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(120, Math.max(22, el.scrollHeight))}px`;
  };

  useEffect(() => { autosizeInput(); }, [text]);

  useEffect(() => {
    let canceled = false;
    void (async () => {
      setLoading(true); setError(null);
      try {
        const res = await getCoachChatHistory(60);
        const raw = Array.isArray(res?.messages) ? res.messages : [];
        if (!canceled) setMessages(raw.filter((m: any) => m?.role === "user" || m?.role === "assistant").map((m: any) => ({
          id: String(m.id || crypto.randomUUID()), role: m.role, content: String(m.content || ""),
          meta: m?.meta ?? null, createdAt: String(m.createdAt || nowIso()),
        })));
      } catch { if (!canceled) setError("Не удалось загрузить чат"); }
      finally { if (!canceled) setLoading(false); setTimeout(scrollToBottom, 50); }
    })();
    return () => { canceled = true; };
  }, []);

  const send = async (value?: string) => {
    const msg = String(value ?? text ?? "").trim();
    if (!msg || sending) return;
    setSending(true); setError(null); setText("");
    requestAnimationFrame(() => autosizeInput());
    const tempUser: Msg = { id: crypto.randomUUID(), role: "user", content: msg, createdAt: nowIso() };
    setMessages((prev) => [...prev, tempUser]);
    setTimeout(scrollToBottom, 50);
    try {
      const res = await sendCoachChat(msg);
      const a = res?.assistantMessage;
      setMessages((prev) => [...prev, {
        id: String(a?.id || crypto.randomUUID()), role: "assistant",
        content: String(a?.content || ""), meta: a?.meta ?? null, createdAt: String(a?.createdAt || nowIso()),
      }]);
      setTimeout(scrollToBottom, 50);
    } catch {
      setError("Не удалось отправить"); setMessages((prev) => prev.filter((m) => m.id !== tempUser.id)); setText(msg);
    } finally { setSending(false); }
  };

  // ── Replace exercise logic ──
  const openApplyReplacement = async (action: any) => {
    setApplyModal({ open: true, action, planned: [], loading: true, error: null });
    try {
      const list = await getPlannedWorkouts();
      const remaining = (Array.isArray(list) ? list : []).filter((w) => w && w.status !== "cancelled" && w.status !== "completed");
      setApplyModal({ open: true, action, planned: remaining, loading: false, error: null });
    } catch {
      setApplyModal((p) => ({ ...p, loading: false, error: "Не удалось загрузить тренировки" }));
    }
  };
  const closeApplyModal = () => setApplyModal({ open: false, action: null, planned: [], loading: false, error: null });

  const applyReplacementToPlanned = async (pw: PlannedWorkout) => {
    const a = applyModal.action;
    if (!a || a.type !== "replace_exercise") return;
    const fromId = String(a.fromExerciseId || ""), toId = String(a.toExerciseId || "");
    if (!fromId || !toId) return;
    const p: any = pw?.plan || {};
    const exs: any[] = Array.isArray(p?.exercises) ? p.exercises : [];
    let idx = exs.findIndex((ex) => String(ex?.exerciseId || ex?.id || ex?.exercise?.id || "") === fromId);
    if (idx < 0) { const name = String(a.fromName || "").trim().toLowerCase(); if (name) idx = exs.findIndex((ex) => String(ex?.exerciseName || ex?.name || "").toLowerCase().includes(name.slice(0, 8))); }
    if (idx < 0) { setApplyModal((p) => ({ ...p, error: "Не нашёл упражнение для замены" })); return; }
    setApplyModal((p) => ({ ...p, loading: true, error: null }));
    try {
      await replacePlannedWorkoutExercise({ plannedWorkoutId: pw.id, index: idx, newExerciseId: toId, reason: "coach_suggested", source: "coach" });
      closeApplyModal();
      try { window.dispatchEvent(new Event("schedule_updated" as any)); } catch {}
    } catch { setApplyModal((p) => ({ ...p, loading: false, error: "Не удалось применить замену" })); }
    finally { setApplyModal((p) => ({ ...p, loading: false })); }
  };

  const hasText = text.trim().length > 0;
  const showSheet = entered && !closing;

  return createPortal(
    <>
      <style>{`
        .cc-dot{width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,0.35);animation:ccP 1.4s ease-in-out infinite}
        .cc-dot:nth-child(2){animation-delay:.2s}.cc-dot:nth-child(3){animation-delay:.4s}
        @keyframes ccP{0%,80%,100%{opacity:.35;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}
      `}</style>

      {/* ── Backdrop ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(10,16,28,0.52)",
          opacity: showSheet ? 1 : 0,
          transition: `opacity ${showSheet ? ENTER_MS : EXIT_MS}ms ease`,
        }}
        onClick={requestClose}
      />

      {/* ── Sheet ── */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2001,
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,242,247,0.95) 100%)",
          boxShadow: "0 -8px 32px rgba(15,23,42,0.18)",
          height: "75dvh",
          display: "flex", flexDirection: "column",
          transform: animDone ? "none" : (showSheet ? "translateY(0)" : "translateY(100%)"),
          transition: animDone ? "none" : `transform ${showSheet ? ENTER_MS : EXIT_MS}ms ${showSheet ? SPRING_OPEN : SPRING_CLOSE}`,
          willChange: animDone ? "auto" : "transform",
        }}
      >
        {/* Grab handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.18)" }} />
        </div>

        {/* ── Messages ── */}
        <div ref={listRef} style={st.messages}>
          {loading ? (
            <div style={st.loadingWrap}>
              <div style={{ display: "inline-flex", gap: 5 }}>
                <span className="cc-dot" /><span className="cc-dot" /><span className="cc-dot" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div style={st.emptyWrap}>
              <div style={st.emptyTitle}>Спроси что-нибудь или выбери тему</div>
              <div style={st.chips}>
                {suggested.map((q) => (
                  <button key={q} type="button" style={st.chip} onClick={() => void send(q)} disabled={sending}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <div key={m.id} style={{ ...st.row, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ ...st.bubble, ...(m.role === "user" ? st.userBubble : st.aiBubble) }}>
                    <span style={st.bubbleText}>{m.content}</span>
                    {m.role === "assistant" && Array.isArray(m.meta?.actions) &&
                      m.meta.actions.some((a: any) => a?.type === "replace_exercise") ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {m.meta.actions.filter((a: any) => a?.type === "replace_exercise").slice(0, 3).map((a: any, i: number) => (
                          <button key={`a-${m.id}-${i}`} type="button" style={st.actionBtn}
                            onClick={() => void openApplyReplacement(a)}>
                            Применить: {String(a?.fromName || "").trim() || "упр."} → {String(a?.toName || "").trim() || "вариант"}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{ ...st.row, justifyContent: "flex-start" }}>
                  <div style={{ ...st.bubble, ...st.aiBubble, padding: "12px 16px" }}>
                    <div style={{ display: "inline-flex", gap: 5 }}>
                      <span className="cc-dot" /><span className="cc-dot" /><span className="cc-dot" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Error ── */}
        {error && <div style={st.errorBanner}>{error}</div>}

        {/* ── Composer ── */}
        <div style={st.composer}>
          <div style={st.composerRow}>
            <div style={st.inputWrap}>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сообщение"
                rows={1}
                style={st.input}
                disabled={sending}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              />
            </div>
            <button
              style={{ ...st.sendBtn, background: hasText && !sending ? "#007AFF" : "rgba(0,0,0,0.06)" }}
              type="button"
              onClick={() => void send()}
              disabled={sending || !hasText}
              aria-label="Отправить"
            >
              <ArrowUp size={20} strokeWidth={2.8} color={hasText && !sending ? "#fff" : "rgba(0,0,0,0.2)"} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Apply modal ── */}
      {applyModal.open && (
        <div style={st.modalOverlay} onClick={closeApplyModal}>
          <div style={st.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 17, color: "#000" }}>Куда применить замену</div>
              <button type="button" onClick={closeApplyModal} style={st.modalClose}>✕</button>
            </div>
            {applyModal.error && <div style={st.modalError}>{applyModal.error}</div>}
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
                      style={st.modalItem} onClick={() => void applyReplacementToPlanned(pw)}>
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
    </>,
    document.body,
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const st: Record<string, CSSProperties> = {
  // Messages
  messages: {
    flex: 1, minHeight: 0,
    overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
    padding: "4px 14px 8px",
    display: "flex", flexDirection: "column", gap: 3,
    touchAction: "pan-y",
  },
  loadingWrap: { flex: 1, display: "grid", placeItems: "center" },

  // Empty
  emptyWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "0 10px" },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: "rgba(0,0,0,0.5)", textAlign: "center" },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: {
    border: "0.5px solid rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.85)", color: "#007AFF",
    padding: "7px 14px", borderRadius: 18, fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "center",
  },

  // Bubbles
  row: { display: "flex", marginBottom: 1 },
  bubble: { maxWidth: "80%", padding: "8px 12px", whiteSpace: "pre-wrap" } as CSSProperties,
  aiBubble: { background: "#e9e9eb", color: "#000", borderRadius: "18px 18px 18px 4px" },
  userBubble: { background: "#007AFF", color: "#fff", borderRadius: "18px 18px 4px 18px" },
  bubbleText: { fontSize: 16, lineHeight: 1.35, fontWeight: 400, letterSpacing: -0.1 },
  actionBtn: {
    width: "100%", padding: "8px 10px", borderRadius: 12,
    border: "0.5px solid rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.85)",
    fontWeight: 500, fontSize: 13, cursor: "pointer", textAlign: "left", color: "#007AFF",
  } as CSSProperties,

  // Error
  errorBanner: {
    margin: "0 14px 4px", background: "#fff2f2", border: "0.5px solid rgba(255,59,48,0.3)",
    color: "#ff3b30", borderRadius: 12, padding: "6px 12px", fontSize: 13, fontWeight: 500,
  },

  // Composer
  composer: {
    padding: "8px 10px calc(8px + env(safe-area-inset-bottom, 0px))",
    borderTop: "0.5px solid rgba(0,0,0,0.1)",
  },
  composerRow: { display: "flex", alignItems: "flex-end", gap: 6 },
  inputWrap: {
    flex: 1, borderRadius: 20, border: "0.5px solid rgba(0,0,0,0.15)",
    background: "#fff", padding: "6px 12px", display: "flex", alignItems: "center", minHeight: 36,
  },
  input: {
    width: "100%", border: "none", outline: "none", background: "transparent", resize: "none",
    fontSize: 16, lineHeight: 1.3, fontWeight: 400, color: "#000", caretColor: "#007AFF", height: 22, letterSpacing: -0.1,
  } as CSSProperties,
  sendBtn: {
    border: "none", borderRadius: 999, width: 34, height: 34, padding: 0,
    display: "grid", placeItems: "center", flexShrink: 0, cursor: "pointer", transition: "background 150ms ease",
  },

  // Modal
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 10, zIndex: 2100,
  },
  modalCard: { width: "min(720px, 100%)", borderRadius: 14, background: "#fff", padding: 16 },
  modalClose: {
    border: "none", borderRadius: 999, background: "rgba(0,0,0,0.06)",
    width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", fontSize: 15, color: "#8e8e93",
  },
  modalError: {
    marginTop: 8, padding: "8px 12px", borderRadius: 10, background: "#fff2f2", color: "#ff3b30", fontWeight: 500, fontSize: 13,
  },
  modalItem: {
    width: "100%", padding: 12, borderRadius: 10, border: "none", background: "rgba(0,0,0,0.04)", cursor: "pointer", textAlign: "left",
  } as CSSProperties,
};
