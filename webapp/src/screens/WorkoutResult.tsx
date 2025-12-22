import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProgressionJob } from "@/api/plan";

const LAST_RESULT_KEY = "last_workout_result_v1";

type ProgressionJob = { id: string; status: string; lastError?: string | null } | null;

type StoredWorkoutResult = {
  version: 1;
  createdAt: string;
  sessionId: string | null;
  plannedWorkoutId: string | null;
  payload: any;
  progression: any | null;
  progressionJob: ProgressionJob;
};

function readStored(): StoredWorkoutResult | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed as StoredWorkoutResult;
  } catch {
    return null;
  }
}

function writeStored(next: StoredWorkoutResult) {
  try {
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(next));
  } catch {}
}

function normalizeNameKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\wа-яa-z]/g, "");
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function median(nums: number[]): number | null {
  const sorted = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function formatKg(v: number | null): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  // 0.25 kg rounding is common; keep as-is if integer-ish.
  const rounded = Math.round(v * 4) / 4;
  return `${rounded} кг`;
}

function parseUpperReps(reps: unknown): number | null {
  if (reps == null) return null;
  if (typeof reps === "number" && Number.isFinite(reps) && reps > 0) return Math.round(reps + 2);
  const s = String(reps);
  const m = s.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.round(n + 2);
  return null;
}

function coachLine(action: string | undefined): string {
  switch (action) {
    case "increase_weight":
      return "Отличная сессия. Сохрани технику — в следующий раз работаем с новым весом.";
    case "increase_reps":
      return "Хороший контроль. Добей верх диапазона — затем увеличим вес.";
    case "decrease_weight":
      return "Чуть снизим вес, чтобы снова стабильно закрывать диапазон и двигаться вверх.";
    case "deload":
      return "Делоад — это часть прогресса. Сейчас фокус на технике и восстановлении.";
    case "rotate_exercise":
      return "Для нового стимула попробуем вариант упражнения — так прогресс пойдёт быстрее.";
    default:
      return "Отличный контроль. Добей верх диапазона — затем увеличим вес.";
  }
}

