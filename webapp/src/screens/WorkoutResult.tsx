import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProgressionJob, getWorkoutSessionById } from "@/api/plan";
import { ArrowRight, ChevronUp, ChevronDown, Minus } from "lucide-react";
import { loadHistory, type HistSession } from "@/lib/history";

const LAST_RESULT_KEY = "last_workout_result_v1";

type ProgressionJob = { id: string; status: string; lastError?: string | null } | null;

type StoredWorkoutResult = {
  version: 1;
  createdAt: string;
  sessionId: string | null;
  plannedWorkoutId: string | null;
  sessionNumber?: number | null;
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
  } catch { }
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
  const str = String(reps).trim();
  const m = str.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const c = str.match(/(\d+)\s*,\s*(\d+)/);
  if (c) {
    const a = Number(c[1]); const b = Number(c[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const n = Number(str);
  if (Number.isFinite(n) && n > 0) return Math.round(n + 2);
  return null;
}


function computeTonnage(exercises: any[]): number {
  let total = 0;
  for (const ex of exercises) {
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    for (const set of sets) {
      if (set?.done === false) continue;
      const w = toNumber(set?.weight) ?? 0;
      const r = toNumber(set?.reps) ?? 0;
      if (w > 0 && r > 0) total += w * r;
    }
  }
  return Math.round(total);
}

function detectPRs(
  currentExercises: any[],
  history: HistSession[],
  currentSessionId: string | null
): Array<{ name: string; weight: number; reps: number; type: "weight" | "reps" }> {
  const prs: Array<{ name: string; weight: number; reps: number; type: "weight" | "reps" }> = [];
  const bestWeight = new Map<string, number>();
  const bestReps = new Map<string, number>();
  for (const session of history) {
    if (currentSessionId && String(session?.id || "") === currentSessionId) continue;
    const exercises = (session as any)?.exercises ?? session?.items ?? [];
    if (!Array.isArray(exercises)) continue;
    for (const ex of exercises) {
      const key = normalizeNameKey(ex?.name || ex?.exerciseName || "");
      if (!key) continue;
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      for (const set of sets) {
        const w = toNumber(set?.weight);
        const r = toNumber(set?.reps);
        if (w != null && w > 0) bestWeight.set(key, Math.max(bestWeight.get(key) ?? 0, w));
        if (r != null && r > 0) bestReps.set(key, Math.max(bestReps.get(key) ?? 0, r));
      }
    }
  }
  for (const ex of currentExercises) {
    const name = String(ex?.name || ex?.exerciseName || "");
    const key = normalizeNameKey(name);
    if (!key || !name) continue;
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    let maxW = 0; let maxR = 0;
    for (const set of sets) {
      if (set?.done === false) continue;
      const w = toNumber(set?.weight) ?? 0;
      const r = toNumber(set?.reps) ?? 0;
      if (w > maxW) maxW = w;
      if (r > maxR) maxR = r;
    }
    const prevBestW = bestWeight.get(key) ?? 0;
    const prevBestR = bestReps.get(key) ?? 0;
    if (maxW > prevBestW && prevBestW > 0) {
      prs.push({ name, weight: maxW, reps: maxR, type: "weight" });
    } else if (maxR > prevBestR && prevBestR > 0 && maxW >= prevBestW) {
      prs.push({ name, weight: maxW, reps: maxR, type: "reps" });
    }
  }
  return prs.slice(0, 5);
}

// Near-PRs: exercises where current is >= 95% of best but not a full PR
function detectNearPRs(
  currentExercises: any[],
  history: HistSession[],
  currentSessionId: string | null,
  existingPrKeys: Set<string>
): Array<{ name: string; current: number; best: number; gap: number; type: "weight" | "reps" }> {
  const nearPrs: Array<{ name: string; current: number; best: number; gap: number; type: "weight" | "reps" }> = [];
  const bestWeight = new Map<string, number>();
  for (const session of history) {
    if (currentSessionId && String(session?.id || "") === currentSessionId) continue;
    const exercises = (session as any)?.exercises ?? session?.items ?? [];
    if (!Array.isArray(exercises)) continue;
    for (const ex of exercises) {
      const key = normalizeNameKey(ex?.name || ex?.exerciseName || "");
      if (!key) continue;
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      for (const set of sets) {
        const w = toNumber(set?.weight);
        if (w != null && w > 0) bestWeight.set(key, Math.max(bestWeight.get(key) ?? 0, w));
      }
    }
  }
  for (const ex of currentExercises) {
    const name = String(ex?.name || ex?.exerciseName || "");
    const key = normalizeNameKey(name);
    if (!key || !name || existingPrKeys.has(key)) continue;
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    let maxW = 0;
    for (const set of sets) {
      if (set?.done === false) continue;
      const w = toNumber(set?.weight) ?? 0;
      if (w > maxW) maxW = w;
    }
    const prevBestW = bestWeight.get(key) ?? 0;
    if (prevBestW > 0 && maxW > 0 && maxW < prevBestW && maxW >= prevBestW * 0.95) {
      nearPrs.push({ name, current: maxW, best: prevBestW, gap: prevBestW - maxW, type: "weight" });
    }
  }
  return nearPrs.sort((a, b) => a.gap - b.gap).slice(0, 3);
}

function getMilestone(n: number): { current: number; next: number; label: string } | null {
  const milestones = [5, 10, 25, 50, 75, 100, 150, 200, 300, 500];
  for (const m of milestones) {
    if (n < m) return { current: n, next: m, label: `${m}-я тренировка` };
  }
  return null;
}

function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, "")} т`;
  return `${kg} кг`;
}

function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(80);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
  } catch { }
}

function pluralizeExercises(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "упражнение";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "упражнения";
  return "упражнений";
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WorkoutResult() {
  const nav = useNavigate();
  const location = useLocation();

  const fromState: StoredWorkoutResult | null = (location.state as any)?.result || null;
  const urlSessionId = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      const id = sp.get("sessionId");
      return id && id.trim() ? id.trim() : null;
    } catch { return null; }
  }, [location.search]);

  const initial = useMemo(() => fromState || readStored(), [fromState]);
  const [result, setResult] = useState<StoredWorkoutResult | null>(initial);
  const [job, setJob] = useState<ProgressionJob>(initial?.progressionJob ?? null);
  const [summary, setSummary] = useState<any | null>(initial?.progression ?? null);
  const [polling, setPolling] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setContentVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onSaved = () => {
      const fresh = readStored();
      if (!fresh) return;
      setResult(fresh);
      setJob(fresh.progressionJob ?? null);
      setSummary(fresh.progression ?? null);
    };
    window.addEventListener("workout_saved", onSaved);
    return () => window.removeEventListener("workout_saved", onSaved);
  }, []);

  useEffect(() => {
    if (result) return;
    if (!urlSessionId) return;
    let canceled = false;
    void (async () => {
      try {
        const data = await getWorkoutSessionById(urlSessionId);
        if (canceled) return;
        const next: StoredWorkoutResult = {
          version: 1, createdAt: new Date().toISOString(),
          sessionId: data?.session?.id || urlSessionId, plannedWorkoutId: null,
          payload: data?.session?.payload ?? null,
          progression: data?.progressionJob?.result ?? null,
          progressionJob: data?.progressionJob?.id
            ? { id: String(data.progressionJob.id), status: String(data.progressionJob.status || "pending"), lastError: data.progressionJob.lastError ?? null }
            : null,
          coachJob: null, coachReport: null,
        };
        setResult(next); setJob(next.progressionJob ?? null); setSummary(next.progression ?? null);
      } catch { }
    })();
    return () => { canceled = true; };
  }, [result, urlSessionId]);

  useEffect(() => { if (result) writeStored(result); }, [result]);

  const jobId = job?.id ? String(job.id) : null;
  const needsPoll = Boolean(jobId && (!summary || job?.status !== "done") && job?.status !== "failed");

  const pollOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!jobId) return null;
    const res = await getProgressionJob(jobId);
    const j = res?.job;
    if (j?.status) setJob({ id: jobId, status: String(j.status), lastError: j.lastError ?? null });
    if (j?.status === "done" && j?.result) setSummary(j.result);
    return j ? { status: j.status, result: j.result } : null;
  };

  useEffect(() => {
    if (!result || !needsPoll || polling) return;
    setPolling(true);
    let canceled = false;
    void (async () => {
      for (let i = 0; i < 10; i++) {
        if (canceled) break;
        await new Promise((r) => setTimeout(r, 900 + Math.round(Math.random() * 900)));
        try {
          const j = await pollOnce();
          if (String(j?.status || "").toLowerCase() === "done" || String(j?.status || "").toLowerCase() === "failed") break;
        } catch { }
      }
      if (!canceled) setPolling(false);
    })();
    return () => { canceled = true; };
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
      return { ...prev, progressionJob: job, progression: summary };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.lastError, summary]);

  if (!result) {
    return (
      <div style={page.outer}><div style={page.inner}>
        <div style={s.glassCard}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>Результат тренировки</div>
          <div style={{ fontSize: 15, color: "rgba(15,23,42,0.55)", marginTop: 8 }}>Нет данных о последней тренировке.</div>
          <button style={{ ...s.ctaPrimary, marginTop: 16, width: "auto", padding: "12px 24px" }} className="dash-primary-btn" onClick={() => nav("/")}>
            На главную
          </button>
        </div>
      </div></div>
    );
  }

  return (
    <ResultContent result={result} job={job} summary={summary} contentVisible={contentVisible} jobId={jobId} pollOnce={pollOnce} nav={nav} />
  );
}

// ─── Result Content ────────────────────────────────────────────────────────────

function ResultContent(props: any) {
  const { result, job, summary, contentVisible, pollOnce, nav } = props;

  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];
  const payloadExercises: Array<any> = Array.isArray(result.payload?.exercises) ? result.payload.exercises : [];
  const sessionNumber = typeof result.sessionNumber === "number" && result.sessionNumber > 0 ? result.sessionNumber : null;

  const durationMin: number | null = toNumber(result.payload?.durationMin);
  const exerciseCount = payloadExercises.length;
  const doneExercises = payloadExercises.filter((ex: any) => ex?.done === true).length;

  // Tonnage
  const tonnage = useMemo(() => computeTonnage(payloadExercises), [payloadExercises]);
  const [history, setHistory] = useState(() => loadHistory());
  useEffect(() => {
    const reload = () => setHistory(loadHistory());
    const onStorage = (e: StorageEvent) => { if (e.key === "history_sessions_v1") reload(); };
    window.addEventListener("workout_saved", reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("workout_saved", reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Progression groups
  const weightUp = details.filter((d: any) => String(d?.recommendation?.action || "") === "increase_weight");
  const repsUp = details.filter((d: any) => String(d?.recommendation?.action || "") === "increase_reps");
  const loadDown = details.filter((d: any) => { const a = String(d?.recommendation?.action || ""); return a === "decrease_weight" || a === "deload" || a === "rotate_exercise"; });
  const keep = details.filter((d: any) => String(d?.recommendation?.action || "") === "maintain");

  // Personal records
  const prs = useMemo(() => detectPRs(payloadExercises, history, result.sessionId), [payloadExercises, history, result.sessionId]);
  const prKeys = useMemo(() => new Set(prs.map(pr => normalizeNameKey(pr.name))), [prs]);

  // Near-PRs (only when no actual PRs)
  const nearPrs = useMemo(() => {
    if (prs.length > 0) return [];
    return detectNearPRs(payloadExercises, history, result.sessionId, prKeys);
  }, [payloadExercises, history, result.sessionId, prs.length, prKeys]);

  // Milestone (show only when ≤3 away)
  const milestone = sessionNumber != null ? getMilestone(sessionNumber) : null;
  const showMilestone = milestone != null && (milestone.next - milestone.current) <= 3;

  const hasAdjustments = summary && details.length > 0;

  const payloadByName = useMemo(() => {
    const map = new Map<string, any>();
    for (const ex of payloadExercises) { const key = normalizeNameKey(ex?.name || ex?.exerciseName || ""); if (key && !map.has(key)) map.set(key, ex); }
    return map;
  }, [payloadExercises]);

  const getCurrentWeightFor = (name: string): number | null => {
    const ex = payloadByName.get(normalizeNameKey(name));
    const weights = (Array.isArray(ex?.sets) ? ex.sets : []).map((st: any) => toNumber(st?.weight)).filter((w: any): w is number => typeof w === "number" && Number.isFinite(w) && w > 0);
    return median(weights);
  };
  const getTargetUpperFor = (name: string, rec: any): number | null => {
    const ex = payloadByName.get(normalizeNameKey(name));
    const fromRec = Array.isArray(rec?.newRepsTarget) ? toNumber(rec.newRepsTarget?.[1]) : null;
    return (fromRec != null ? Math.round(fromRec) : null) ?? parseUpperReps(ex?.reps) ?? 12;
  };

  const fadeStyle = (delayMs: number): CSSProperties => ({
    opacity: contentVisible ? 1 : 0,
    transform: contentVisible ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 420ms ease ${delayMs}ms, transform 420ms ease ${delayMs}ms`,
  });

  // Haptic on mount
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return; firedRef.current = true;
    const t = setTimeout(() => haptic(), 300);
    return () => clearTimeout(t);
  }, []);

  // Recap line
  const recapParts: string[] = [];
  if (durationMin != null && durationMin > 0) recapParts.push(`${durationMin} мин`);
  recapParts.push(`${doneExercises} ${pluralizeExercises(doneExercises)}`);
  if (tonnage > 0) recapParts.push(formatTonnage(tonnage));
  const recapLine = recapParts.join(" · ");

  return (
    <div style={page.outer}>
      <style>{`
        .dash-primary-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; transition: transform 160ms ease, box-shadow 160ms ease; }
        .dash-primary-btn:active:not(:disabled) { transform: translateY(1px) scale(0.99) !important; }
        @keyframes resultPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
      <div style={page.inner}>

        {/* ── 1. Header ──────────────────────────────────────────── */}
        <div style={{ ...fadeStyle(0) }}>
          <div style={s.headerTitle}>{sessionNumber ? `Тренировка #${sessionNumber}` : "Тренировка завершена"}</div>
          <div style={s.headerDate}>{new Date(result.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</div>
        </div>

        {/* ── 2. Recap Line ──────────────────────────────────────── */}
        <div style={{ ...s.recapLine, ...fadeStyle(40) }}>
          {recapLine}
        </div>

        {/* ── 3. Personal Records ────────────────────────────────── */}
        {prs.length > 0 && (
          <div style={{ ...fadeStyle(80) }}>
            <div style={{ ...s.sectionTitle, marginBottom: 10 }}>🏅 Рекорды дня</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prs.map((pr, i) => (
                <div key={i} style={s.prRow}>
                  <div style={s.prBadge}>{pr.type === "weight" ? "🏆" : "🔥"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.prName}>{pr.type === "weight" ? "Новый рекорд веса" : "Рекорд повторений"}</div>
                    <div style={s.prDetail}>{pr.name} — {pr.type === "weight" ? `${pr.weight} кг` : `${pr.reps} повт.`}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3b. Near-PRs (when no actual PRs) ──────────────────── */}
        {prs.length === 0 && nearPrs.length > 0 && (
          <div style={{ ...fadeStyle(80) }}>
            <div style={{ ...s.sectionTitle, marginBottom: 10 }}>💪 Близко к рекорду!</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {nearPrs.map((np, i) => (
                <div key={i} style={s.nearPrRow}>
                  <div style={s.nearPrBadge}>⚡</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.nearPrName}>{np.name}</div>
                    <div style={s.nearPrDetail}>{np.current} кг — до рекорда {np.gap} кг</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Milestone (only when ≤3 away) ───────────────────── */}
        {showMilestone && milestone && (
          <div style={{ ...s.glassCard, ...fadeStyle(120), padding: 16 }}>
            <div style={s.milestoneRow}>
              <span style={{ fontSize: 20 }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div style={s.milestoneText}>До «{milestone.label}» — ещё {milestone.next - milestone.current}</div>
                <div style={s.milestoneBar}><div style={{ ...s.milestoneBarFill, width: `${Math.min(100, (milestone.current / milestone.next) * 100)}%` }} /></div>
              </div>
            </div>
          </div>
        )}

        {/* ── 5. Algo Adjustments ─────────────────────────────────── */}
        {hasAdjustments ? (
          <div style={{ ...s.glassCard, ...fadeStyle(160) }}>
            <div style={{ ...s.sectionTitle, marginBottom: 14 }}>⚙️ Что изменится в следующий раз</div>
            {weightUp.length > 0 && (
              <div style={s.adjGroup}>
                <div style={s.adjGroupLabel}><ChevronUp size={14} strokeWidth={2.5} color="#16a34a" /> Повышаем вес</div>
                {weightUp.slice(0, 5).map((d: any, idx: number) => {
                  const rec = d?.recommendation; const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const cur = formatKg(getCurrentWeightFor(name)); const next = formatKg(toNumber(rec?.newWeight));
                  return <div key={idx} style={s.adjLine}><span style={s.adjLineName}>{name}</span><span style={s.adjLineVal}>{cur && next ? `${cur} → ${next}` : next || "—"}</span></div>;
                })}
              </div>
            )}
            {repsUp.length > 0 && (
              <div style={s.adjGroup}>
                <div style={s.adjGroupLabel}><ChevronUp size={14} strokeWidth={2.5} color="#0284c7" /> Больше повторений</div>
                {repsUp.slice(0, 5).map((d: any, idx: number) => {
                  const rec = d?.recommendation; const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  return <div key={idx} style={s.adjLine}><span style={s.adjLineName}>{name}</span><span style={s.adjLineVal}>цель {getTargetUpperFor(name, rec)} повт.</span></div>;
                })}
              </div>
            )}
            {keep.length > 0 && (
              <div style={s.adjGroup}>
                <div style={s.adjGroupLabel}><Minus size={14} strokeWidth={2.5} color="rgba(15,23,42,0.4)" /> Фиксируем</div>
                {keep.slice(0, 3).map((d: any, idx: number) => {
                  const name = String(d?.exerciseName || d?.recommendation?.exerciseId || `#${idx + 1}`);
                  return <div key={idx} style={s.adjLine}><span style={s.adjLineName}>{name}</span><span style={s.adjLineVal}>без изменений</span></div>;
                })}
              </div>
            )}
            {loadDown.length > 0 && (
              <div style={s.adjGroup}>
                <div style={s.adjGroupLabel}><ChevronDown size={14} strokeWidth={2.5} color="#dc2626" /> Разгружаем</div>
                {loadDown.slice(0, 3).map((d: any, idx: number) => {
                  const rec = d?.recommendation; const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  return <div key={idx} style={s.adjLine}><span style={s.adjLineName}>{name}</span><span style={{ ...s.adjLineVal, color: "#64748b" }}>{formatKg(toNumber(rec?.newWeight)) || "лёгкий режим"}</span></div>;
                })}
              </div>
            )}
          </div>
        ) : (!summary && job && job.status !== "failed") ? (
          <div style={{ ...s.glassCard, ...fadeStyle(160), padding: "24px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "rgba(15,23,42,0.5)" }}>
              <span style={{ display: "inline-block", animation: "resultPulse 1.5s ease-in-out infinite" }}>⚙️</span>
              {" "}Анализирую тренировку...
            </div>
          </div>
        ) : (!summary && job?.status === "failed") ? (
          <button style={{ ...s.adjRetryBtn }} className="dash-primary-btn" onClick={async () => { try { await pollOnce(); } catch { } }}>
            Обновить план
          </button>
        ) : null}

        {/* bottom spacer */}
        <div style={{ height: 130 }} />
      </div>

      {/* ── 6. Sticky CTA ───────────────────────────────────────── */}
      <div style={s.stickyWrap}>
        <div style={s.stickyInner}>
          <button style={s.ctaPrimary} className="dash-primary-btn"
            onClick={() => { try { localStorage.removeItem(LAST_RESULT_KEY); } catch { } nav("/"); }}>
            На главную <ArrowRight size={18} strokeWidth={2.5} style={{ marginLeft: 4, opacity: 0.7 }} />
          </button>
          <button style={s.ctaSecondary} onClick={() => nav("/progress")}>
            Посмотреть прогресс
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const page: Record<string, CSSProperties> = {
  outer: { minHeight: "100vh", width: "100%", padding: "16px 16px 0" },
  inner: {
    maxWidth: 720, margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex", flexDirection: "column", gap: 14,
    padding: "calc(env(safe-area-inset-top, 0px)) 0 0",
  },
};

const s: Record<string, CSSProperties> = {
  // ── Header
  headerTitle: { fontSize: 26, fontWeight: 900, color: "#0f172a", letterSpacing: -0.5, lineHeight: 1.1 },
  headerDate: { fontSize: 15, fontWeight: 600, color: "rgba(15,23,42,0.5)", marginTop: 4 },

  // ── Recap Line
  recapLine: {
    fontSize: 15, fontWeight: 500, color: "rgba(15,23,42,0.45)", lineHeight: 1.4,
    padding: "0 2px",
  },

  // ── Glass Card (Dashboard token)
  glassCard: {
    borderRadius: 24, padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
  } as CSSProperties,

  // ── Section Title
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: -0.2 },

  // ── Personal Records
  prRow: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
    background: "linear-gradient(90deg, rgba(253,230,138,0.4) 0%, rgba(255,255,255,0.5) 100%)",
    borderRadius: 20, border: "1px solid rgba(245,158,11,0.25)",
    boxShadow: "0 4px 12px rgba(245,158,11,0.08)",
  },
  prBadge: {
    width: 40, height: 40, borderRadius: 14,
    background: "linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)",
    fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    boxShadow: "0 2px 6px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  prName: { fontSize: 14.5, fontWeight: 800, color: "#92400e", marginBottom: 1 },
  prDetail: { fontSize: 13, fontWeight: 600, color: "#b45309", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },

  // ── Near-PRs
  nearPrRow: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
    background: "linear-gradient(90deg, rgba(219,234,254,0.5) 0%, rgba(255,255,255,0.5) 100%)",
    borderRadius: 20, border: "1px solid rgba(59,130,246,0.2)",
    boxShadow: "0 4px 12px rgba(59,130,246,0.06)",
  },
  nearPrBadge: {
    width: 40, height: 40, borderRadius: 14,
    background: "linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%)",
    fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    boxShadow: "0 2px 6px rgba(59,130,246,0.15), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  nearPrName: { fontSize: 14.5, fontWeight: 800, color: "#1e40af", marginBottom: 1 },
  nearPrDetail: { fontSize: 13, fontWeight: 600, color: "#3b82f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },

  // ── Milestone
  milestoneRow: { display: "flex", alignItems: "center", gap: 12 },
  milestoneText: { fontSize: 14, fontWeight: 700, color: "rgba(15,23,42,0.65)", marginBottom: 6 },
  milestoneBar: { height: 6, borderRadius: 999, background: "rgba(15,23,42,0.06)", overflow: "hidden" },
  milestoneBarFill: {
    height: "100%", borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    transition: "width 600ms ease",
  },

  // ── Adjustments
  adjGroup: { marginBottom: 14 },
  adjGroupLabel: { display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: "rgba(15,23,42,0.5)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 },
  adjLine: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(15,23,42,0.04)", gap: 10 },
  adjLineName: { fontSize: 14, fontWeight: 600, color: "#334155", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  adjLineVal: { fontSize: 13.5, fontWeight: 800, color: "#0f172a", flexShrink: 0 },
  adjRetryBtn: { width: "100%", padding: 14, background: "rgba(15,23,42,0.05)", color: "#0f172a", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" },

  // ── Sticky CTA
  stickyWrap: { position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, rgba(245,245,247,0.96) 60%, rgba(245,245,247,0))", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", zIndex: 10 } as CSSProperties,
  stickyInner: { maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column" as const, gap: 8 },
  ctaPrimary: {
    width: "100%", borderRadius: 16, padding: "16px 18px", display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: "1px solid #1e1f22", background: "#1e1f22", color: "#fff", fontWeight: 600, fontSize: 17, cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)", WebkitTapHighlightColor: "transparent", outline: "none",
  },
  ctaSecondary: {
    width: "100%", border: "none", background: "transparent", color: "#1e1f22", fontSize: 15, fontWeight: 700,
    padding: "12px 16px", cursor: "pointer", textAlign: "center" as const, WebkitTapHighlightColor: "transparent",
  },
};
