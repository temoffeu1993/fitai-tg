import { useEffect, useMemo, useState } from "react";
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

function actionLabel(action: string | undefined) {
  return (
    ({
      increase_weight: "Повысили вес",
      increase_reps: "Повысили повторы",
      maintain: "Оставили как есть",
      decrease_weight: "Снизили вес",
      deload: "Делоад",
      rotate_exercise: "Ротация упражнения",
    } as Record<string, string>)[action || ""] || "Рекомендация"
  );
}

function actionPill(action: string | undefined) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    increase_weight: { bg: "#DCFCE7", fg: "#166534", text: "↑ вес" },
    increase_reps: { bg: "#DCFCE7", fg: "#166534", text: "↑ повт." },
    maintain: { bg: "#E0F2FE", fg: "#075985", text: "→ держим" },
    decrease_weight: { bg: "#FFEDD5", fg: "#9A3412", text: "↓ вес" },
    deload: { bg: "#FFE4E6", fg: "#9F1239", text: "🛌 deload" },
    rotate_exercise: { bg: "#F3E8FF", fg: "#6B21A8", text: "🔄 ротация" },
  };
  const v = map[action || "maintain"] || map.maintain;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        padding: "6px 10px",
        borderRadius: 999,
        background: v.bg,
        color: v.fg,
        fontWeight: 700,
      }}
    >
      {v.text}
    </span>
  );
}

function formatDelta(rec: any) {
  if (!rec) return "";
  if (typeof rec.newWeight === "number" && Number.isFinite(rec.newWeight) && rec.newWeight > 0) return `${rec.newWeight} кг`;
  if (Array.isArray(rec.newRepsTarget) && rec.newRepsTarget.length === 2) return `${rec.newRepsTarget[0]}–${rec.newRepsTarget[1]} повт.`;
  return "";
}