export default function WorkoutResult() {
  const nav = useNavigate();
  const location = useLocation();

  const fromState: StoredWorkoutResult | null = (location.state as any)?.result || null;

  const initial = useMemo(() => fromState || readStored(), [fromState]);
  const [result, setResult] = useState<StoredWorkoutResult | null>(initial);

  const [job, setJob] = useState<ProgressionJob>(initial?.progressionJob ?? null);
  const [summary, setSummary] = useState<any | null>(initial?.progression ?? null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!result) return;
    writeStored(result);
  }, [result]);

  const jobId = job?.id ? String(job.id) : null;
  const needsPoll = Boolean(jobId && (!summary || job?.status !== "done") && job?.status !== "failed");

  const pollOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!jobId) return;
    const res = await getProgressionJob(jobId);
    const j = res?.job;
    if (j?.status) setJob({ id: jobId, status: String(j.status), lastError: j.lastError ?? null });
    if (j?.status === "done" && j?.result) setSummary(j.result);
    return j ? { status: j.status, result: j.result } : null;
  };

  useEffect(() => {
    if (!result) return;
    if (!needsPoll) return;
    if (polling) return;
    setPolling(true);

    let canceled = false;
    void (async () => {
      const maxPolls = 10;
      for (let i = 0; i < maxPolls; i++) {
        if (canceled) break;
        await new Promise((r) => setTimeout(r, 900 + Math.round(Math.random() * 900)));
        try {
          const j = await pollOnce();
          const st = String(j?.status || "").toLowerCase();
          if (st === "done" || st === "failed") break;
        } catch {
          // ignore polling errors
        }
      }
      if (!canceled) setPolling(false);
    })();

    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, needsPoll]);

  useEffect(() => {
    if (!result) return;
    setJob(result.progressionJob ?? null);
    setSummary(result.progression ?? null);
  }, [result?.createdAt]);

  useEffect(() => {
    if (!result) return;
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        progressionJob: job,
        progression: summary,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.lastError, summary]);

  if (!result) {
    return (
      <div style={page.outer}>
        <div style={page.inner}>
          <div style={s.sheet}>
            <div style={s.heroTitle}>Результат тренировки</div>
            <div style={s.heroSubtitle}>Нет данных о последней тренировке.</div>
            <div style={{ marginTop: 14 }}>
              <button style={s.ctaPrimary} onClick={() => nav("/")}>
                На главный экран
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];
  const payloadExercises: Array<any> = Array.isArray(result.payload?.exercises) ? result.payload.exercises : [];

  const missingProgression = !summary && job && job.status !== "done";

  const durationMin: number | null = toNumber(result.payload?.durationMin);
  const exerciseCount = payloadExercises.length;

  const sum = details.reduce(
    (acc, d) => {
      const rec = d?.recommendation;
      const ex = rec?.explain;
      const ws = typeof ex?.totalWorkingSets === "number" ? ex.totalWorkingSets : 0;
      acc.workingSets += ws;
      const rpe = typeof ex?.sessionRpe === "number" && Number.isFinite(ex.sessionRpe) ? ex.sessionRpe : null;
      if (acc.sessionRpe == null && rpe != null) acc.sessionRpe = rpe;
      return acc;
    },
    { workingSets: 0, sessionRpe: null as number | null }
  );

  const payloadRpe = toNumber(result.payload?.feedback?.sessionRpe);
  const sessionRpe =
    typeof sum.sessionRpe === "number" && Number.isFinite(sum.sessionRpe) ? sum.sessionRpe : payloadRpe;

  const progressedCount = Number(summary?.progressedCount) || 0;
  const deloadCount = Number(summary?.deloadCount) || 0;

  const progressHeadline =
    deloadCount > 0
      ? "📉 Прогресс: делоад"
      : progressedCount > 0
        ? "📈 Прогресс: шаг вперёд"
        : "📈 Прогресс: стабилизация";
  const progressSubline =
    deloadCount > 0
      ? "Снижаем нагрузку для восстановления — потом вернёмся сильнее"
      : progressedCount > 0
        ? "Отличный сигнал — постепенно повышаем нагрузку"
        : "Вес сохранён — цель: добить верх диапазона";

  const payloadByName = new Map<string, any>();
  for (const ex of payloadExercises) {
    const key = normalizeNameKey(ex?.name || ex?.exerciseName || "");
    if (!key) continue;
    if (!payloadByName.has(key)) payloadByName.set(key, ex);
  }

  const getCurrentWeightFor = (name: string): number | null => {
    const key = normalizeNameKey(name);
    const ex = payloadByName.get(key);
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    const weights = sets
      .map((s) => toNumber(s?.weight))
      .filter((w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0);
    return median(weights);
  };

  const getTargetUpperFor = (name: string, rec: any): number | null => {
    const key = normalizeNameKey(name);
    const ex = payloadByName.get(key);
    const fromRec = Array.isArray(rec?.newRepsTarget) ? toNumber(rec.newRepsTarget?.[1]) : null;
    return (fromRec != null ? Math.round(fromRec) : null) ?? parseUpperReps(ex?.reps) ?? 12;
  };

  return (
    <div style={page.outer}>
      <div style={page.inner}>
        <div style={s.sheet}>
          <section style={s.hero}>
            <div style={s.heroTitle}>🔥 Отличная тренировка!</div>
            <div style={s.heroSubtitle}>Ты выполнил план на 100%.</div>
            <div style={s.heroNote}>Мы учитываем только рабочие подходы — именно они двигают прогресс 💪</div>

            <div style={s.progressCard}>
              <div style={s.progressTitle}>{progressHeadline}</div>
              <div style={s.progressSub}>{progressSubline}</div>
            </div>

            <div style={s.metricsGrid}>
              <div style={s.metricCard}>
                <div style={s.metricLabel}>⏱️ Время</div>
                <div style={s.metricValue}>{durationMin != null ? `${durationMin} мин` : "—"}</div>
              </div>
              <div style={s.metricCard}>
                <div style={s.metricLabel}>🏋️ Упражнений</div>
                <div style={s.metricValue}>{exerciseCount || "—"}</div>
              </div>
              <div style={s.metricCard}>
                <div style={s.metricLabel}>🎯 Рабочих подходов</div>
                <div style={s.metricValue}>{summary ? sum.workingSets : "—"}</div>
              </div>
            </div>

            {typeof sessionRpe === "number" && Number.isFinite(sessionRpe) ? (
              <div style={s.rpeRow}>
                <span style={s.rpeChip}>🔥 RPE ~{Math.round(sessionRpe)}</span>
              </div>
            ) : null}
          </section>

          <section style={s.section}>
            <div style={s.sectionTitle}>🧠 Рекомендации на следующий раз</div>

            {job?.status === "failed" && (
              <div style={s.inlineWarning}>
                <div style={s.inlineWarningTitle}>Не удалось обновить прогрессию</div>
                <div style={s.inlineWarningText}>Тренировка сохранена. Рекомендации можно пересчитать позже.</div>
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    style={s.smallBtn}
                    onClick={async () => {
                      try {
                        await pollOnce();
                      } catch {}
                    }}
                    disabled={!jobId}
                  >
                    Обновить
                  </button>
                  {job?.lastError ? (
                    <button
                      style={s.smallBtnGhost}
                      onClick={() => {
                        alert(
                          "Техническая ошибка при обновлении прогрессии. Тренировка сохранена.\n\n" +
                            String(job.lastError)
                        );
                      }}
                    >
                      Что случилось?
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {missingProgression && (
              <div style={s.sectionHint}>Пока готовим рекомендации. Ты можешь закрыть экран — они появятся автоматически.</div>
            )}

            {summary && details.length === 0 && (
              <div style={s.sectionHint}>
                Рекомендаций нет (скорее всего, в подходах не было повторов или упражнение не распознано).
              </div>
            )}

            {summary && details.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                {details.slice(0, 30).map((d, idx) => {
                  const rec = d?.recommendation;
                  const explain = rec?.explain;
                  const name = String(d?.exerciseName || rec?.exerciseId || `Упражнение ${idx + 1}`);
                  const action = String(rec?.action || "maintain");

                  const currentW = getCurrentWeightFor(name);
                  const currentWLabel = formatKg(currentW);
                  const targetUpper = getTargetUpperFor(name, rec);

                  const newWeight = toNumber(rec?.newWeight);
                  const newWeightLabel = formatKg(newWeight);

                  const weightLine =
                    action === "increase_weight" && currentWLabel && newWeightLabel
                      ? `Вес: ${currentWLabel} → ${newWeightLabel}`
                      : action === "decrease_weight" && currentWLabel && newWeightLabel
                        ? `Вес: ${currentWLabel} → ${newWeightLabel}`
                        : action === "deload" && currentWLabel && newWeightLabel
                          ? `Вес: ${currentWLabel} → ${newWeightLabel}`
                          : currentWLabel
                            ? `Вес: ${currentWLabel} — оставляем`
                            : "Вес: —";

                  const targetLine =
                    typeof targetUpper === "number" && Number.isFinite(targetUpper)
                      ? `Цель: дойти до ${targetUpper} повторений`
                      : "Цель: добить верх диапазона";

                  const ws = typeof explain?.totalWorkingSets === "number" ? explain.totalWorkingSets : null;
                  const lowerHits = typeof explain?.lowerHits === "number" ? explain.lowerHits : null;
                  const doneWs = ws != null ? Math.min(ws, lowerHits ?? ws) : null;

                  const chipWorking = ws != null && ws > 0 ? `✅ ${doneWs ?? ws}/${ws} рабочих` : null;

                  const chipRpe =
                    typeof explain?.sessionRpe === "number" && Number.isFinite(explain.sessionRpe)
                      ? `RPE ~${Math.round(explain.sessionRpe)}`
                      : typeof sessionRpe === "number" && Number.isFinite(sessionRpe)
                        ? `RPE ~${Math.round(sessionRpe)}`
                        : null;

                  const plannedSets = typeof explain?.plannedSets === "number" ? explain.plannedSets : null;
                  const performedSets = typeof explain?.performedSets === "number" ? explain.performedSets : null;
                  const adherence =
                    plannedSets != null && plannedSets > 0 && performedSets != null ? performedSets / plannedSets : null;
                  const chipPlan =
                    adherence != null ? (adherence >= 0.9 ? "План выполняется" : "Сокращено") : null;

                  const chips = [chipWorking, chipRpe, chipPlan].filter(Boolean) as string[];

                  return (
                    <div key={idx} style={s.recCard}>
                      <div style={s.recTitle}>{name}</div>
                      <div style={s.recLine}>{weightLine}</div>
                      <div style={s.recLineMuted}>{targetLine}</div>

                      {chips.length > 0 && (
                        <div style={s.recChips}>
                          {chips.map((c) => (
                            <span
                              key={c}
                              style={c.startsWith("✅") ? s.chipGreen : c.startsWith("RPE") ? s.chipAmber : s.chipBlue}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={s.coachBubble}>
                        <div style={s.coachRow}>
                          <div style={s.coachAvatar} aria-hidden="true" />
                          <div style={s.coachText}>{coachLine(action)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          </section>
        </div>

        <div style={{ height: 8 }} />
      </div>

      <div style={s.stickyWrap}>
        <div style={s.stickyInner}>
          <button style={s.ctaPrimary} onClick={() => nav("/schedule")}>
            <span style={s.ctaPrimaryLeft}>
              <span style={s.ctaPrimaryIcon} aria-hidden="true">
                🗓️
              </span>
              <span style={s.ctaPrimaryText}>Запланировать следующую тренировку</span>
            </span>
            <span style={s.ctaPrimaryArrow} aria-hidden="true">
              ›
            </span>
          </button>
          <button style={s.ctaSecondary} onClick={() => nav("/progress")}>
            Посмотреть прогресс
          </button>
          <button
            style={s.ctaTertiary}
            onClick={() => {
              try {
                localStorage.removeItem(LAST_RESULT_KEY);
              } catch {}
              nav("/");
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

const page = {
  outer: {
    minHeight: "100vh",
    width: "100%",
    padding: "20px 16px",
    background: "radial-gradient(1100px 520px at 30% 0%, #EEF2FF 0%, #F6F7FB 55%, #F6F7FB 100%)",
  } as CSSProperties,
  inner: {
    maxWidth: 760,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
    paddingBottom: 210, // space for sticky actions
  } as CSSProperties,
};

const s = {
  sheet: {
    borderRadius: 28,
    padding: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(17, 24, 39, 0.06)",
    boxShadow: "0 18px 60px rgba(17, 24, 39, 0.10)",
  } as CSSProperties,
  hero: {
    padding: 4,
    marginBottom: 18,
  } as CSSProperties,
  heroTitle: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: -0.4,
    color: "#111827",
    lineHeight: 1.15,
  } as CSSProperties,
  heroSubtitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: 700,
    color: "#111827",
  } as CSSProperties,
  heroNote: {
    marginTop: 10,
    fontSize: 15,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,
  smallBtn: {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
  } as CSSProperties,
  smallBtnGhost: {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid #EEF0F6",
    background: "#F9FAFB",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
  } as CSSProperties,

  progressCard: {
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    background: "#FFFFFF",
    border: "1px solid #EEF0F6",
    boxShadow: "0 10px 30px rgba(17, 24, 39, 0.08)",
  } as CSSProperties,
  progressTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.2,
  } as CSSProperties,
  progressSub: {
    marginTop: 6,
    fontSize: 14.5,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginTop: 14,
  } as CSSProperties,
  metricCard: {
    borderRadius: 18,
    padding: 14,
    background: "#FFFFFF",
    border: "1px solid #EEF0F6",
    boxShadow: "0 6px 24px rgba(17, 24, 39, 0.06)",
  } as CSSProperties,
  metricLabel: {
    fontSize: 12.5,
    color: "#6B7280",
    fontWeight: 700,
  } as CSSProperties,
  metricValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.3,
  } as CSSProperties,
  rpeRow: {
    marginTop: 10,
    display: "flex",
    justifyContent: "flex-start",
  } as CSSProperties,
  rpeChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#FFF7ED",
    color: "#9A3412",
    fontSize: 13,
    fontWeight: 800,
    border: "1px solid rgba(251, 191, 36, 0.25)",
  } as CSSProperties,

  section: {
    marginTop: 10,
  } as CSSProperties,
  sectionTitle: {
    fontSize: 20,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.25,
  } as CSSProperties,
  sectionHint: {
    marginTop: 10,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,

  inlineWarning: {
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    background: "#FFFBEB",
    border: "1px solid rgba(245, 158, 11, 0.20)",
  } as CSSProperties,
  inlineWarningTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: "#92400E",
  } as CSSProperties,
  inlineWarningText: {
    marginTop: 6,
    fontSize: 13.5,
    color: "#92400E",
    opacity: 0.85,
    lineHeight: 1.35,
  } as CSSProperties,

  recCard: {
    borderRadius: 18,
    padding: 16,
    background: "#FFFFFF",
    border: "1px solid #EEF0F6",
    boxShadow: "0 6px 24px rgba(17, 24, 39, 0.06)",
  } as CSSProperties,
  recTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.2,
  } as CSSProperties,
  recLine: {
    marginTop: 10,
    fontSize: 15,
    color: "#111827",
    fontWeight: 700,
  } as CSSProperties,
  recLineMuted: {
    marginTop: 8,
    fontSize: 14.5,
    color: "#6B7280",
    lineHeight: 1.3,
  } as CSSProperties,
  recChips: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
  } as CSSProperties,
  chipGreen: {
    fontSize: 12.5,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#ECFDF3",
    color: "#067647",
    fontWeight: 800,
    border: "1px solid rgba(6, 118, 71, 0.15)",
  } as CSSProperties,
  chipAmber: {
    fontSize: 12.5,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFF7ED",
    color: "#9A3412",
    fontWeight: 800,
    border: "1px solid rgba(154, 52, 18, 0.12)",
  } as CSSProperties,
  chipBlue: {
    fontSize: 12.5,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 800,
    border: "1px solid rgba(29, 78, 216, 0.12)",
  } as CSSProperties,
  coachBubble: {
    marginTop: 14,
    borderRadius: 16,
    padding: 12,
    background: "#F9FAFB",
    border: "1px solid #EEF0F6",
  } as CSSProperties,
  coachRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  } as CSSProperties,
  coachAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "linear-gradient(180deg, #E5E7EB 0%, #F3F4F6 100%)",
    border: "1px solid #EEF0F6",
    flex: "0 0 auto",
  } as CSSProperties,
  coachText: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,

  stickyWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
    background: "rgba(246, 247, 251, 0.86)",
    backdropFilter: "blur(14px)",
    borderTop: "1px solid #E5E7EB",
  } as CSSProperties,
  stickyInner: {
    maxWidth: 760,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } as CSSProperties,
  ctaPrimary: {
    height: 52,
    width: "100%",
    padding: "0 14px 0 14px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)",
    color: "#FFFFFF",
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: -0.1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    textAlign: "left",
  } as CSSProperties,
  ctaPrimaryLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  } as CSSProperties,
  ctaPrimaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255, 255, 255, 0.18)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
    flex: "0 0 auto",
  } as CSSProperties,
  ctaPrimaryText: {
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as CSSProperties,
  ctaPrimaryArrow: {
    fontSize: 28,
    lineHeight: 1,
    opacity: 0.95,
    flex: "0 0 auto",
  } as CSSProperties,
  ctaSecondary: {
    height: 48,
    width: "100%",
    borderRadius: 16,
    border: "1px solid #D1D5DB",
    cursor: "pointer",
    background: "#FFFFFF",
    color: "#111827",
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: -0.1,
  } as CSSProperties,
  ctaTertiary: {
    height: 42,
    width: "100%",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "#6B7280",
    fontWeight: 800,
    fontSize: 15,
  } as CSSProperties,
};
