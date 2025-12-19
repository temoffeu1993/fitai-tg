// webapp/src/screens/WorkoutSession.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getProgressionJob, saveSession } from "@/api/plan";

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const SESSION_BG =
  "linear-gradient(135deg, rgba(236,227,255,.45) 0%, rgba(217,194,240,.45) 45%, rgba(255,216,194,.45) 100%)";

type PlanExercise = {
  exerciseId?: string;
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

type EffortTag = "easy" | "working" | "quite_hard" | "hard" | "max" | null;

type Item = {
  id?: string;
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
    try {
      const fromState = (loc.state as any)?.plan || null;
      if (fromState) return (fromState as any).plan || fromState;
      const rawCurrent = JSON.parse(localStorage.getItem("current_plan") || "null");
      if (rawCurrent?.plan || rawCurrent?.exercises) return rawCurrent.plan || rawCurrent;
      const rawCache = JSON.parse(localStorage.getItem("plan_cache_v2") || "null");
      if (rawCache?.plan || rawCache?.plan?.exercises) return rawCache.plan || rawCache;
    } catch {}
    return null;
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

  // Извлекаем notes/warnings из navigation state
  const adaptationNotes = useMemo(() => {
    const fromState = (loc.state as any)?.notes;
    return Array.isArray(fromState) ? fromState : [];
  }, [loc.state]);

  const [items, setItems] = useState<Item[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [pendingNavHome, setPendingNavHome] = useState(false);
  const [serverProgression, setServerProgression] = useState<any | null>(null);
  const [progressionJob, setProgressionJob] = useState<{ id: string; status: string; lastError?: string | null } | null>(
    null
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const effortOptions: Array<{ key: Exclude<EffortTag, null>; label: string; desc: string; icon: string }> = useMemo(
    () => [
      {
        key: "easy",
        label: "Легко",
        desc: "Мышцы включились, но не уставали. В следующий раз можно немного увеличить вес или повторы.",
        icon: "🟢",
      },
      {
        key: "working",
        label: "Рабочий",
        desc: "Хороший темп, чувствуешь работу, но спокойно контролируешь движение. Оставляем как есть.",
        icon: "🟡",
      },
      {
        key: "quite_hard",
        label: "Тяжеловато",
        desc: "Мышцы хорошо горят, последние повторы требуют усилия. Можно чуть снизить темп или повторы.",
        icon: "🟠",
      },
      {
        key: "hard",
        label: "Тяжело",
        desc: "Почти максимум, очень сложно закончить подход. В следующей сессии снизь повторы на 1–2 или вес.",
        icon: "🔴",
      },
      {
        key: "max",
        label: "Предел",
        desc: "Максимально тяжело, сил нет после подхода. Следующий раз — уменьшить вес/повторы.",
        icon: "⛔",
      },
    ],
    []
  );

  const sessionRpeOptions = useMemo(
    () => [
      { value: 6, label: "Легко", desc: "Тренировка почти не утомила, мог сделать гораздо больше.", icon: "🟢" },
      { value: 7, label: "Рабочая", desc: "Хорошая тренировка, есть ощущение нагрузки, но без надрыва.", icon: "🟡" },
      { value: 8, label: "Тяжеловато", desc: "Местами пришлось напрягаться; сил в конце стало заметно меньше.", icon: "🟠" },
      { value: 9, label: "Тяжело", desc: "Вся тренировка была напряжённой, к концу чувствуется сильная усталость.", icon: "🔴" },
      { value: 10, label: "Предел", desc: "Очень изматывающая тренировка, почти на максимум возможностей.", icon: "⛔" },
    ],
    []
  );
  const [sessionRpeIndex, setSessionRpeIndex] = useState(1);
  const [sessionRpe, setSessionRpe] = useState(sessionRpeOptions[1].value);
  const effortTicks = useMemo(
    () =>
      effortOptions.map((_, i) =>
        effortOptions.length > 1 ? (i / (effortOptions.length - 1)) * 100 : 0
      ),
    [effortOptions]
  );
  const sessionTicks = useMemo(
    () =>
      sessionRpeOptions.map((_, i) =>
        sessionRpeOptions.length > 1 ? (i / (sessionRpeOptions.length - 1)) * 100 : 0
      ),
    [sessionRpeOptions]
  );
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
    if (!Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      setItems([]);
      setElapsed(0);
      setRunning(true);
      setSessionRpeIndex(1);
      setSessionRpe(sessionRpeOptions[1].value);
      return;
    }
    const draft = JSON.parse(localStorage.getItem("session_draft") || "null");
    const draftMatches =
      draft?.title === plan.title && (draft?.plannedWorkoutId || null) === (plannedWorkoutId || null);
    const hasDraftItems = Array.isArray(draft?.items) && draft.items.length > 0;

    if (draftMatches && hasDraftItems) {
      setItems(draft.items || []);
      setElapsed(draft.elapsed || 0);
      setRunning(draft.running ?? true);
      if (typeof draft.sessionRpe === "number") {
        const idx = sessionRpeOptions.findIndex((o) => Math.abs(o.value - draft.sessionRpe) < 0.25);
        const safeIdx = idx >= 0 ? idx : 1;
        setSessionRpeIndex(safeIdx);
        setSessionRpe(sessionRpeOptions[safeIdx].value);
      }
      return;
    }

    setItems(
      plan.exercises.map((ex) => ({
        id: (ex as any).exerciseId || (ex as any).id || (ex as any).exercise?.id,
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
    setSessionRpeIndex(1);
    setSessionRpe(sessionRpeOptions[1].value);
  }, [plan, plannedWorkoutId, sessionRpeOptions]);

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
    };
    localStorage.setItem("session_draft", JSON.stringify(draftPayload));
  }, [items, elapsed, running, plan, plannedWorkoutId, sessionRpe]);

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
    setSaveError(null);
    setFinishModal(true);
  };

  const handleComplete = async () => {
    if (!finishModal) {
      openFinishModal();
      return;
    }

    let saveOk = false;
    let savedSessionId: string | null = null;
    const durationMin = Number(finishDuration) || Math.max(20, Math.round(elapsed / 60) || plan.duration || 45);
    const startedAtIso = finishStart ? new Date(finishStart).toISOString() : undefined;

    const payload = {
      title: plan.title,
      location: plan.location,
      durationMin,
      exercises: items.map((it) => ({
        id: it.id,
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
      },
    };

    // сервер
    try {
      setSaving(true);
      setServerProgression(null);
      setProgressionJob(null);
      setSaveError(null);
      console.log("== WILL SAVE payload ==", payload, { plannedWorkoutId });
      const extra = plannedWorkoutId ? { plannedWorkoutId } : {};
      const result = await saveSession(payload, {
        ...extra,
        startedAt: startedAtIso,
        durationMin,
      });
      if (typeof result?.sessionId === "string") savedSessionId = result.sessionId;
      setServerProgression(result?.progression ?? null);
      if (result?.progressionJobId) {
        setProgressionJob({
          id: String(result.progressionJobId),
          status: String(result.progressionJobStatus || "pending"),
          lastError: null,
        });
      }
      saveOk = true;

      // If progression was not ready immediately, poll a few times in background.
      if (!result?.progression && result?.progressionJobId && result?.progressionJobStatus !== "done") {
        const jobId = String(result.progressionJobId);
        void (async () => {
          const maxPolls = 4;
          for (let i = 0; i < maxPolls; i++) {
            await new Promise((r) => setTimeout(r, 1400 + Math.round(Math.random() * 900)));
            try {
              const jobRes = await getProgressionJob(jobId);
              const job = jobRes?.job;
              if (job?.status) {
                setProgressionJob({ id: jobId, status: String(job.status), lastError: job.lastError ?? null });
              }
              if (job?.status === "done" && job?.result) {
                setServerProgression(job.result);
                break;
              }
              if (job?.status === "failed") {
                break;
              }
            } catch {
              // ignore polling errors
            }
          }
        })();
      }
    } catch {
      // не блокируем UX если сеть/сервер упали
      setSaveError("Не удалось сохранить тренировку. Проверь интернет и попробуй ещё раз.");
    } finally {
      setSaving(false);
      if (saveOk) {
        setFinishModal(false);

        // локальная история — только если реально сохранили на сервере
        try {
          const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
          const record = {
            id: savedSessionId || ((crypto as any)?.randomUUID?.() || String(Date.now())),
            finishedAt: new Date().toISOString(),
            ...payload,
          };
          history.unshift(record);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
        } catch {}

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

        setPendingNavHome(true);
        setShowConfetti(true);
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
          <div style={s.heroSubtitle}>
            {adaptationNotes.length > 0 
              ? adaptationNotes.join(" • ")
              : "Держи темп. Заполняй подходы по мере выполнения."
            }
          </div>

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
                        placeholder={
                          it.targetReps
                            ? Array.isArray(it.targetReps)
                              ? it.targetReps.join("-")
                              : String(it.targetReps)
                            : "повт./сек"
                        }
                        onChange={(v) => setValue(ei, si, "reps", v)}
                        disabled={it.done}
                      />
                      {showWeightInput ? (
                        <NumInput
                          value={s.weight}
                          placeholder="кг"
                          onChange={(v) => setValue(ei, si, "weight", v)}
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
                <div style={effortRow.value}>
                  <div style={effortRow.valueTitle}>
                    <span>{effortOptions.find((opt) => opt.key === it.effort)?.icon || "🟡"}</span>
                    <span>{effortOptions.find((opt) => opt.key === it.effort)?.label || effortOptions[1].label}</span>
                  </div>
                  <div style={effortRow.valueDesc}>
                    {effortOptions.find((opt) => opt.key === it.effort)?.desc || effortOptions[1].desc}
                  </div>
                </div>
                <div style={effortRow.sliderWrap}>
                  <input
                    type="range"
                min={0}
                    max={4}
                    step={1}
            value={Math.max(0, effortOptions.findIndex((opt) => opt.key === it.effort) ?? 1)}
            onChange={(e) => {
              const idx = Number(e.target.value);
              const opt = effortOptions[idx] || effortOptions[1];
              setEffort(ei, opt.key);
            }}
            style={{
              ...effortRow.slider,
              ...sliderFillStyle(
                Math.max(0, effortOptions.findIndex((opt) => opt.key === it.effort) ?? 1),
                0,
                effortOptions.length - 1,
                effortTicks
              ),
            }}
            className="effort-slider"
          />
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
              {saveError && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(239,68,68,.12)",
                    border: "1px solid rgba(239,68,68,.25)",
                    color: "#7f1d1d",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {saveError}
                </div>
              )}
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
            <div style={s.feedbackValue}>
            <div style={s.feedbackValueTitle}>
              <span>{sessionRpeOptions[sessionRpeIndex]?.icon}</span>
              <span>{sessionRpeOptions[sessionRpeIndex]?.label}</span>
            </div>
            <div style={s.feedbackValueDesc}>{sessionRpeOptions[sessionRpeIndex]?.desc}</div>
          </div>
          <input
            id="session-rpe"
            type="range"
            min={0}
            max={sessionRpeOptions.length - 1}
            step={1}
            value={sessionRpeIndex}
            onChange={(e) => {
              const idx = Math.max(0, Math.min(sessionRpeOptions.length - 1, Number(e.target.value)));
              setSessionRpeIndex(idx);
              setSessionRpe(sessionRpeOptions[idx].value);
            }}
            style={{
              ...s.feedbackSlider,
              ...sliderFillStyle(sessionRpeIndex, 0, sessionRpeOptions.length - 1, sessionTicks),
            }}
            className="effort-slider"
          />
        </div>
      </section>

      {/* конфетти */}
      {showConfetti && (
        <Confetti
          progression={serverProgression}
          progressionJob={progressionJob}
          onClose={() => {
            setShowConfetti(false);
            if (pendingNavHome) nav("/");
          }}
        />
      )}
      <div style={s.bottomSpacer} />
      </div>
    </div>
  );
}

/* ---------- Мелкие компоненты ---------- */
function NumInput({
  value,
  placeholder,
  onChange,
  disabled,
}: {
  value?: number;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={num.wrap}>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={num.input}
        disabled={disabled}
      />
    </div>
  );
}

function Confetti({
  onClose,
  progression,
  progressionJob,
}: {
  onClose: () => void;
  progression?: any | null;
  progressionJob?: { id: string; status: string; lastError?: string | null } | null;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const summary = progression || null;
  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];

  const actionLabel = (action: string | undefined) =>
    ({
      increase_weight: "📈 +вес",
      increase_reps: "📈 +повт.",
      maintain: "➡️ без изменений",
      decrease_weight: "📉 -вес",
      deload: "🛌 deload",
      rotate_exercise: "🔄 замена",
    } as Record<string, string>)[action || ""] || "➡️";

  const formatDelta = (rec: any) => {
    if (!rec) return "";
    if (typeof rec.newWeight === "number" && Number.isFinite(rec.newWeight) && rec.newWeight > 0) return `${rec.newWeight} кг`;
    if (Array.isArray(rec.newRepsTarget) && rec.newRepsTarget.length === 2) return `${rec.newRepsTarget[0]}–${rec.newRepsTarget[1]} повт.`;
    return "";
  };

  return (
    <div className="confetti-wrap">
      <div className="confetti-overlay" />
      <div className="confetti-text">
        <div className="confetti-card">
          <div className="confetti-icon">✅</div>
          <div className="confetti-title">Тренировка сохранена</div>
          <div className="confetti-subtitle">
            Повторы и веса записаны. Прогрессия учитывает только рабочие подходы (≈ ≥85% от топ-веса), разминки не влияют.
          </div>

          {!summary && progressionJob && progressionJob.status !== "done" && (
            <div className="confetti-subtitle">
              {progressionJob.status === "failed"
                ? "Прогресс не обновился автоматически. Мы уже разбираемся — веса не будут «скакать»."
                : "Прогресс обновится автоматически (это может занять несколько секунд)."}
            </div>
          )}

          {summary && (
            <div className="confetti-prog">
              <div className="confetti-prog-row">
                <span>Прогресс:</span>
                <span>
                  {Number(summary.progressedCount) || 0} ↑ / {Number(summary.maintainedCount) || 0} → /{" "}
                  {Number(summary.deloadCount) || 0} ↓
                </span>
              </div>
              {Array.isArray(summary.rotationSuggestions) && summary.rotationSuggestions.length > 0 && (
                <div className="confetti-prog-row">
                  <span>Ротация:</span>
                  <span>{summary.rotationSuggestions.join(", ")}</span>
                </div>
              )}
              {details.length > 0 && (
                <button
                  type="button"
                  className="confetti-link"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {showDetails ? "Скрыть детали прогрессии" : "Показать детали прогрессии"}
                </button>
              )}
              {showDetails && details.length > 0 && (
                <div className="confetti-details">
                  {details.slice(0, 24).map((d, i) => {
                    const rec = d?.recommendation;
                    const explain = rec?.explain;
                    const delta = formatDelta(rec);
                    const title = String(d?.exerciseName || rec?.exerciseId || `#${i + 1}`);
                    const reason = String(rec?.reason || "").trim();
                    const ws =
                      explain?.totalWorkingSets != null
                        ? `рабочие ${explain.lowerHits ?? "?"}/${explain.totalWorkingSets}, верх ${explain.upperHits ?? "?"}/${explain.totalWorkingSets}`
                        : "";
                    const extra = [delta, ws].filter(Boolean).join(" • ");
                    return (
                      <div key={i} className="confetti-detail-item">
                        <div className="confetti-detail-head">
                          <span className="confetti-detail-name">{title}</span>
                          <span className="confetti-detail-action">{actionLabel(rec?.action)}</span>
                        </div>
                        {extra ? <div className="confetti-detail-meta">{extra}</div> : null}
                        {reason ? <div className="confetti-detail-reason">{reason}</div> : null}
                      </div>
                    );
                  })}
                  {details.length > 24 && (
                    <div className="confetti-detail-more">…и ещё {details.length - 24} упражнений</div>
                  )}
                </div>
              )}
            </div>
          )}
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
    height: 28,
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "8px 0",
    touchAction: "none",
  },
  feedbackValue: { display: "grid", gap: 2 },
  feedbackValueTitle: { fontSize: 13, fontWeight: 700, color: "#1f2933" },
  feedbackValueDesc: {
    fontSize: 12,
    color: "#4b5563",
    lineHeight: 1.35,
  },
  bottomSpacer: { height: 80 },
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
.confetti-text{ width: 100%; max-width: 560px; }
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
  max-height: 82vh;
  overflow: auto;
}
.confetti-icon{ font-size: 30px; }
.confetti-title{ font-size: 18px; font-weight: 700; color: #111; }
.confetti-subtitle{ font-size: 13px; color: #4b5563; }
.confetti-prog{
  display: grid;
  gap: 8px;
  text-align: left;
  border: 1px solid rgba(15,23,42,.12);
  background: rgba(255,255,255,.55);
  border-radius: 14px;
  padding: 12px;
}
.confetti-prog-row{
  display:flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #111;
}
.confetti-link{
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  color: #4f46e5;
  font-weight: 600;
  cursor: pointer;
}
.confetti-details{
  display: grid;
  gap: 10px;
  margin-top: 6px;
}
.confetti-detail-item{
  border-radius: 12px;
  padding: 10px;
  background: rgba(15,23,42,.04);
  border: 1px solid rgba(15,23,42,.08);
}
.confetti-detail-head{
  display:flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  font-weight: 650;
  color: #111;
}
.confetti-detail-name{ overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.confetti-detail-action{ color: #334155; font-weight: 600; flex: 0 0 auto; }
.confetti-detail-meta{ margin-top: 4px; font-size: 12px; color: #475569; }
.confetti-detail-reason{ margin-top: 6px; font-size: 12.5px; color: #111827; line-height: 1.25; }
.confetti-detail-more{ font-size: 12px; color: #64748b; }
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
    display: "flex",
    gap: 10,
    width: "100%",
    alignItems: "center",
    minWidth: 0,
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
    width: "100%",
  } as React.CSSProperties,
  input: {
    height: 40,
    width: "100%",
    padding: "0 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    fontSize: 16,
    boxSizing: "border-box",
    textAlign: "center",
    minWidth: 0,
    background: "rgba(255,255,255,0.85)",
    caretColor: "#9ca3af",
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
    gap: 4,
  } as React.CSSProperties,
  label: { fontSize: 12.5, color: "#374151", fontWeight: 600 } as React.CSSProperties,
  sliderWrap: { display: "grid", gap: 4 },
  slider: {
    width: "100%",
    height: 28,
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "8px 0",
    touchAction: "none",
  } as React.CSSProperties,
  ticks: {
  } as React.CSSProperties,
  value: {
    display: "grid",
    gap: 2,
  } as React.CSSProperties,
  valueTitle: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "#1f2933",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  valueDesc: {
    fontSize: 11.5,
    color: "#4b5563",
    lineHeight: 1.35,
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
.effort-slider {
  -webkit-tap-highlight-color: transparent;
}
.effort-slider::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.effort-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.14);
  box-shadow: 0 3px 10px rgba(0,0,0,0.2), 0 0 0 12px rgba(0,0,0,0.001);
  margin-top: -11px;
}
.effort-slider::-moz-range-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.effort-slider::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.14);
  box-shadow: 0 3px 10px rgba(0,0,0,0.2), 0 0 0 12px rgba(0,0,0,0.001);
}
`;
function sliderFillStyle(value: number, min: number, max: number, ticks: number[]) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const tickImgs = ticks.map(
    (p) => `linear-gradient(to bottom, rgba(15,23,42,0.3) 0%, rgba(15,23,42,0.3) 100%)`
  );
  return {
    backgroundImage: [
      `linear-gradient(to right, rgba(15,23,42,0.8) 0%, rgba(15,23,42,0.8) ${pct}%, rgba(15,23,42,0.18) ${pct}%, rgba(15,23,42,0.18) 100%)`,
      ...tickImgs,
    ].join(", "),
    backgroundSize: ["100% 4px", ...tickImgs.map(() => "1px 8px")].join(", "),
    backgroundPosition: ["0 50%", ...ticks.map((p) => `${p}% 50%`)].join(", "),
    backgroundRepeat: "no-repeat",
  };
}
function sessionRpeLabel(val: number): string {
  if (val >= 9.5) return "Слишком тяжело";
  if (val >= 9) return "Очень тяжело";
  if (val >= 8) return "Тяжело";
  if (val >= 7) return "Комфортно";
  if (val >= 6) return "Ниже среднего";
  return "Очень легко";
}

function sessionRpeHint(val: number): string {
  if (val >= 9.5) return "Перегруз — в следующий раз уменьшим объём или вес.";
  if (val >= 9) return "Почти на пределе — оставим или снизим нагрузку.";
  if (val >= 8) return "Тяжело, но рабоче — сохраним или немного снизим объём.";
  if (val >= 7) return "Оптимально — продолжаем в том же темпе.";
  if (val >= 6) return "Легковато — можно добавить немного объёма/веса.";
  return "Легко — можно поднять интенсивность.";
}
