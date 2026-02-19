import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCoachJob, getProgressionJob, getWorkoutSessionById } from "@/api/plan";

const LAST_RESULT_KEY = "last_workout_result_v1";
const HISTORY_KEY = "history_sessions_v1";

type ProgressionJob = { id: string; status: string; lastError?: string | null } | null;

type StoredWorkoutResult = {
  version: 1;
  createdAt: string;
  sessionId: string | null;
  plannedWorkoutId: string | null;
  payload: any;
  progression: any | null;
  progressionJob: ProgressionJob;
  coachJob?: { id: string; status: string; lastError?: string | null } | null;
  coachReport?: any | null;
  weeklyCoachJobId?: string | null;
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
  if (Array.isArray(reps) && reps.length >= 2) {
    const a = Number(reps[0]);
    const b = Number(reps[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(Math.round(a), Math.round(b));
  }
  if (typeof reps === "number" && Number.isFinite(reps) && reps > 0) return Math.round(reps + 2);
  const s = String(reps).trim();
  const m = s.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const c = s.match(/(\d+)\s*,\s*(\d+)/);
  if (c) {
    const a = Number(c[1]);
    const b = Number(c[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.round(n + 2);
  return null;
}

type HistorySession = {
  id?: string;
  finishedAt?: string;
  durationMin?: number;
  title?: string;
  items?: Array<any>;
  exercises?: Array<any>;
};

function readHistory(): HistorySession[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function coachSummaryMessage(args: {
  hasLoadDown: boolean;
  weightUpCount: number;
  repsUpCount: number;
}): string {
  const { hasLoadDown, weightUpCount, repsUpCount } = args;
  if (hasLoadDown) return "Сегодня бережный режим — это часть прогресса. Сохрани технику и восстановление, дальше вернёмся к росту.";
  if (weightUpCount > 0) return `Отлично! В ${weightUpCount} упражнениях можно прибавить вес. На новых весах держи технику и комфортный темп.`;
  if (repsUpCount > 0) return `Хорошая работа! В ${repsUpCount} упражнениях повышаем цель по повторам — затем перейдём к росту веса.`;
  return "Стабильность — это тоже прогресс. Добивай верх повторов с чистой техникой, и вес начнёт расти.";
}

export default function WorkoutResult() {
  const nav = useNavigate();
  const location = useLocation();

  const fromState: StoredWorkoutResult | null = (location.state as any)?.result || null;
  const urlSessionId = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      const id = sp.get("sessionId");
      return id && id.trim() ? id.trim() : null;
    } catch {
      return null;
    }
  }, [location.search]);

  const initial = useMemo(() => fromState || readStored(), [fromState]);
  const [result, setResult] = useState<StoredWorkoutResult | null>(initial);

  const [job, setJob] = useState<ProgressionJob>(initial?.progressionJob ?? null);
  const [summary, setSummary] = useState<any | null>(initial?.progression ?? null);
  const [coachJob, setCoachJob] = useState<{ id: string; status: string; lastError?: string | null } | null>(
    initial?.coachJob ?? null
  );
  const [coachReport, setCoachReport] = useState<any | null>(initial?.coachReport ?? null);
  const [polling, setPolling] = useState(false);
  const [coachPolling, setCoachPolling] = useState(false);
  const [expandUp, setExpandUp] = useState(true);
  const [expandKeep, setExpandKeep] = useState(false);
  const [expandDown, setExpandDown] = useState(false);
  const [showMoreProgress, setShowMoreProgress] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Deep link support: /workout/result?sessionId=...
  useEffect(() => {
    if (result) return;
    if (!urlSessionId) return;
    let canceled = false;
    void (async () => {
      try {
        const data = await getWorkoutSessionById(urlSessionId);
        if (canceled) return;
        const nowIso = new Date().toISOString();
        const next: StoredWorkoutResult = {
          version: 1,
          createdAt: nowIso,
          sessionId: data?.session?.id || urlSessionId,
          plannedWorkoutId: null,
          payload: data?.session?.payload ?? null,
          progression: data?.progressionJob?.result ?? null,
          progressionJob: data?.progressionJob?.id
            ? { id: String(data.progressionJob.id), status: String(data.progressionJob.status || "pending"), lastError: data.progressionJob.lastError ?? null }
            : null,
          coachJob: data?.coachReport?.jobId
            ? { id: String(data.coachReport.jobId), status: String(data.coachReport.status || "pending"), lastError: data.coachReport.lastError ?? null }
            : null,
          coachReport: data?.coachReport?.result ?? null,
        };
        setResult(next);
        setJob(next.progressionJob ?? null);
        setSummary(next.progression ?? null);
        setCoachJob(next.coachJob ?? null);
        setCoachReport(next.coachReport ?? null);
      } catch {
        // ignore deep-link failures
      }
    })();
    return () => {
      canceled = true;
    };
  }, [result, urlSessionId]);

  useEffect(() => {
    if (!result) return;
    writeStored(result);
  }, [result]);

  const jobId = job?.id ? String(job.id) : null;
  const needsPoll = Boolean(jobId && (!summary || job?.status !== "done") && job?.status !== "failed");

  const coachJobId = coachJob?.id ? String(coachJob.id) : null;
  const needsCoachPoll = Boolean(
    coachJobId && (!coachReport || coachJob?.status !== "done") && coachJob?.status !== "failed"
  );

  const pollOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!jobId) return;
    const res = await getProgressionJob(jobId);
    const j = res?.job;
    if (j?.status) setJob({ id: jobId, status: String(j.status), lastError: j.lastError ?? null });
    if (j?.status === "done" && j?.result) setSummary(j.result);
    return j ? { status: j.status, result: j.result } : null;
  };

  const pollCoachOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!coachJobId) return;
    const res = await getCoachJob(coachJobId);
    const j = res?.job;
    if (j?.status) setCoachJob({ id: coachJobId, status: String(j.status), lastError: j.lastError ?? null });
    if (j?.status === "done" && j?.result) setCoachReport(j.result);
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
    if (!needsCoachPoll) return;
    if (coachPolling) return;
    setCoachPolling(true);

    let canceled = false;
    void (async () => {
      const maxPolls = 10;
      for (let i = 0; i < maxPolls; i++) {
        if (canceled) break;
        await new Promise((r) => setTimeout(r, 900 + Math.round(Math.random() * 900)));
        try {
          const j = await pollCoachOnce();
          const st = String(j?.status || "").toLowerCase();
          if (st === "done" || st === "failed") break;
        } catch {
          // ignore polling errors
        }
      }
      if (!canceled) setCoachPolling(false);
    })();

    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachJobId, needsCoachPoll]);

  useEffect(() => {
    if (!result) return;
    setJob(result.progressionJob ?? null);
    setSummary(result.progression ?? null);
    setCoachJob(result.coachJob ?? null);
    setCoachReport(result.coachReport ?? null);
  }, [result?.createdAt]);

  useEffect(() => {
    if (!result) return;
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        progressionJob: job,
        progression: summary,
        coachJob,
        coachReport,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.lastError, summary, coachJob?.status, coachJob?.lastError, coachReport]);

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
  const doneExercises = payloadExercises.filter((ex) => ex?.done === true).length;
  const recordedSets = payloadExercises.reduce((acc, ex) => acc + (Array.isArray(ex?.sets) ? ex.sets.length : 0), 0);

  const weightUp = details.filter((d) => String(d?.recommendation?.action || "") === "increase_weight");
  const repsUp = details.filter((d) => String(d?.recommendation?.action || "") === "increase_reps");
  const loadDown = details.filter((d) => {
    const a = String(d?.recommendation?.action || "");
    return a === "decrease_weight" || a === "deload" || a === "rotate_exercise";
  });
  const keep = details.filter((d) => {
    const a = String(d?.recommendation?.action || "");
    return a === "maintain" || a === "increase_reps";
  });

  const scenario =
    loadDown.length > 0
      ? "down"
      : weightUp.length > 0
        ? "up"
        : repsUp.length > 0
          ? "reps"
          : "stable";

  const heroHeadline =
    scenario === "down"
      ? "🛌 Сегодня бережный режим"
      : scenario === "up"
        ? "🎉 Ты стал сильнее"
        : scenario === "reps"
          ? "🎉 Ты стал выносливее"
          : "✅ Отличная стабильность";

  const heroSubline =
    scenario === "down"
      ? "Снижаем нагрузку, чтобы восстановиться и вернуться сильнее."
      : scenario === "up"
        ? `В ${weightUp.length} упражнениях можно прибавить вес.`
        : scenario === "reps"
          ? `В ${repsUp.length} упражнениях повышаем цель по повторам.`
          : "Сохраняем вес и добиваем верх повторов — так и растут.";

  const mostImportant =
    scenario === "down"
      ? "Это не откат. Разгрузка помогает прогрессировать стабильнее и без перегруза."
      : scenario === "up"
        ? `На новых весах главное — техника и комфортный темп.`
        : scenario === "reps"
          ? "Повторы выросли — это тоже прогресс. Следующий шаг: постепенно прибавим вес."
          : "Стабильность — это прогресс. Добей верх повторов в 2–3 упражнениях, и вес начнёт расти.";

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

  const prior = useMemo(() => {
    const history = readHistory().slice();
    history.sort((a, b) => new Date(b.finishedAt || 0).getTime() - new Date(a.finishedAt || 0).getTime());

    // Current record is usually the first one, but try to match by sessionId when possible.
    const sessionId = result.sessionId ? String(result.sessionId) : null;
    let currentIndex = 0;
    if (sessionId) {
      const idx = history.findIndex((h) => String(h?.id || "") === sessionId);
      if (idx >= 0) currentIndex = idx;
    } else {
      const createdAt = Date.parse(result.createdAt || "");
      if (Number.isFinite(createdAt)) {
        const idx = history.findIndex((h) => {
          const t = Date.parse(String(h?.finishedAt || ""));
          return Number.isFinite(t) && Math.abs(t - createdAt) <= 2 * 60 * 1000;
        });
        if (idx >= 0) currentIndex = idx;
      }
    }
    const prev = history[currentIndex + 1] || null;
    return prev;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.createdAt, result.sessionId]);

  const priorExercises = Array.isArray(prior?.exercises)
    ? prior?.exercises
    : Array.isArray(prior?.items)
      ? prior?.items
      : [];
  const priorExerciseCount = priorExercises.length;
  const priorDurationMin = toNumber(prior?.durationMin);
  const hasCompare = Boolean(prior && (priorDurationMin != null || priorExerciseCount > 0));

  const compareSummary = useMemo(() => {
    if (!hasCompare) return null;
    const curM = durationMin ?? null;
    const prevM = priorDurationMin ?? null;

    const deltas: string[] = [];
    if (curM != null && prevM != null) {
      deltas.push(curM < prevM ? "Сегодня короче" : curM > prevM ? "Сегодня дольше" : "По времени похоже");
    }
    if (deltas.length === 0) return "Похоже на прошлый раз — это хорошо: стабильность даёт результат.";
    return deltas.join(", ") + ".";
  }, [durationMin, exerciseCount, hasCompare, priorDurationMin, priorExerciseCount]);

  return (
    <div style={page.outer}>
      <div style={page.inner}>
        <div style={s.sheet}>
          <section style={s.hero}>
            <div style={s.heroTitle}>{heroHeadline}</div>
            <div style={s.heroSubtitle}>
              Выполнено: {doneExercises}/{exerciseCount || "—"} упражнений
            </div>
            <div style={s.heroNote}>
              {heroSubline} {recordedSets > 0 ? `Записано ${recordedSets} подходов.` : ""}
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
            </div>

            <div style={s.importantCard}>
              <div style={s.importantTitle}>Самое важное</div>
              <div style={s.importantText}>{mostImportant}</div>
            </div>
          </section>

          <section style={s.section}>
            <div style={s.sectionTitle}>🎯 План на следующую тренировку</div>

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
                {weightUp.length > 0 && (
                  <div style={s.groupCard}>
                    <button style={s.groupHeaderBtn} onClick={() => setExpandUp((v) => !v)}>
                      <div>
                        <div style={s.groupTitle}>💪 Прибавляем вес ({weightUp.length})</div>
                        {!expandUp && (
                          <div style={s.groupPreview}>
                            {weightUp
                              .slice(0, 2)
                              .map((d) => String(d?.exerciseName || ""))
                              .filter(Boolean)
                              .join(", ")}
                            {weightUp.length > 2 ? ` и ещё ${weightUp.length - 2}` : ""}
                          </div>
                        )}
                      </div>
                      <div style={s.chev}>{expandUp ? "˅" : "›"}</div>
                    </button>
                    {expandUp && (
                      <div style={s.groupBody}>
                        {weightUp.slice(0, showMoreProgress ? 50 : 3).map((d, idx) => {
                          const rec = d?.recommendation;
                          const name = String(d?.exerciseName || rec?.exerciseId || `Упражнение ${idx + 1}`);
                          const currentWLabel = formatKg(getCurrentWeightFor(name));
                          const newWeightLabel = formatKg(toNumber(rec?.newWeight));
                          const targetUpper = getTargetUpperFor(name, rec);
                          return (
                            <div key={idx} style={s.exerciseRow}>
                              <div style={s.exerciseName}>{name}</div>
                              <div style={s.exerciseMeta}>
                                <div style={s.exerciseLineStrong}>
                                  Новый вес: {newWeightLabel || "—"}
                                  {currentWLabel && newWeightLabel ? ` (было ${currentWLabel})` : ""}
                                </div>
                                <div style={s.exerciseLineMuted}>Цель: {targetUpper ? `${targetUpper} повторений` : "верх диапазона"}</div>
                                <div style={s.exerciseWhy}>Почему: верх повторов стабилен — пора прибавить.</div>
                              </div>
                            </div>
                          );
                        })}
                        {weightUp.length > 3 && (
                          <button style={s.showMoreBtn} onClick={() => setShowMoreProgress((v) => !v)}>
                            {showMoreProgress ? "Свернуть" : `Показать ещё ${weightUp.length - 3}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {keep.length > 0 && (
                  <div style={s.groupCard}>
                    <button style={s.groupHeaderBtn} onClick={() => setExpandKeep((v) => !v)}>
                      <div>
                        <div style={s.groupTitle}>
                          {repsUp.length > 0 ? `🎯 Повышаем повторы (${keep.length})` : `→ Держим вес, добиваем повторы (${keep.length})`}
                        </div>
                        {!expandKeep && (
                          <div style={s.groupPreview}>
                            {repsUp.length > 0
                              ? "Добиваем верх повторов — следующий шаг: прибавим вес."
                              : "Цель: добить верх повторов, затем прибавим вес."}
                          </div>
                        )}
                      </div>
                      <div style={s.chev}>{expandKeep ? "˅" : "›"}</div>
                    </button>
                    {expandKeep && (
                      <div style={s.groupBody}>
                        {keep.slice(0, 30).map((d, idx) => {
                          const rec = d?.recommendation;
                          const name = String(d?.exerciseName || rec?.exerciseId || `Упражнение ${idx + 1}`);
                          const currentWLabel = formatKg(getCurrentWeightFor(name));
                          const targetUpper = getTargetUpperFor(name, rec);
                          const action = String(rec?.action || "maintain");
                          const repsTarget = Array.isArray(rec?.newRepsTarget) ? rec.newRepsTarget : null;
                          const targetLine =
                            action === "increase_reps" && repsTarget
                              ? `Цель: ${repsTarget[0]}–${repsTarget[1]} повторений`
                              : targetUpper
                                ? `Цель: дойти до ${targetUpper} повторений`
                                : "Цель: добить верх диапазона";
                          return (
                            <div key={idx} style={s.exerciseRow}>
                              <div style={s.exerciseName}>{name}</div>
                              <div style={s.exerciseMeta}>
                                <div style={s.exerciseLineStrong}>
                                  {currentWLabel ? `Вес: ${currentWLabel} — держим` : "Вес: держим"}
                                </div>
                                <div style={s.exerciseLineMuted}>{targetLine}</div>
                                <div style={s.exerciseWhy}>Почему: когда верх повторов стабилен — вес растёт безопасно.</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {loadDown.length > 0 && (
                  <div style={s.groupCard}>
                    <button style={s.groupHeaderBtn} onClick={() => setExpandDown((v) => !v)}>
                      <div>
                        <div style={s.groupTitle}>🛌 Разгрузка / упрощаем ({loadDown.length})</div>
                        {!expandDown && (
                          <div style={s.groupPreview}>Снижаем нагрузку, чтобы восстановиться и сохранить прогресс.</div>
                        )}
                      </div>
                      <div style={s.chev}>{expandDown ? "˅" : "›"}</div>
                    </button>
                    {expandDown && (
                      <div style={s.groupBody}>
                        {loadDown.slice(0, 20).map((d, idx) => {
                          const rec = d?.recommendation;
                          const name = String(d?.exerciseName || rec?.exerciseId || `Упражнение ${idx + 1}`);
                          const newWeightLabel = formatKg(toNumber(rec?.newWeight));
                          const currentWLabel = formatKg(getCurrentWeightFor(name));
                          return (
                            <div key={idx} style={s.exerciseRow}>
                              <div style={s.exerciseName}>{name}</div>
                              <div style={s.exerciseMeta}>
                                <div style={s.exerciseLineStrong}>
                                  {newWeightLabel && currentWLabel ? `Вес: ${currentWLabel} → ${newWeightLabel}` : "Нагрузка снижена"}
                                </div>
                                <div style={s.exerciseLineMuted}>Цель: техника и комфортное выполнение.</div>
                                <div style={s.exerciseWhy}>Почему: восстановление сейчас важнее, чем добавлять нагрузку.</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div style={s.coachCard}>
                  <div style={s.coachHead}>
                    <div style={s.coachAvatar} aria-hidden="true" />
                    <div style={s.coachHeadText}>Твой тренер</div>
                  </div>
                  <div style={s.coachMsg}>
                    {Array.isArray((coachReport as any)?.detail?.bullets) && (coachReport as any).detail.bullets.length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {(coachReport as any).detail.bullets.slice(0, 5).map((b: any, i: number) => (
                          <div key={i}>• {String(b || "").trim()}</div>
                        ))}
                      </div>
                    ) : Array.isArray((coachReport as any)?.telegram?.bullets) && (coachReport as any).telegram.bullets.length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {(coachReport as any).telegram.bullets.slice(0, 5).map((b: any, i: number) => (
                          <div key={i}>• {String(b || "").trim()}</div>
                        ))}
                      </div>
                    ) : coachJobId && (String(coachJob?.status || "").toLowerCase() === "pending" || String(coachJob?.status || "").toLowerCase() === "processing") ? (
                      "Готовлю разбор тренировки…"
                    ) : String(coachJob?.status || "").toLowerCase() === "failed" ? (
                      coachSummaryMessage({
                        hasLoadDown: loadDown.length > 0,
                        weightUpCount: weightUp.length,
                        repsUpCount: repsUp.length,
                      })
                    ) : (
                      coachSummaryMessage({
                        hasLoadDown: loadDown.length > 0,
                        weightUpCount: weightUp.length,
                        repsUpCount: repsUp.length,
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {hasCompare && (
              <div style={s.compareCard}>
                <div style={s.compareTitle}>🆚 Сравнение с прошлой тренировкой</div>
                <div style={s.compareGrid}>
                  <div style={s.compareCol}>
                    <div style={s.compareColTitle}>Сегодня</div>
                    <div style={s.compareLine}>{durationMin != null ? `${durationMin} мин` : "—"}</div>
                    <div style={s.compareLine}>{exerciseCount ? `${exerciseCount} упражнений` : "—"}</div>
                  </div>
                  <div style={s.compareDivider} />
                  <div style={s.compareCol}>
                    <div style={s.compareColTitle}>Прошлый раз</div>
                    <div style={s.compareLine}>{priorDurationMin != null ? `${priorDurationMin} мин` : "—"}</div>
                    <div style={s.compareLine}>{priorExerciseCount ? `${priorExerciseCount} упражнений` : "—"}</div>
                  </div>
                </div>
                {compareSummary ? <div style={s.compareHint}>{compareSummary}</div> : null}
              </div>
            )}

            {(summary || recordedSets > 0) && (
              <div style={s.detailsWrap}>
                <button style={s.detailsBtn} onClick={() => setShowDetails((v) => !v)}>
                  Подробнее {showDetails ? "˅" : "›"}
                </button>
                {showDetails && (
                  <div style={s.detailsBody}>
                    <div style={s.detailsLine}>Записано подходов: {recordedSets || 0}</div>
                    {summary ? (
                      <div style={s.detailsLine}>Рекомендаций: {details.length}</div>
                    ) : missingProgression ? (
                      <div style={s.detailsLine}>Рекомендации: готовятся…</div>
                    ) : null}
                  </div>
                )}
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
  metricSub: {
    marginTop: 6,
    fontSize: 12.5,
    color: "#6B7280",
    fontWeight: 800,
  } as CSSProperties,

  importantCard: {
    marginTop: 14,
    borderRadius: 18,
    padding: 16,
    background: "#FFFFFF",
    border: "1px solid #EEF0F6",
    boxShadow: "0 10px 30px rgba(17, 24, 39, 0.08)",
  } as CSSProperties,
  importantTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.2,
  } as CSSProperties,
  importantText: {
    marginTop: 8,
    fontSize: 14.5,
    color: "#6B7280",
    lineHeight: 1.35,
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
  groupCard: {
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #EEF0F6",
    boxShadow: "0 6px 24px rgba(17, 24, 39, 0.06)",
    overflow: "hidden",
  } as CSSProperties,
  groupHeaderBtn: {
    width: "100%",
    padding: 16,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    textAlign: "left",
  } as CSSProperties,
  groupTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.15,
  } as CSSProperties,
  groupPreview: {
    marginTop: 6,
    fontSize: 13.5,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,
  chev: {
    fontSize: 22,
    color: "#6B7280",
    fontWeight: 900,
    flex: "0 0 auto",
    lineHeight: 1,
  } as CSSProperties,
  groupBody: {
    padding: "0 16px 12px 16px",
  } as CSSProperties,
  exerciseRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 8,
    paddingTop: 12,
    marginTop: 12,
    borderTop: "1px solid #F3F4F6",
  } as CSSProperties,
  exerciseName: {
    fontSize: 15,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.1,
  } as CSSProperties,
  exerciseMeta: {
    display: "grid",
    gap: 6,
  } as CSSProperties,
  exerciseLineStrong: {
    fontSize: 14.5,
    color: "#111827",
    fontWeight: 800,
  } as CSSProperties,
  exerciseLineMuted: {
    fontSize: 13.5,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,
  exerciseWhy: {
    fontSize: 13.5,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,
  showMoreBtn: {
    marginTop: 12,
    padding: "10px 0",
    background: "transparent",
    border: "none",
    color: "#2563EB",
    fontSize: 13.5,
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
  } as CSSProperties,

  coachCard: {
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)",
    border: "1px solid #E5E7EB",
  } as CSSProperties,
  coachHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } as CSSProperties,
  coachHeadText: {
    fontSize: 14,
    fontWeight: 900,
    color: "#111827",
  } as CSSProperties,
  coachAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #E5E7EB 0%, #F3F4F6 100%)",
    border: "1px solid #EEF0F6",
    flex: "0 0 auto",
  } as CSSProperties,
  coachMsg: {
    marginTop: 10,
    fontSize: 14.5,
    color: "#374151",
    lineHeight: 1.45,
  } as CSSProperties,

  compareCard: {
    borderRadius: 18,
    padding: 16,
    background: "#FFFFFF",
    border: "1px solid #EEF0F6",
    boxShadow: "0 6px 24px rgba(17, 24, 39, 0.06)",
  } as CSSProperties,
  compareTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: "#111827",
    letterSpacing: -0.15,
  } as CSSProperties,
  compareGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1px 1fr",
    gap: 12,
    alignItems: "start",
  } as CSSProperties,
  compareDivider: {
    width: 1,
    height: "100%",
    background: "#EEF0F6",
    borderRadius: 1,
  } as CSSProperties,
  compareCol: {
    display: "grid",
    gap: 8,
  } as CSSProperties,
  compareColTitle: {
    fontSize: 12.5,
    fontWeight: 900,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  } as CSSProperties,
  compareLine: {
    fontSize: 14.5,
    fontWeight: 800,
    color: "#111827",
  } as CSSProperties,
  compareLineMuted: {
    fontSize: 13.5,
    fontWeight: 800,
    color: "#6B7280",
  } as CSSProperties,
  compareHint: {
    marginTop: 12,
    fontSize: 13.5,
    color: "#6B7280",
    lineHeight: 1.35,
  } as CSSProperties,

  detailsWrap: {
    marginTop: 10,
  } as CSSProperties,
  detailsBtn: {
    width: "100%",
    padding: "10px 0",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#2563EB",
    fontWeight: 900,
    fontSize: 13.5,
    textAlign: "left",
  } as CSSProperties,
  detailsBody: {
    marginTop: 8,
    borderRadius: 16,
    padding: 12,
    background: "#F9FAFB",
    border: "1px solid #EEF0F6",
  } as CSSProperties,
  detailsLine: {
    fontSize: 13.5,
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
