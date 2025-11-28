// webapp/src/screens/WorkoutSession.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveSession } from "@/api/plan";

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const SESSION_BG =
  "linear-gradient(135deg, rgba(236,227,255,.45) 0%, rgba(217,194,240,.45) 45%, rgba(255,216,194,.45) 100%)";

type PlanExercise = {
  name: string;
  sets: number;
  reps?: string | number;
  restSec?: number;
  pattern?: string;
  weight?: string | number | null; // ← новое: целевой вес от тренера, если есть
};

type Plan = {
  title: string;
  location: string;
  duration: number;
  exercises: Array<PlanExercise>;
};

type SetEntry = { reps?: number; weight?: number };

type EffortTag = "very_easy" | "comfortable" | "hard" | "too_hard" | null;

type Item = {
  name: string;
  pattern?: string;
  targetMuscles?: string[];
  targetReps?: string | number;
  targetWeight?: string | null; // рекомендация по весу от тренера, строка типа "12 кг" или "20 кг штанга"
  restSec?: number;
  sets: SetEntry[];
  done?: boolean;
  effort?: EffortTag;
};

export default function WorkoutSession() {
  const nav = useNavigate();
  const loc = useLocation();
const plan: Plan | null = useMemo(() => {
  const raw = (loc.state as any)?.plan || JSON.parse(localStorage.getItem("current_plan") || "null");
  const p = raw?.plan || raw; // поддержка структуры { plan: {...} }
  return p;
}, [loc.state]);
  const plannedWorkoutId = useMemo(() => {
    const fromState = (loc.state as any)?.plannedWorkoutId;
    if (typeof fromState === "string" && fromState.trim()) return fromState;
    try {
      const stored = localStorage.getItem("planned_workout_id");
      return stored && stored.trim() ? stored : null;
    } catch {
      return null;
    }
  }, [loc.state]);

  const [items, setItems] = useState<Item[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [pendingNavHome, setPendingNavHome] = useState(false);
  const [sessionRpe, setSessionRpe] = useState(7);
  const [sessionNotes, setSessionNotes] = useState("");
  const [blockedCheck, setBlockedCheck] = useState<number | null>(null);
  const [finishModal, setFinishModal] = useState(false);
  const [finishStart, setFinishStart] = useState<string>("");
  const [finishDuration, setFinishDuration] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const blockTimer = useRef<number | null>(null);
  useEffect(() => {
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    document.body.style.background = SESSION_BG;
    document.documentElement.style.background = SESSION_BG;
    return () => {
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
    };
  }, []);

  useEffect(() => {
    if (plannedWorkoutId) {
      try { localStorage.setItem("planned_workout_id", plannedWorkoutId); } catch {}
    } else {
      try { localStorage.removeItem("planned_workout_id"); } catch {}
    }
  }, [plannedWorkoutId]);

  // init
  useEffect(() => {
    if (!plan) return;
    const draft = JSON.parse(localStorage.getItem("session_draft") || "null");
    if (
      draft?.title === plan.title &&
      (draft?.plannedWorkoutId || null) === (plannedWorkoutId || null)
    ) {
      setItems(draft.items || []);
      setElapsed(draft.elapsed || 0);
      setRunning(draft.running ?? true);
      if (typeof draft.sessionRpe === "number") setSessionRpe(draft.sessionRpe);
      if (typeof draft.sessionNotes === "string") setSessionNotes(draft.sessionNotes);
    } else {
      setItems(
        plan.exercises.map((ex) => ({
          name: ex.name,
          pattern: ex.pattern,
          targetMuscles: (ex as any).targetMuscles || [],
          targetReps: ex.reps,
          targetWeight:
            (ex as any).weight != null
              ? String((ex as any).weight)
              : (ex as any).targetWeight ?? null,
          restSec: ex.restSec,
          done: false,
          effort: null,
          sets: Array.from({ length: Number(ex.sets) || 1 }, () => ({
            reps: undefined,
            weight: undefined,
          })),
        }))
      );
      setElapsed(0);
      setRunning(true);
      setSessionRpe(7);
      setSessionNotes("");
    }
  }, [plan, plannedWorkoutId]);

  // timer
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    return () => {
      if (blockTimer.current) window.clearTimeout(blockTimer.current);
    };
  }, []);

  // autosave
  useEffect(() => {
    if (!plan) return;
    const draftPayload = {
      title: plan.title,
      items,
      elapsed,
      running,
      plannedWorkoutId: plannedWorkoutId || null,
      sessionRpe,
      sessionNotes,
    };
      localStorage.setItem("session_draft", JSON.stringify(draftPayload));
  }, [items, elapsed, running, plan, plannedWorkoutId, sessionRpe, sessionNotes]);

  if (!plan) {
    return (
      <Box>
        <h3>План не найден</h3>
        <button onClick={() => nav("/plan/one")} style={btn.secondary}>Назад</button>
      </Box>
    );
  }

  const exercisesDone = items.filter((it) => it.done).length;
  const exercisesTotal = items.length;
  const progress = exercisesTotal ? Math.round((exercisesDone / exercisesTotal) * 100) : 0;

  const bump = (ei: number, si: number, field: "reps" | "weight", delta: number) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      const cur = Number(next[ei].sets[si][field] ?? 0);
      const val = Math.max(0, cur + delta);
      next[ei].sets[si][field] = Number.isFinite(val) ? val : 0;
      return next;
    });
  };

  const setValue = (ei: number, si: number, field: "reps" | "weight", raw: string) => {
    const num = raw === "" ? undefined : Number(raw);
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].sets[si][field] = Number.isFinite(num) ? num : undefined;
      return next;
    });
  };

  const toggleExerciseDone = (ei: number, requiresWeight: boolean) => {
    const item = items[ei];
    const allFilled = item.sets.every((s) => {
      const hasReps = s.reps != null && s.reps !== undefined;
      const hasWeight = !requiresWeight || (s.weight != null && s.weight !== undefined);
      return hasReps && hasWeight;
    });

    if (!allFilled || !item.effort) {
      if (blockTimer.current) window.clearTimeout(blockTimer.current);
      setBlockedCheck(ei);
      blockTimer.current = window.setTimeout(() => setBlockedCheck(null), 2500);
      return;
    }

    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].done = !next[ei].done;
      return next;
    });
  };

  const effortOptions: Array<{ key: Exclude<EffortTag, null>; label: string; desc: string }> = [
    { key: "very_easy", label: "Очень легко", desc: "RPE ~5–6 · +5–7% веса или +1–2 повтора" },
    { key: "comfortable", label: "Комфортно", desc: "RPE ~7 · оставить или +2.5% веса" },
    { key: "hard", label: "Тяжело", desc: "RPE ~8–9 · оставить или -1 повтор" },
    { key: "too_hard", label: "Слишком тяжело", desc: "RPE ~9.5–10 · -2.5–5% веса" },
  ];
  const setEffort = (ei: number, effort: EffortTag) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].effort = effort;
      return next;
    });
  };

  // классификатор "это чисто вес тела и нет смысла спрашивать кг"
  function isBodyweightLike(nameOrPattern: string) {
    const s = (nameOrPattern || "").toLowerCase().replace(/ё/g, "е");
    return /отжим|push-?up|подтяг|pull-?up|chin-?up|планк|plank|вис|скруч|пресс|hollow|dead\s*bug|bird\s*dog|v-?up|ножниц|пистолет|pistol\s*squat|берпи|бурпи|выпад(?!.*гантел)|присед(?!.*гантел|.*штанг|.*гири)|статик|удержан|изометр/i.test(
      s
    );
  }

  const openFinishModal = () => {
    const defaultDuration = Math.max(20, Math.round(elapsed / 60) || plan.duration || 45);
    const startGuess = new Date(Date.now() - defaultDuration * 60000);
    setFinishDuration(String(defaultDuration));
    setFinishStart(startGuess.toISOString().slice(0, 16));
    setFinishModal(true);
  };

  const handleComplete = async () => {
    if (!finishModal) {
      openFinishModal();
      return;
    }

    let saveOk = false;
    const durationMin = Number(finishDuration) || Math.max(20, Math.round(elapsed / 60) || plan.duration || 45);
    const startedAtIso = finishStart ? new Date(finishStart).toISOString() : undefined;

    const payload = {
      title: plan.title,
      location: plan.location,
      durationMin,
      exercises: items.map((it) => ({
        name: it.name,
        pattern: it.pattern,
        targetMuscles: it.targetMuscles,
        restSec: it.restSec,
        reps: it.targetReps,
        done: !!it.done,
        effort: it.effort ?? undefined,
        sets: it.sets
          .filter((s) => s.reps != null || s.weight != null)
          .map((s) => ({ reps: s.reps, weight: s.weight })),
      })),
      feedback: {
        sessionRpe,
        sessionNotes: sessionNotes.trim() || undefined,
      },
    };

    // локальная история
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      const record = {
        id: (crypto as any)?.randomUUID?.() || String(Date.now()),
        finishedAt: new Date().toISOString(),
        ...payload,
      };
      history.unshift(record);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
    } catch {}

    // сервер
    try {
      setSaving(true);
      console.log("== WILL SAVE payload ==", payload, { plannedWorkoutId });
      const extra = plannedWorkoutId ? { plannedWorkoutId } : {};
      await saveSession(payload, {
        ...extra,
        startedAt: startedAtIso,
        durationMin,
      });
      saveOk = true;
    } catch {
      // не блокируем UX если сеть/сервер упали
    } finally {
      setSaving(false);
      setFinishModal(false);
      localStorage.removeItem("current_plan");
      localStorage.removeItem("session_draft");
      localStorage.removeItem("planned_workout_id");
      localStorage.removeItem(PLAN_CACHE_KEY);
      try {
        window.dispatchEvent(new CustomEvent("plan_completed"));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch {}
      if (saveOk) {
        setPendingNavHome(true);
        setShowConfetti(true);
      } else {
        nav("/");
      }
    }
  };

  return (
    <div style={page.outer}>
      <div style={page.inner}>
      <SoftGlowStyles />
      <style>{noSpinnersCSS + lavaCSS + responsiveCSS + lockCSS + confettiCSS + sliderCss}</style>

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroContent}>
          <div style={s.heroHeader}>
            <button style={btn.back} onClick={() => nav("/plan/one")} aria-label="Назад к генерации">←</button>
            <span style={s.pill}>Тренировка</span>
            <span style={{ width: 34 }} />
          </div>

          <div style={s.heroDate}>
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={s.heroTitle}>{plan.title}</div>
          <div style={s.heroSubtitle}>Держи темп. Заполняй подходы по мере выполнения.</div>

          {/* прогресс «лава» */}
          <div style={s.heroCtas}>
            <div style={progressBar.wrap}>
              <div style={progressBar.track} className="lava-track">
                <div style={{ ...progressBar.fill, width: `${progress}%` }} className="lava-fill" />
                <div style={{ ...progressBar.flame, left: `calc(${progress}% - 14px)` }} className="flame-dot">
                  <span className="flame-emoji">🔥</span>
                </div>
              </div>
              <div style={progressBar.meta}>
                <span />
                <span>{progress}%</span>
              </div>
            </div>

            <button
              className="soft-glow"
              style={{
                ...s.primaryBtn,
                opacity: exercisesDone === exercisesTotal ? 1 : 0.5,
                pointerEvents: exercisesDone === exercisesTotal ? "auto" : "none",
              }}
              onClick={handleComplete}
              disabled={exercisesDone !== exercisesTotal}
            >
              {finishModal ? "Подтвердить" : "Сохранить тренировку"}
            </button>
          {exercisesDone !== exercisesTotal && (
            <div style={s.completeHint}>Отметь все упражнения выполненными, чтобы сохранить тренировку</div>
          )}
        </div>
        </div>
      </section>

      {/* Упражнения */}
      <main style={{ display: "grid", gap: 12 }}>
        {items.map((it, ei) => {
          const isBodyweight = isBodyweightLike(it.name + " " + (it.pattern || ""));
          const hasExplicitWeight =
            typeof it.targetWeight === "number" ||
            (typeof it.targetWeight === "string" && /\d/.test(it.targetWeight));
          const showWeightInput = !isBodyweight || hasExplicitWeight;
          return (
            <section key={ei} style={card.wrap} className={it.done ? "locked" : ""}>
              <button
                type="button"
                onClick={() => toggleExerciseDone(ei, showWeightInput)}
                className="check-toggle"
                style={{ ...checkBtn.base, ...(it.done ? checkBtn.active : {}) }}
                aria-label={it.done ? "Отменить отметку" : "Отметить выполнено"}
              >
                ✓
              </button>
              {blockedCheck === ei && (
                <div style={checkBtn.hint}>Заполни повторы, вес и отметь легко или тяжело</div>
              )}
              <div style={card.head}>
                <div>
                  <div style={card.title}>{it.name}</div>
                  <div style={card.metaChips}>
                    <Chip label={`${it.sets.length}×`} />
                    <Chip label={`повт. ${it.targetReps ?? "—"}`} />
                    {it.targetWeight ? <Chip label={String(it.targetWeight)} /> : null}
                    {it.restSec ? <Chip label={`отдых ${it.restSec}с`} /> : null}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }} aria-disabled={it.done}>
                {it.sets.map((s, si) => (
                  <div key={si} style={setrow.wrap} className="set-row">
                    <div style={setrow.label} className="set-label">Сет {si + 1}</div>

                    <div style={setrow.inputs} className="sets-grid">
                      <NumInput
                        value={s.reps}
                        placeholder={String(it.targetReps ?? "повт./сек")}
                        onChange={(v) => setValue(ei, si, "reps", v)}
                        onBump={(d) => bump(ei, si, "reps", d)}
                        disabled={it.done}
                      />
                      {showWeightInput ? (
                        <NumInput
                          value={s.weight}
                          placeholder="кг"
                          onChange={(v) => setValue(ei, si, "weight", v)}
                          onBump={(d) => bump(ei, si, "weight", d)}
                          disabled={it.done}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  style={btn.ghost}
                  disabled={it.done}
                  onClick={() =>
                    setItems((prev) => {
                      const next = structuredClone(prev);
                      next[ei].sets.push({ reps: undefined, weight: undefined });
                      return next;
                    })
                  }
                >
                  ➕ Добавить сет
                </button>
                <button
                  type="button"
                  style={btn.ghost}
                  disabled={it.done}
                  onClick={() =>
                    setItems((prev) => {
                      const next = structuredClone(prev);
                      next[ei].sets.pop();
                      return next;
                    })
                  }
                >
                  ➖ Удалить сет
                </button>
              </div>

              <div style={effortRow.wrap}>
                <span style={effortRow.label}>Ощущение от упражнения</span>
                <div style={effortRow.sliderWrap}>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={
                      Math.max(
                        0,
                        effortOptions.findIndex((opt) => opt.key === it.effort) === -1
                          ? 1
                          : effortOptions.findIndex((opt) => opt.key === it.effort)
                      )
                    }
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                  const opt = effortOptions[idx] || effortOptions[1];
                  setEffort(ei, opt.key);
                }}
                style={effortRow.slider}
                className="effort-slider"
              />
                  <div style={effortRow.ticks}>
                    {effortOptions.map((opt, idx) => (
                      <span key={opt.key} style={effortRow.tickLabel}>
                        {opt.label}
                      </span>
                    ))}
                  </div>
                  <div style={effortRow.hint}>
                    {effortOptions.find((opt) => opt.key === it.effort)?.desc || effortOptions[1].desc}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </main>

      {finishModal && (
        <div style={modal.wrap}>
          <div style={modal.card}>
            <div style={modal.header}>
              <div style={modal.title}>Фиксация тренировки</div>
              <button style={modal.close} onClick={() => setFinishModal(false)}>✕</button>
            </div>
            <div style={modal.body}>
              <label style={modal.label}>
                <span style={modal.labelText}>Время начала</span>
                <input
                  type="datetime-local"
                  style={modal.input}
                  value={finishStart}
                  onChange={(e) => setFinishStart(e.target.value)}
                />
              </label>
              <label style={modal.label}>
                <span style={modal.labelText}>Длительность (мин)</span>
                <input
                  type="number"
                  min={10}
                  step={5}
                  style={modal.input}
                  value={finishDuration}
                  onChange={(e) => setFinishDuration(e.target.value)}
                />
              </label>
            </div>
            <div style={modal.footer}>
              <button style={modal.secondary} onClick={() => setFinishModal(false)} disabled={saving}>Отмена</button>
              <button style={modal.primary} onClick={handleComplete} disabled={saving}>
                {saving ? "Сохраняю..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section style={s.feedbackCard}>
        <div style={s.feedbackHeader}>Как прошло занятие?</div>
        <div style={s.feedbackInner}>
         <label htmlFor="session-rpe" style={s.feedbackLabel}>
           Субъективная нагрузка: {sessionRpe}/10
         </label>
         <input
           id="session-rpe"
           type="range"
           min={4}
           max={10}
           step={1}
           value={sessionRpe}
           onChange={(e) => setSessionRpe(Number(e.target.value))}
            style={s.feedbackSlider}
            className="effort-slider"
          />
          <textarea
            style={s.feedbackNotes}
            rows={3}
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Заметки о самочувствии, сне, болях..."
          />
        </div>
      </section>

      {/* конфетти */}
      {showConfetti && (
        <Confetti
          onClose={() => {
            setShowConfetti(false);
            if (pendingNavHome) nav("/");
          }}
        />
      )}
      </div>
    </div>
  );
}

/* ---------- Мелкие компоненты ---------- */
function NumInput({
  value,
  placeholder,
  onChange,
  onBump,
  disabled,
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  onBump: (d: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={num.wrap}>
      <button type="button" style={num.btn} onClick={() => onBump(-1)} aria-label="-1" disabled={disabled}>−</button>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={num.input}
        disabled={disabled}
      />
      <button type="button" style={num.btn} onClick={() => onBump(+1)} aria-label="+1" disabled={disabled}>+</button>
    </div>
  );
}

function Confetti({ onClose }: { onClose: () => void }) {
  return (
    <div className="confetti-wrap">
      <div className="confetti-overlay" />
      <div className="confetti-text">
        <div className="confetti-card">
          <div className="confetti-icon">✅</div>
          <div className="confetti-title">Тренировка сохранена</div>
          <div className="confetti-subtitle">Повторы и веса записаны в прогресс</div>
          <button className="confetti-btn" onClick={onClose}>Продолжить</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return <span style={chipStyle}>{label}</span>;
}

/* ---------- Стиль ---------- */
const page = {
  outer: {
    minHeight: "100vh",
    width: "100%",
    padding: "16px",
    background: "transparent",
  } as React.CSSProperties,
  inner: {
    maxWidth: 760,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
  } as React.CSSProperties,
};

const s: Record<string, React.CSSProperties> = {
  heroCard: {
    position: "relative",
    padding: 22,
    borderRadius: 28,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
    marginBottom: 18,
    minHeight: 280,
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    display: "grid",
    gap: 10,
  },
  heroHeader: { display: "grid", gridTemplateColumns: "34px 1fr 34px", alignItems: "center" },
  pill: {
    justifySelf: "center",
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
    textTransform: "capitalize",
  },
  heroDate: { opacity: 0.85, fontSize: 13 },
  heroTitle: { fontSize: 26, fontWeight: 800, lineHeight: 1.2 },
  heroSubtitle: { opacity: 0.9, marginTop: -2 },
  heroCtas: {
    marginTop: 16,
    display: "grid",
    gap: 12,
    width: "100%",
  },
  primaryBtn: {
    border: "none",
    borderRadius: 16,
    padding: "16px 20px",
    fontSize: 16,
    fontWeight: 800,
    color: "#000",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    cursor: "pointer",
  },
  completeHint: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,.9)",
    textAlign: "center",
  },
  feedbackCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    background: "rgba(255,255,255,0.65)",
    boxShadow: "0 12px 30px rgba(0,0,0,.08)",
    border: "1px solid rgba(255,255,255,.4)",
    backdropFilter: "blur(12px)",
  },
  feedbackHeader: { fontWeight: 800, fontSize: 15, marginBottom: 8 },
  feedbackInner: { display: "grid", gap: 6 },
  feedbackLabel: { fontSize: 13, fontWeight: 600, color: "#374151" },
  feedbackSlider: {
    width: "100%",
    height: 42,
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "12px 0",
    touchAction: "none",
  },
  feedbackNotes: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    padding: 10,
    fontFamily: "inherit",
    fontSize: 16,
    resize: "none",
  } as React.CSSProperties,
};

const modal: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    zIndex: 999,
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 12px 28px rgba(0,0,0,0.2)",
    padding: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: 700 },
  close: {
    border: "none",
    background: "transparent",
    fontSize: 18,
    cursor: "pointer",
  },
  body: { display: "grid", gap: 12 },
  label: { display: "grid", gap: 4 },
  labelText: { fontSize: 13, color: "#555" },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontSize: 15,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  secondary: {
    border: "1px solid #ddd",
    background: "#f5f5f5",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
  },
  primary: {
    border: "none",
    background: "#000",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
  },
};

const progressBar = {
  wrap: { display: "grid", gap: 6 } as React.CSSProperties,
  track: {
    position: "relative",
    width: "100%",
    height: 20,
    borderRadius: 999,
    background: "rgba(255,255,255,.15)",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.2)",
  } as React.CSSProperties,
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width .25s ease", zIndex: 1 } as React.CSSProperties,
  flame: { position: "absolute", top: -6, fontSize: 22, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.25))", zIndex: 2, pointerEvents: "none" } as React.CSSProperties,
  meta: { display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.9 } as React.CSSProperties,
};

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
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.15) saturate(1.1); transform: scale(1.01) } }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
    `}</style>
  );
}

// number без стрелок
const noSpinnersCSS = `
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; appearance: textfield; }
`;

// «лава» прогресс
const lavaCSS = `
.lava-track { position: relative; overflow: hidden; }
.lava-fill{
  height:100%;
  border-radius:999px;
  background:
    radial-gradient(circle at 20% 50%, rgba(255,255,255,.95), rgba(255,255,255,0) 55%),
    linear-gradient(90deg, #fff, #ffe680, #ffb36b, #ff8a6b, #ff6b6b),
    radial-gradient(circle at 50% 50%, rgba(255,120,0,.35), rgba(255,0,0,0) 60%);
  background-size: 18% 140%, 300% 100%, 40% 140%;
  background-repeat: no-repeat, no-repeat, no-repeat;
  animation:
    lavaPulse 1.3s ease-in-out infinite alternate,
    lavaFlow 8s linear infinite,
    lavaSpecks 2.2s ease-in-out infinite alternate;
  filter: saturate(1.15) contrast(1.05);
}
.lava-track::after{
  content:"";
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 10% 40%, rgba(255,255,255,.18) 0 2px, transparent 3px),
    radial-gradient(circle at 40% 60%, rgba(255,255,255,.12) 0 2px, transparent 3px),
    radial-gradient(circle at 75% 30%, rgba(255,255,255,.10) 0 2px, transparent 3px);
  background-size: 140px 40px, 180px 50px, 220px 60px;
  mix-blend-mode: screen;
  animation: sparks 3.6s linear infinite;
  pointer-events:none;
}
.flame-dot .flame-emoji{
  display:inline-block;
  animation: flameBob 1.1s ease-in-out infinite, flameGlow 1s ease-in-out infinite alternate;
}
@keyframes lavaFlow   { 0%{background-position: 0 0, 0 0, 0 0} 100%{background-position: 0 0, -300% 0, 100% 0} }
@keyframes lavaPulse  { 0%{filter: brightness(1)} 100%{filter: brightness(1.25)} }
@keyframes lavaSpecks { 0%{background-position: 0 0, 0 0, 0 0} 100%{background-position: 10% 0, 0 0, -8% 0} }
@keyframes sparks     { 0%{background-position: 0 0,0 0,0 0} 100%{background-position: 200% 0, 160% 0, 120% 0} }
@keyframes flameBob   { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-2px) } }
@keyframes flameGlow  { 0%{ text-shadow:0 0 2px rgba(255,140,0,.35) } 100%{ text-shadow:0 0 10px rgba(255,140,0,.9) } }
`;

// блокировка карточки упражнения
const lockCSS = `
.locked{
  opacity:.6;
  filter: grayscale(.15);
}
.locked [aria-disabled="true"],
.locked button,
.locked input{ pointer-events:none; }
.locked .chk,
.locked .check-toggle { pointer-events:auto; z-index:1; }
`;

// конфетти
const confettiCSS = `
.confetti-wrap{
  position: fixed;
  inset: 0;
  z-index: 2000;
  pointer-events: auto;
  background: rgba(6,11,25,.75);
  backdrop-filter: blur(14px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 20px;
}
.confetti-overlay{ display:none; }
.confetti-text{ width: 100%; max-width: 320px; }
.confetti-card{
  pointer-events:auto;
  width: 100%;
  border-radius: 22px;
  background: linear-gradient(160deg, rgba(255,255,255,.98), rgba(240,244,255,.95));
  box-shadow: 0 20px 50px rgba(0,0,0,.35);
  padding: 20px;
  display: grid;
  gap: 10px;
  text-align: center;
}
.confetti-icon{ font-size: 30px; }
.confetti-title{ font-size: 18px; font-weight: 700; color: #111; }
.confetti-subtitle{ font-size: 13px; color: #4b5563; }
.confetti-btn{
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg,#6a8dff,#8a64ff);
  color: #fff;
  cursor: pointer;
}
`;

// адаптив
const responsiveCSS = `
@media (max-width: 620px){
  .set-row{ grid-template-columns: 1fr; }
  .set-row .set-label{ margin-bottom: 4px; }
}

@media (max-width: 420px){
  .sets-grid{ grid-template-columns: 1fr !important; }
}
`;

function Box({ children }: { children: ReactNode }) {
  return (
    <div style={page.outer}>
      <div style={page.inner}>{children}</div>
    </div>
  );
}

const card = {
  wrap: {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    padding: 14,
    borderRadius: 20,
    background: "rgba(255,255,255,0.65)",
    boxShadow: "0 16px 30px rgba(0,0,0,.12)",
    border: "1px solid rgba(255,255,255,.4)",
    backdropFilter: "blur(12px)",
  } as React.CSSProperties,
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 } as React.CSSProperties,
  title: { fontSize: 15.5, fontWeight: 750, color: "#111", paddingRight: 36 } as React.CSSProperties,
  metaChips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 } as React.CSSProperties,
};

const setrow = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0,1fr)",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 8px 20px rgba(0,0,0,.08)",
    backdropFilter: "blur(12px)",
  } as React.CSSProperties,
  label: { fontSize: 13, color: "#4b5563", fontWeight: 600 } as React.CSSProperties,
  inputs: {
    display: "grid",
    width: "100%",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 14,
    alignItems: "center",
  } as React.CSSProperties,
};

const btn = {
  back: {
    width: 34,
    height: 34,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
  } as React.CSSProperties,
  ghost: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(8px)",
    cursor: "pointer",
    fontWeight: 600,
  } as React.CSSProperties,
  secondary: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  primary: {
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "16px 20px",
    fontSize: 16,
    fontWeight: 800,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 10px 26px rgba(0,0,0,.25)",
    cursor: "pointer",
  } as React.CSSProperties,
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(0,0,0,.08)",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    backdropFilter: "blur(6px)",
  } as React.CSSProperties,
  badgeActive: {
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    borderColor: "transparent",
    color: "#1b1b1b",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  } as React.CSSProperties,
};

const num = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0,1fr) 40px",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  } as React.CSSProperties,
  btn: {
    height: 38,
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    background: "rgba(255,255,255,0.75)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
  } as React.CSSProperties,
  input: {
    height: 44,
    width: "100%",
    padding: "0 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    fontSize: 16,
    boxSizing: "border-box",
    textAlign: "center",
    minWidth: 0,
    background: "rgba(255,255,255,0.85)",
  } as React.CSSProperties,
};

const metaRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  rowGap: 4,
  alignItems: "center",
  fontSize: 12.5,
  color: "#1f2933",
  marginBottom: 6,
};
const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(255,255,255,0.8)",
  color: "#1f2933",
  border: "1px solid rgba(0,0,0,.06)",
  backdropFilter: "blur(6px)",
};

const checkBtn = {
  base: {
    position: "absolute" as const,
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "2px solid rgba(148,163,184,.5)",
    background: "rgba(255,255,255,.85)",
    color: "#6b7280",
    display: "grid",
    placeItems: "center",
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
  },
  active: {
    borderColor: "transparent",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#1b1b1b",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  hint: {
    position: "absolute" as const,
    top: 44,
    right: 0,
    background: "rgba(255,255,255,0.9)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 11,
    color: "#b45309",
    boxShadow: "0 12px 24px rgba(0,0,0,.15)",
    border: "1px solid rgba(248,171,101,.4)",
    maxWidth: 180,
    zIndex: 5,
  },
};

const effortRow = {
  wrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid rgba(0,0,0,.08)",
    display: "grid",
    gap: 6,
  } as React.CSSProperties,
  label: { fontSize: 12.5, color: "#374151", fontWeight: 600 } as React.CSSProperties,
  sliderWrap: { display: "grid", gap: 6 },
  slider: {
    width: "100%",
    height: 38,
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "12px 0",
    touchAction: "none",
  } as React.CSSProperties,
  ticks: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
  } as React.CSSProperties,
  tickLabel: { whiteSpace: "nowrap" } as React.CSSProperties,
  hint: {
    fontSize: 11.5,
    color: "#4b5563",
    background: "rgba(0,0,0,0.03)",
    borderRadius: 10,
    padding: "8px 10px",
    border: "1px solid rgba(0,0,0,0.05)",
  } as React.CSSProperties,
};

function ruPlural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
const sliderCss = `
.effort-slider::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.effort-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 2px 8px rgba(0,0,0,0.16);
  margin-top: -9px;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.effort-slider::-moz-range-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.effort-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 2px 8px rgba(0,0,0,0.16);
  transition: transform 80ms ease, box-shadow 80ms ease;
}
`;