function shortExplain(rec: any) {
  const explain = rec?.explain;
  if (!explain) return null;
  const ws = explain.totalWorkingSets;
  if (ws == null) return null;
  const lowerHits = explain.lowerHits ?? "?";
  const upperHits = explain.upperHits ?? "?";
  return `Рабочие: минимум ${lowerHits}/${ws}, верх ${upperHits}/${ws}`;
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
          <div style={hero.card}>
            <div style={hero.title}>Результат тренировки</div>
            <div style={hero.subtitle}>Нет данных о последней тренировке.</div>
            <button style={btn.primary} onClick={() => nav("/")}>На главный экран</button>
          </div>
        </div>
      </div>
    );
  }

  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];
  const payloadExercises: Array<any> = Array.isArray(result.payload?.exercises) ? result.payload.exercises : [];

  const missingProgression = !summary && job && job.status !== "done";

  return (
    <div style={page.outer}>
      <div style={page.inner}>
        <style>{css}</style>

        <section style={hero.card}>
          <div style={hero.topRow}>
            <button style={btn.back} onClick={() => nav("/")}>←</button>
            <div style={{ flex: 1 }} />
            <button
              style={btn.ghost}
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

          <div style={hero.badge}>Тренировка завершена</div>
          <div style={hero.title}>Отличная работа</div>
          <div style={hero.subtitle}>
            Мы сохранили тренировку и обновили рекомендации. Прогрессия учитывает только рабочие подходы (тяжёлые), разминка почти не влияет.
          </div>

          <div style={hero.metaRow}>
            <div style={hero.metaPill}>
              <div className="meta-label">Дата</div>
              <div className="meta-value">{new Date(result.createdAt).toLocaleString("ru-RU")}</div>
            </div>
            <div style={hero.metaPill}>
              <div className="meta-label">Длительность</div>
              <div className="meta-value">{result.payload?.durationMin ? `${result.payload.durationMin} мин` : "—"}</div>
            </div>
            <div style={hero.metaPill}>
              <div className="meta-label">Упражнений</div>
              <div className="meta-value">{payloadExercises.length || "—"}</div>
            </div>
          </div>

          {job && job.status !== "done" && (
            <div style={callout.info}>
              <div style={callout.title}>Обновляем прогрессию…</div>
              <div style={callout.text}>
                {job.status === "failed"
                  ? "Прогресс не обновился автоматически. Тренировка сохранена, веса не будут «скакать»."
                  : "Это может занять несколько секунд. Можно закрыть — всё догонится автоматически."}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  style={btn.secondary}
                  onClick={async () => {
                    try {
                      await pollOnce();
                    } catch {}
                  }}
                  disabled={!jobId}
                >
                  Обновить статус
                </button>
                {job?.status === "failed" && job?.lastError ? (
                  <button
                    style={btn.ghost}
                    onClick={() => {
                      alert("Техническая ошибка при обновлении прогрессии. Тренировка сохранена.\n\n" + String(job.lastError));
                    }}
                  >
                    Что случилось?
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {summary && (
            <div style={summaryCard.wrap}>
              <div style={summaryCard.item}>
                <div className="sum-label">Прогресс</div>
                <div className="sum-value">{Number(summary.progressedCount) || 0}</div>
              </div>
              <div style={summaryCard.item}>
                <div className="sum-label">Без изменений</div>
                <div className="sum-value">{Number(summary.maintainedCount) || 0}</div>
              </div>
              <div style={summaryCard.item}>
                <div className="sum-label">Снижение/делоад</div>
                <div className="sum-value">{Number(summary.deloadCount) || 0}</div>
              </div>
            </div>
          )}
        </section>

        <section style={card}>
          <div style={sectionTitle}>Рекомендации на следующий раз</div>
          {missingProgression && (
            <div style={{ color: "#334155", fontSize: 13, lineHeight: 1.35 }}>
              Пока готовим рекомендации. Ты можешь закрыть экран — они появятся автоматически.
            </div>
          )}
          {summary && details.length === 0 && (
            <div style={{ color: "#334155", fontSize: 13, lineHeight: 1.35 }}>
              Рекомендаций нет (скорее всего, в подходах не было повторов или упражнение не распознано).
            </div>
          )}

          {summary && details.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {details.slice(0, 30).map((d, idx) => {
                const rec = d?.recommendation;
                const explain = rec?.explain;
                const name = String(d?.exerciseName || rec?.exerciseId || `Упражнение ${idx + 1}`);
                const delta = formatDelta(rec);
                const why = String(rec?.reason || "").trim();
                const exLine = shortExplain(rec);

                const chips: string[] = [];
                if (explain?.antiOverreach) chips.push("Тяжёлый день");
                if (explain?.doNotPenalize) chips.push("Без штрафа");
                if (typeof explain?.plannedSets === "number" && typeof explain?.performedSets === "number") {
                  chips.push(`Подходы: ${explain.performedSets}/${explain.plannedSets}`);
                }
                if (typeof explain?.sessionRpe === "number") chips.push(`RPE ${explain.sessionRpe}`);

                return (
                  <div key={idx} style={recCard.card}>
                    <div style={recCard.head}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={recCard.name}>{name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          {actionPill(rec?.action)}
                          {delta ? <span style={recCard.delta}>{delta}</span> : null}
                        </div>
                      </div>
                      <div style={recCard.right}>
                        <div style={recCard.action}>{actionLabel(rec?.action)}</div>
                      </div>
                    </div>

                    {exLine ? <div style={recCard.metrics}>{exLine}</div> : null}
                    {chips.length > 0 && (
                      <div style={recCard.chips}>
                        {chips.map((c) => (
                          <span key={c} style={recCard.chip}>{c}</span>
                        ))}
                      </div>
                    )}
                    {why ? <div style={recCard.reason}>{why}</div> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={card}>
          <div style={sectionTitle}>Как работает прогрессия</div>
          <div style={text}>
            <div style={p}>
              Прогрессия повышает нагрузку только когда видит <b>стабильный</b> прогресс, а не разовый “выстрел”.
              Решение считается по <b>рабочим подходам</b> (тяжёлым), разминка почти не влияет.
            </div>
            <div style={p}>
              Если день был на пределе (высокий RPE или effort hard/max), мы можем <b>не повышать</b>, даже если ты добил верх диапазона.
              Если день был восстановительным (лёгкий по плану / плохой чек‑ин / сокращённая тренировка / мало рабочих подходов) — мы держим вес <b>без штрафов</b>.
            </div>
            <div style={p}>
              Если минимум повторов не добран несколько раз подряд — сначала даём попытки на том же весе, затем предлагаем <b>слегка снизить</b> вес, чтобы снова пойти вверх.
            </div>
          </div>
        </section>

        <section style={card}>
          <div style={sectionTitle}>Что важно заполнять</div>
          <ul style={list}>
            <li style={li}><b>Повторы</b> в каждом подходе — это основа решения.</li>
            <li style={li}><b>Вес</b> (для штанги/гантелей/тренажёров) — без веса прогрессия не будет менять нагрузку.</li>
            <li style={li}><b>Сложность</b> (RPE/effort) — защищает от “перегиба” в тяжёлые дни.</li>
          </ul>
        </section>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "6px 2px 0" }}>
          <button style={btn.primary} onClick={() => nav("/")}>На главный экран</button>
          <button style={btn.secondary} onClick={() => nav("/history")}>История</button>
        </div>

        <div style={{ height: 18 }} />
      </div>
    </div>
  );
}

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

const hero = {
  card: {
    position: "relative",
    padding: 18,
    borderRadius: 28,
    boxShadow: "0 10px 30px rgba(15, 23, 42, .10)",
    background: "rgba(255,255,255,.88)",
    border: "1px solid rgba(148,163,184,.25)",
    backdropFilter: "blur(10px)",
    marginBottom: 14,
  } as React.CSSProperties,
  topRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  } as React.CSSProperties,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(15, 23, 42, .08)",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    width: "fit-content",
  } as React.CSSProperties,
  title: {
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: -0.3,
    marginTop: 10,
    color: "#0f172a",
  } as React.CSSProperties,
  subtitle: {
    fontSize: 13.5,
    color: "#334155",
    lineHeight: 1.35,
    marginTop: 8,
  } as React.CSSProperties,
  metaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 14,
  } as React.CSSProperties,
  metaPill: {
    borderRadius: 18,
    padding: "10px 12px",
    background: "rgba(255,255,255,.9)",
    border: "1px solid rgba(148,163,184,.22)",
  } as React.CSSProperties,
};

const card: React.CSSProperties = {
  borderRadius: 24,
  padding: 16,
  background: "rgba(255,255,255,.86)",
  border: "1px solid rgba(148,163,184,.22)",
  boxShadow: "0 6px 18px rgba(15, 23, 42, .06)",
  backdropFilter: "blur(10px)",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#0f172a",
  letterSpacing: -0.2,
};

const summaryCard = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 12,
  } as React.CSSProperties,
  item: {
    borderRadius: 18,
    padding: "10px 12px",
    background: "rgba(15,23,42,.04)",
    border: "1px solid rgba(148,163,184,.20)",
  } as React.CSSProperties,
};

const recCard = {
  card: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(255,255,255,.92)",
    border: "1px solid rgba(148,163,184,.20)",
  } as React.CSSProperties,
  head: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  } as React.CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.15,
  } as React.CSSProperties,
  right: {
    display: "flex",
    alignItems: "flex-start",
  } as React.CSSProperties,
  action: {
    fontSize: 12,
    color: "#334155",
    fontWeight: 700,
    textAlign: "right",
    maxWidth: 170,
    lineHeight: 1.15,
  } as React.CSSProperties,
  delta: {
    display: "inline-flex",
    fontSize: 13,
    fontWeight: 900,
    color: "#0f172a",
  } as React.CSSProperties,
  metrics: {
    marginTop: 10,
    fontSize: 12.5,
    color: "#0f172a",
    fontWeight: 700,
  } as React.CSSProperties,
  reason: {
    marginTop: 8,
    fontSize: 13,
    color: "#334155",
    lineHeight: 1.3,
  } as React.CSSProperties,
  chips: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  } as React.CSSProperties,
  chip: {
    fontSize: 12,
    padding: "5px 9px",
    borderRadius: 999,
    background: "rgba(2,132,199,.10)",
    color: "#075985",
    fontWeight: 700,
    border: "1px solid rgba(2,132,199,.20)",
  } as React.CSSProperties,
};

