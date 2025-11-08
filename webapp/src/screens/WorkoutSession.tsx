// webapp/src/screens/WorkoutSession.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { saveSession } from "@/api/plan";

const PLAN_CACHE_KEY = "plan_cache_v1";
const HISTORY_KEY = "history_sessions_v1";

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

type EffortTag = "easy" | "hard" | null;

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
  const [sessionRpe, setSessionRpe] = useState(7);
  const [sessionNotes, setSessionNotes] = useState("");

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

  // конфетти при завершении всех упражнений
  useEffect(() => {
    if (exercisesTotal > 0 && exercisesDone === exercisesTotal) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 2600);
      return () => clearTimeout(t);
    }
  }, [exercisesDone, exercisesTotal]);

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

  const toggleExerciseDone = (ei: number) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].done = !next[ei].done;
      return next;
    });
  };

  const setEffort = (ei: number, effort: EffortTag) => {
    setItems((prev) => {
      const next = structuredClone(prev);
      next[ei].effort = next[ei].effort === effort ? null : effort;
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

  const handleComplete = async () => {
    const payload = {
      title: plan.title,
      location: plan.location,
      durationMin: Math.round(elapsed / 60) || plan.duration,
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
      console.log("== WILL SAVE payload ==", payload, { plannedWorkoutId });
      await saveSession(payload, plannedWorkoutId ? { plannedWorkoutId } : undefined);
    } catch {
      // не блокируем UX если сеть/сервер упали
    } finally {
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
      nav("/");
    }
  };

  return (
    <div style={page.wrap}>
      <SoftGlowStyles />
      <style>{noSpinnersCSS + checkboxCSS + lavaCSS + responsiveCSS + lockCSS + confettiCSS}</style>

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <button style={btn.back} onClick={() => nav("/plan/one")} aria-label="Назад к генерации">←</button>
          <span style={s.pill}>Тренировка</span>
          <span style={{ width: 34 }} />
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>
          {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div style={s.heroTitle}>{plan.title}</div>
        <div style={s.heroSubtitle}>Держи темп. Заполняй подходы по мере выполнения.</div>

        {/* прогресс «лава» */}
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
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

          <button className="soft-glow" style={s.primaryBtn} onClick={handleComplete}>
            Выполнил
          </button>
        </div>
      </section>

      {/* Упражнения */}
      <main style={{ display: "grid", gap: 12 }}>
        {items.map((it, ei) => {
          const showWeightInput = it.targetWeight != null || !isBodyweightLike(it.name + " " + (it.pattern || ""));
          return (
            <section key={ei} style={card.wrap} className={it.done ? "locked" : ""}>
              {/* чекбокс */}
              <input
                type="checkbox"
                checked={!!it.done}
                onChange={() => toggleExerciseDone(ei)}
                className="chk"
                title={it.done ? "Сделано" : "Отметить как сделано"}
                style={chkPos}
              />

              <div style={card.head}>
                <div style={card.title}>{it.name}</div>
              </div>

              <div style={metaRow}>
                <span>{`${it.sets.length} сет${ruPlural(it.sets.length, ["", "а", "ов"])}`}</span>
                <span>·</span>
                <span>{`по ${it.targetReps ?? "—"} повторений`}</span>

                {it.targetWeight ? (
                  <>
                    <span>·</span>
                    <span>{`${it.targetWeight}`}</span>
                  </>
                ) : null}

                {it.restSec ? (
                  <>
                    <span>·</span>
                    <span>{`${it.restSec} сек отдых`}</span>
                  </>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 8 }} aria-disabled={it.done}>
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
                <span style={effortRow.label}>Как зашло упражнение?</span>
                <div style={effortRow.buttons}>
                  <button
                    type="button"
                    style={{
                      ...btn.badge,
                      ...(it.effort === "easy" ? btn.badgeActive : {}),
                    }}
                    onClick={() => setEffort(ei, "easy")}
                  >
                    Легко
                  </button>
                  <button
                    type="button"
                    style={{
                      ...btn.badge,
                      ...(it.effort === "hard" ? btn.badgeActive : {}),
                    }}
                    onClick={() => setEffort(ei, "hard")}
                  >
                    Тяжело
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </main>

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
      {showConfetti && <Confetti />}
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

function Confetti() {
  const pieces = Array.from({ length: 80 });
  return (
    <div className="confetti-wrap">
      {pieces.map((_, i) => (
        <div key={i} className="confetti" style={{ ["--i" as any]: i }} />
      ))}
      <div className="confetti-text">Готово!</div>
    </div>
  );
}

/* ---------- Стиль ---------- */
const page = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "16px", fontFamily: "system-ui, -apple-system, Inter, Roboto" } as React.CSSProperties,
};

const s: Record<string, React.CSSProperties> = {
  heroCard: {
    position: "relative",
    padding: 16,
    borderRadius: 20,
    boxShadow: "0 8px 24px rgba(0,0,0,.08)",
    background: "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    overflow: "hidden",
    marginBottom: 16,
  },
  heroHeader: { display: "grid", gridTemplateColumns: "34px 1fr 34px", alignItems: "center" },
  pill: { justifySelf: "center", background: "rgba(255,255,255,.2)", padding: "6px 10px", borderRadius: 999, fontSize: 12, backdropFilter: "blur(6px)" },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  heroSubtitle: { opacity: 0.92, marginTop: 2 },
  primaryBtn: {
    border: "none",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 800,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
    cursor: "pointer",
  },
  feedbackCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 8px 24px rgba(0,0,0,.08)",
    border: "1px solid rgba(0,0,0,.04)",
  },
  feedbackHeader: { fontWeight: 800, fontSize: 15, marginBottom: 8 },
  feedbackInner: { display: "grid", gap: 10 },
  feedbackLabel: { fontSize: 13, fontWeight: 600, color: "#374151" },
  feedbackSlider: { width: "100%" },
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

const progressBar = {
  wrap: { display: "grid", gap: 6 } as React.CSSProperties,
  track: { position: "relative", width: "100%", height: 18, borderRadius: 999, background: "rgba(255,255,255,.25)", overflow: "hidden" } as React.CSSProperties,
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width .25s ease" } as React.CSSProperties,
  flame: { position: "absolute", top: -6, fontSize: 22, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.25))" } as React.CSSProperties,
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

// круглый чекбокс
const checkboxCSS = `
.chk {
  appearance: none;
  -webkit-appearance: none;
  width: 28px; height: 28px;
  border-radius: 9999px;
  border: 2px solid rgba(0,0,0,.2);
  background: #fff;
  display: grid; place-items: center;
  cursor: pointer; position: absolute;
}
.chk::after { content: "✓"; font-size: 16px; color: #9ca3af; opacity:.9; }
.chk:checked { border-color: transparent; background: linear-gradient(135deg, rgba(114,135,255,1), rgba(164,94,255,1)); box-shadow: 0 4px 14px rgba(0,0,0,.15); }
.chk:checked::after { color: #fff; }
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
.locked .chk { pointer-events:auto; z-index:1; }
`;

// конфетти
const confettiCSS = `
.confetti-wrap{
  position: fixed; inset: 0; pointer-events: none;
  overflow: hidden; z-index: 1000;
}
.confetti{
  position: absolute; top: -10vh;
  left: calc((var(--i) * 7%) % 100%);
  width: 10px; height: 14px; opacity:.9;
  background: hsl(calc(var(--i)*9), 90%, 60%);
  animation: confFall 2.4s ease-in forwards, confSpin 1.2s linear infinite;
  border-radius: 2px;
}
.confetti::after{
  content:"";
  position:absolute; inset:0;
  background: linear-gradient(transparent,rgba(255,255,255,.5));
  mix-blend-mode: screen;
}
.confetti-text{
  position: fixed; inset: 0; display:grid; place-items:center;
  font-weight: 900; font-size: 28px; color: #fff;
  text-shadow: 0 6px 24px rgba(0,0,0,.35);
  animation: textPop .6s ease-out;
}
@keyframes confFall{ to { top: 110vh; } }
@keyframes confSpin{ to { transform: rotate(720deg) } }
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

function Box(p: any) {
  return <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }} {...p} />;
}

const card = {
  wrap: {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 8px 24px rgba(0,0,0,.06)",
    border: "1px solid rgba(0,0,0,.04)",
  } as React.CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 } as React.CSSProperties,
  title: { fontSize: 15, fontWeight: 750, color: "#111" } as React.CSSProperties,
};

const setrow = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0,1fr)",
    alignItems: "flex-start",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 12,
    background: "#f7f9fc",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
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
  back: { width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,.22)", color: "#fff", fontSize: 18, cursor: "pointer" } as React.CSSProperties,
  ghost: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 10px", background: "#fff", cursor: "pointer" } as React.CSSProperties,
  secondary: { border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px", background: "#fff", cursor: "pointer", fontWeight: 700 } as React.CSSProperties,
  primary: {
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 800,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
    cursor: "pointer",
  } as React.CSSProperties,
  badge: {
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: "#fff",
    cursor: "pointer",
  } as React.CSSProperties,
  badgeActive: {
    background: "linear-gradient(135deg,#dbeafe,#bfdbfe)",
    borderColor: "#93c5fd",
    color: "#1d4ed8",
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
    height: 36,
    width: "100%",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
  } as React.CSSProperties,
  input: {
    height: 40,
    width: "100%",
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 16,
    boxSizing: "border-box",
    textAlign: "center",
    minWidth: 0,
  } as React.CSSProperties,
};

const metaRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  rowGap: 4,
  alignItems: "center",
  fontSize: 12.5,
  color: "#333",
  marginBottom: 6,
};
const chkPos: React.CSSProperties = { top: 10, right: 10 };

const effortRow = {
  wrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid rgba(0,0,0,.05)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  } as React.CSSProperties,
  label: { fontSize: 12.5, color: "#4b5563", fontWeight: 600 } as React.CSSProperties,
  buttons: { display: "flex", gap: 8 } as React.CSSProperties,
};

function ruPlural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