const callout = {
  info: {
    marginTop: 12,
    borderRadius: 18,
    padding: "12px 12px",
    background: "rgba(2,132,199,.08)",
    border: "1px solid rgba(2,132,199,.20)",
  } as React.CSSProperties,
  title: { fontSize: 13, fontWeight: 900, color: "#075985" } as React.CSSProperties,
  text: { marginTop: 6, fontSize: 13, color: "#0f172a", lineHeight: 1.3 } as React.CSSProperties,
};

const btn = {
  back: {
    height: 38,
    minWidth: 44,
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,.35)",
    background: "rgba(255,255,255,.85)",
    cursor: "pointer",
    fontWeight: 900,
  } as React.CSSProperties,
  ghost: {
    height: 38,
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,.25)",
    background: "rgba(255,255,255,.65)",
    cursor: "pointer",
    fontWeight: 800,
    color: "#0f172a",
  } as React.CSSProperties,
  primary: {
    height: 44,
    padding: "0 16px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 900,
  } as React.CSSProperties,
  secondary: {
    height: 44,
    padding: "0 16px",
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,.35)",
    cursor: "pointer",
    background: "rgba(255,255,255,.85)",
    color: "#0f172a",
    fontWeight: 900,
  } as React.CSSProperties,
};

const text: React.CSSProperties = { marginTop: 10, fontSize: 13.5, color: "#334155", lineHeight: 1.4 };
const p: React.CSSProperties = { marginTop: 8 } as React.CSSProperties;

const list: React.CSSProperties = { marginTop: 10, paddingLeft: 18, color: "#334155", fontSize: 13.5, lineHeight: 1.4 };
const li: React.CSSProperties = { marginTop: 6 };

const css = `
.meta-label{ font-size: 11px; color: #64748b; font-weight: 800; }
.meta-value{ font-size: 13px; color: #0f172a; font-weight: 900; margin-top: 3px; }
.sum-label{ font-size: 11px; color: #64748b; font-weight: 800; }
.sum-value{ font-size: 18px; color: #0f172a; font-weight: 900; margin-top: 3px; }
`;
