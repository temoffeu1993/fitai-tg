import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCoachJob, getProgressionJob, getWorkoutSessionById } from "@/api/plan";
import mascotImg from "@/assets/robonew.webp";
import confetti from "canvas-confetti";

const LAST_RESULT_KEY = "last_workout_result_v1";
const HISTORY_KEY = "history_sessions_v1";

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
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const c = str.match(/(\d+)\s*,\s*(\d+)/);
  if (c) {
    const a = Number(c[1]);
    const b = Number(c[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(a, b);
  }
  const n = Number(str);
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

// Typewriter hook
function useTypewriter(text: string, speed = 28): string {
  const [displayed, setDisplayed] = useState("");
  const prevText = useRef("");

  useEffect(() => {
    if (text === prevText.current) return;
    prevText.current = text;
    setDisplayed("");
    if (!text) return;
    let i = 0;
    const tick = () => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i < text.length) setTimeout(tick, speed);
    };
    setTimeout(tick, speed);
  }, [text, speed]);

  return displayed;
}

/** Compute total tonnage (sum of weight * reps for all done sets) */
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

/** Compute tonnage from a history session */
function computeHistoryTonnage(session: HistorySession): number {
  const exercises = session?.exercises ?? session?.items ?? [];
  return computeTonnage(Array.isArray(exercises) ? exercises : []);
}

/** Detect personal records from current workout vs history */
function detectPRs(
  currentExercises: any[],
  history: HistorySession[],
  currentSessionId: string | null
): Array<{ name: string; weight: number; reps: number; type: "weight" | "reps" }> {
  const prs: Array<{ name: string; weight: number; reps: number; type: "weight" | "reps" }> = [];

  // Build best records from history (excluding current session)
  const bestWeight = new Map<string, number>();
  const bestReps = new Map<string, number>();

  for (const session of history) {
    if (currentSessionId && String(session?.id || "") === currentSessionId) continue;
    const exercises = session?.exercises ?? session?.items ?? [];
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

  // Compare current exercises
  for (const ex of currentExercises) {
    const name = String(ex?.name || ex?.exerciseName || "");
    const key = normalizeNameKey(name);
    if (!key || !name) continue;
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    let maxW = 0;
    let maxR = 0;
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

/** Map effort to a color for the effort bar */
function effortColor(effort: string | number | undefined): string {
  const e = typeof effort === "number" ? effort : typeof effort === "string" ? Number(effort) : 0;
  if (e >= 9) return "#ef4444"; // Red — very hard
  if (e >= 7) return "#f59e0b"; // Orange — moderate-hard
  if (e >= 5) return "#61d700"; // Green — moderate
  return "#94a3b8"; // Gray — easy / unknown
}

/** Milestone thresholds and labels */
function getMilestone(n: number): { current: number; next: number; label: string } | null {
  const milestones = [5, 10, 25, 50, 75, 100, 150, 200, 300, 500];
  for (const m of milestones) {
    if (n < m) return { current: n, next: m, label: `${m}-я тренировка` };
  }
  return null;
}

/** Celebration confetti */
function fireConfetti() {
  const end = Date.now() + 1600;
  const colors = ["#61d700", "#3B82F6", "#f59e0b", "#ef4444", "#8b5cf6"];

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    });

    if (Date.now() < end) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Haptic feedback */
function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(80);
    // Telegram WebApp haptic
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
  } catch {}
}

/** Contextual mascot phrases by scenario */
function mascotPhrase(scenario: string, sessionNumber: number | null): { hey: string; sub: string } {
  const n = sessionNumber ?? 0;
  if (scenario === "down") {
    return { hey: "Молодец! ", sub: "Восстановление — тоже тренировка" };
  }
  if (scenario === "up") {
    return { hey: "Ты стал сильнее! ", sub: n > 0 ? `${n}-я тренировка в копилке` : "Отличная работа" };
  }
  if (scenario === "reps") {
    return { hey: "Круто! ", sub: n > 0 ? `Тренировка #${n} выполнена` : "Выносливость растёт" };
  }
  return { hey: "Отлично! ", sub: n > 0 ? `${n}-я тренировка завершена` : "Стабильность — это сила" };
}

/** Format tonnage for display */
function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, "")} т`;
  return `${kg} кг`;
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

  // Fade-in for content blocks
  const [contentVisible, setContentVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setContentVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Listen for background save completing
  useEffect(() => {
    const onSaved = () => {
      const fresh = readStored();
      if (!fresh) return;
      setResult(fresh);
      setJob(fresh.progressionJob ?? null);
      setSummary(fresh.progression ?? null);
      setCoachJob(fresh.coachJob ?? null);
      setCoachReport(fresh.coachReport ?? null);
    };
    window.addEventListener("workout_saved", onSaved);
    return () => window.removeEventListener("workout_saved", onSaved);
  }, []);

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
    return () => { canceled = true; };
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
    if (!jobId) return null;
    const res = await getProgressionJob(jobId);
    const j = res?.job;
    if (j?.status) setJob({ id: jobId, status: String(j.status), lastError: j.lastError ?? null });
    if (j?.status === "done" && j?.result) setSummary(j.result);
    return j ? { status: j.status, result: j.result } : null;
  };

  const pollCoachOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!coachJobId) return null;
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
        } catch { }
      }
      if (!canceled) setPolling(false);
    })();
    return () => { canceled = true; };
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
        } catch { }
      }
      if (!canceled) setCoachPolling(false);
    })();
    return () => { canceled = true; };
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
      return { ...prev, progressionJob: job, progression: summary, coachJob, coachReport };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.lastError, summary, coachJob?.status, coachJob?.lastError, coachReport]);

  if (!result) {
    return (
      <div style={page.outer}>
        <div style={page.inner}>
          <div style={s.glassCard}>
            <div style={s.heroTitle}>Результат тренировки</div>
            <div style={{ ...s.bodyText, marginTop: 10 }}>Нет данных о последней тренировке.</div>
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

  return (
    <ResultContent
      result={result}
      job={job}
      summary={summary}
      coachJob={coachJob}
      coachReport={coachReport}
      contentVisible={contentVisible}
      jobId={jobId}
      pollOnce={pollOnce}
      nav={nav}
    />
  );
}

// ─── Result Content ────────────────────────────────────────────────────────────

function ResultContent(props: any) {
  const { result, job, summary, coachJob, coachReport, contentVisible, jobId, pollOnce, nav } = props;

  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];
  const payloadExercises: Array<any> = Array.isArray(result.payload?.exercises) ? result.payload.exercises : [];
  const sessionNumber = typeof result.sessionNumber === "number" && result.sessionNumber > 0 ? result.sessionNumber : null;

  const durationMin: number | null = toNumber(result.payload?.durationMin);
  const exerciseCount = payloadExercises.length;
  const doneExercises = payloadExercises.filter((ex: any) => ex?.done === true).length;
  const totalSets = payloadExercises.reduce((acc: number, ex: any) => acc + (Array.isArray(ex?.sets) ? ex.sets.length : 0), 0);

  // Tonnage
  const tonnage = useMemo(() => computeTonnage(payloadExercises), [payloadExercises]);
  const history = useMemo(() => readHistory(), []);
  const priorTonnage = useMemo(() => {
    const sorted = history.slice().sort((a, b) => new Date(b.finishedAt || 0).getTime() - new Date(a.finishedAt || 0).getTime());
    const sessionId = result.sessionId ? String(result.sessionId) : null;
    let currentIndex = 0;
    if (sessionId) {
      const idx = sorted.findIndex((h) => String(h?.id || "") === sessionId);
      if (idx >= 0) currentIndex = idx;
    }
    const prev = sorted[currentIndex + 1];
    return prev ? computeHistoryTonnage(prev) : 0;
  }, [history, result.sessionId]);
  const tonnageDelta = priorTonnage > 0 ? tonnage - priorTonnage : 0;

  // Progression groups
  const weightUp = details.filter((d: any) => String(d?.recommendation?.action || "") === "increase_weight");
  const repsUp = details.filter((d: any) => String(d?.recommendation?.action || "") === "increase_reps");
  const loadDown = details.filter((d: any) => {
    const a = String(d?.recommendation?.action || "");
    return a === "decrease_weight" || a === "deload" || a === "rotate_exercise";
  });
  const keep = details.filter((d: any) => {
    const a = String(d?.recommendation?.action || "");
    return a === "maintain";
  });

  const scenario =
    loadDown.length > 0 ? "down"
      : weightUp.length > 0 ? "up"
        : repsUp.length > 0 ? "reps"
          : "stable";

  // Personal records
  const prs = useMemo(
    () => detectPRs(payloadExercises, history, result.sessionId),
    [payloadExercises, history, result.sessionId]
  );

  // Milestone
  const milestone = sessionNumber != null ? getMilestone(sessionNumber) : null;

  // Streak (count consecutive recent sessions from history)
  const streak = useMemo(() => {
    const sorted = history.slice().sort((a, b) => new Date(b.finishedAt || 0).getTime() - new Date(a.finishedAt || 0).getTime());
    let count = 0;
    let prevDate: string | null = null;
    for (const session of sorted) {
      const d = session.finishedAt ? new Date(session.finishedAt).toISOString().slice(0, 10) : null;
      if (!d) continue;
      if (prevDate === d) continue; // same day
      if (prevDate) {
        const diff = (new Date(prevDate).getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 7) break; // gap too large
      }
      prevDate = d;
      count++;
    }
    return count;
  }, [history]);

  // Mascot phrase
  const phrase = mascotPhrase(scenario, sessionNumber);
  const typedHey = useTypewriter(phrase.hey, 35);
  const [subReady, setSubReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSubReady(true), phrase.hey.length * 35 + 100);
    return () => clearTimeout(t);
  }, [phrase.hey]);
  const typedSub = useTypewriter(subReady ? phrase.sub : "", 24);

  // Confetti + haptic on mount
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const t = setTimeout(() => {
      fireConfetti();
      haptic();
    }, 400);
    return () => clearTimeout(t);
  }, []);

  // Payload name map for getting current weight
  const payloadByName = useMemo(() => {
    const map = new Map<string, any>();
    for (const ex of payloadExercises) {
      const key = normalizeNameKey(ex?.name || ex?.exerciseName || "");
      if (key && !map.has(key)) map.set(key, ex);
    }
    return map;
  }, [payloadExercises]);

  const getCurrentWeightFor = (name: string): number | null => {
    const key = normalizeNameKey(name);
    const ex = payloadByName.get(key);
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    const weights = sets
      .map((st) => toNumber(st?.weight))
      .filter((w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0);
    return median(weights);
  };

  const getTargetUpperFor = (name: string, rec: any): number | null => {
    const key = normalizeNameKey(name);
    const ex = payloadByName.get(key);
    const fromRec = Array.isArray(rec?.newRepsTarget) ? toNumber(rec.newRepsTarget?.[1]) : null;
    return (fromRec != null ? Math.round(fromRec) : null) ?? parseUpperReps(ex?.reps) ?? 12;
  };

  const fadeStyle = (delayMs: number): CSSProperties => ({
    opacity: contentVisible ? 1 : 0,
    transform: contentVisible ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 420ms ease ${delayMs}ms, transform 420ms ease ${delayMs}ms`,
  });

  return (
    <div style={page.outer}>
      <div style={page.inner}>

        {/* ── 1. Mascot Celebration Header ────────────────────────────── */}
        <div style={{ ...s.mascotRow, ...fadeStyle(0) }}>
          <div style={s.mascotCircle}>
            <img src={mascotImg} alt="Моро" style={s.mascotImg} loading="eager" draggable={false} />
          </div>
          <div style={s.mascotText}>
            <div style={s.mascotHey}>{typedHey}</div>
            {phrase.sub && (
              <div style={{ ...s.mascotSub, opacity: subReady ? 1 : 0, transition: "opacity 200ms ease" }}>
                {typedSub}
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Hero Tonnage Card ───────────────────────────────────── */}
        <div style={{ ...s.glassCard, ...fadeStyle(80) }}>
          <div style={s.tonnageRow}>
            <div>
              <div style={s.tonnageLabel}>Общий тоннаж</div>
              <div style={s.tonnageValue}>{formatTonnage(tonnage)}</div>
            </div>
            {tonnageDelta !== 0 && (
              <div style={{
                ...s.tonnageDelta,
                color: tonnageDelta > 0 ? "#16a34a" : "#dc2626",
              }}>
                {tonnageDelta > 0 ? "+" : ""}{formatTonnage(Math.abs(tonnageDelta))}
              </div>
            )}
          </div>

          {/* Secondary stats row */}
          <div style={s.statsRow}>
            <div style={s.statItem}>
              <div style={s.statValue}>{durationMin != null ? `${durationMin}` : "—"}</div>
              <div style={s.statLabel}>мин</div>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <div style={s.statValue}>{doneExercises}/{exerciseCount}</div>
              <div style={s.statLabel}>упражнений</div>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <div style={s.statValue}>{totalSets}</div>
              <div style={s.statLabel}>подходов</div>
            </div>
          </div>
        </div>

        {/* ── 3. Streak + Milestone ──────────────────────────────────── */}
        {(streak > 1 || milestone) && (
          <div style={{ ...s.glassCard, ...fadeStyle(160), padding: 16 }}>
            {streak > 1 && (
              <div style={s.streakRow}>
                <div style={s.streakPills}>
                  {Array.from({ length: Math.min(streak, 7) }).map((_, i) => (
                    <div key={i} style={s.streakDotFilled} />
                  ))}
                  {streak < 7 && Array.from({ length: 7 - Math.min(streak, 7) }).map((_, i) => (
                    <div key={`e-${i}`} style={s.streakDotEmpty} />
                  ))}
                </div>
                <div style={s.streakLabel}>{streak} тренировок подряд</div>
              </div>
            )}
            {milestone && (
              <div style={{ marginTop: streak > 1 ? 14 : 0 }}>
                <div style={s.milestoneLabel}>
                  До "{milestone.label}": {milestone.next - milestone.current} осталось
                </div>
                <div style={s.milestoneBar}>
                  <div style={{
                    ...s.milestoneBarFill,
                    width: `${Math.min(100, (milestone.current / milestone.next) * 100)}%`,
                  }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 4. Personal Records ────────────────────────────────────── */}
        {prs.length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(220) }}>
            <div style={s.sectionTitle}>Личные рекорды</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {prs.map((pr, i) => (
                <div key={i} style={s.prRow}>
                  <div style={s.prBadge}>{pr.type === "weight" ? "W" : "R"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.prName}>{pr.name}</div>
                    <div style={s.prDetail}>
                      {pr.type === "weight" ? `${pr.weight} кг` : `${pr.reps} повторений`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Effort Breakdown ────────────────────────────────────── */}
        {payloadExercises.length > 0 && payloadExercises.some((ex: any) => toNumber(ex?.effort) != null) && (
          <div style={{ ...s.glassCard, ...fadeStyle(280) }}>
            <div style={s.sectionTitle}>Усилие по упражнениям</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {payloadExercises.map((ex: any, i: number) => {
                const effort = toNumber(ex?.effort);
                if (effort == null) return null;
                const name = String(ex?.name || ex?.exerciseName || `Упражнение ${i + 1}`);
                return (
                  <div key={i} style={s.effortRow}>
                    <div style={s.effortName}>{name}</div>
                    <div style={s.effortBarWrap}>
                      <div style={{ ...s.effortBarFill, width: `${Math.min(100, (effort / 10) * 100)}%`, background: effortColor(effort) }} />
                    </div>
                    <div style={{ ...s.effortValue, color: effortColor(effort) }}>{effort}/10</div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </div>
        )}

        {/* ── 6. Compact Progression ─────────────────────────────────── */}
        {summary && details.length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(340) }}>
            <div style={s.sectionTitle}>План на следующую</div>

            {weightUp.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={s.progressGroupLabel}>Прибавляем вес ({weightUp.length})</div>
                {weightUp.slice(0, 5).map((d: any, idx: number) => {
                  const rec = d?.recommendation;
                  const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const currentWLabel = formatKg(getCurrentWeightFor(name));
                  const newWeightLabel = formatKg(toNumber(rec?.newWeight));
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValue}>
                        {currentWLabel && newWeightLabel ? `${currentWLabel} → ${newWeightLabel}` : newWeightLabel || "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {repsUp.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={s.progressGroupLabel}>Повышаем повторы ({repsUp.length})</div>
                {repsUp.slice(0, 5).map((d: any, idx: number) => {
                  const rec = d?.recommendation;
                  const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const upper = getTargetUpperFor(name, rec);
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValue}>цель {upper} повт.</span>
                    </div>
                  );
                })}
              </div>
            )}

            {keep.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={s.progressGroupLabel}>Держим вес ({keep.length})</div>
                {keep.slice(0, 3).map((d: any, idx: number) => {
                  const name = String(d?.exerciseName || d?.recommendation?.exerciseId || `#${idx + 1}`);
                  const currentWLabel = formatKg(getCurrentWeightFor(name));
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValue}>{currentWLabel || "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {loadDown.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={s.progressGroupLabel}>Снижаем ({loadDown.length})</div>
                {loadDown.slice(0, 3).map((d: any, idx: number) => {
                  const rec = d?.recommendation;
                  const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const newWeightLabel = formatKg(toNumber(rec?.newWeight));
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValue}>{newWeightLabel || "разгрузка"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Progression loading / error states */}
        {!summary && job && (
          <div style={{ ...s.glassCard, ...fadeStyle(340) }}>
            <div style={s.sectionTitle}>План на следующую</div>
            {job.status === "failed" ? (
              <div style={{ marginTop: 10 }}>
                <div style={s.bodyText}>Не удалось обновить прогрессию. Тренировка сохранена.</div>
                <button
                  style={{ ...s.smallBtn, marginTop: 10 }}
                  onClick={async () => { try { await pollOnce(); } catch {} }}
                  disabled={!jobId}
                >
                  Обновить
                </button>
              </div>
            ) : (
              <div style={{ ...s.bodyText, marginTop: 10 }}>
                Готовим рекомендации...
              </div>
            )}
          </div>
        )}

        {/* ── 7. Coach Card ──────────────────────────────────────────── */}
        <div style={{ ...s.coachCard, ...fadeStyle(400) }}>
          <div style={s.coachHead}>
            <div style={s.coachAvatarWrap}>
              <img src={mascotImg} alt="Моро" style={s.coachAvatarImg} draggable={false} />
            </div>
            <div style={s.coachTitle}>Комментарий тренера</div>
          </div>
          <div style={s.coachMsg}>
            {Array.isArray((coachReport as any)?.detail?.bullets) && (coachReport as any).detail.bullets.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {(coachReport as any).detail.bullets.slice(0, 4).map((b: any, i: number) => (
                  <div key={i} style={s.coachBullet}>{String(b || "").trim()}</div>
                ))}
              </div>
            ) : Array.isArray((coachReport as any)?.telegram?.bullets) && (coachReport as any).telegram.bullets.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {(coachReport as any).telegram.bullets.slice(0, 4).map((b: any, i: number) => (
                  <div key={i} style={s.coachBullet}>{String(b || "").trim()}</div>
                ))}
              </div>
            ) : coachJob?.id && (String(coachJob?.status || "").toLowerCase() === "pending" || String(coachJob?.status || "").toLowerCase() === "processing") ? (
              <div style={s.coachBullet}>Готовлю разбор тренировки...</div>
            ) : (
              <div style={s.coachBullet}>
                {scenario === "down" ? "Сегодня бережный режим — это часть прогресса."
                  : scenario === "up" ? "Отлично! Техника и комфортный темп на новых весах."
                    : scenario === "reps" ? "Повторы растут — следующий шаг: прибавим вес."
                      : "Стабильность — тоже прогресс. Добивай верх повторов."}
              </div>
            )}
          </div>
        </div>

        {/* bottom spacer for sticky CTA */}
        <div style={{ height: 140 }} />
      </div>

      {/* ── 8. Sticky CTA ────────────────────────────────────────────── */}
      <div style={s.stickyWrap}>
        <div style={s.stickyInner}>
          <button
            style={s.ctaPrimary}
            onClick={() => {
              try { localStorage.removeItem(LAST_RESULT_KEY); } catch {}
              nav("/");
            }}
          >
            На главную
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
  outer: {
    minHeight: "100vh",
    width: "100%",
    padding: "20px 16px 0",
  },
  inner: {
    maxWidth: 760,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
};

const s: Record<string, CSSProperties> = {
  // ── Mascot header
  mascotRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "4px 4px 0",
  },
  mascotCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    overflow: "hidden",
    flexShrink: 0,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  mascotImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  mascotText: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  mascotHey: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
    minHeight: "1.2em",
  },
  mascotSub: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(15,23,42,0.55)",
    lineHeight: 1.3,
    minHeight: "1.3em",
  },

  // ── Glassmorphism card
  glassCard: {
    borderRadius: 24,
    padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
  } as CSSProperties,

  // ── Tonnage hero
  tonnageRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  tonnageLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(15,23,42,0.48)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  tonnageValue: {
    fontSize: 38,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.5,
    lineHeight: 1.1,
    marginTop: 4,
  },
  tonnageDelta: {
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1,
    padding: "6px 10px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.5)",
  },

  // ── Stats row
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 0,
    marginTop: 18,
    padding: "14px 0 2px",
    borderTop: "1px solid rgba(15,23,42,0.06)",
  },
  statItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(15,23,42,0.45)",
  },
  statDivider: {
    width: 1,
    height: 28,
    background: "rgba(15,23,42,0.08)",
    borderRadius: 1,
    flexShrink: 0,
  },

  // ── Streak
  streakRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  streakPills: {
    display: "flex",
    gap: 6,
  },
  streakDotFilled: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "0 1px 2px rgba(2,6,23,0.42), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
  },
  streakDotEmpty: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },

  // ── Milestone
  milestoneLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(15,23,42,0.55)",
  },
  milestoneBar: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    overflow: "hidden",
  },
  milestoneBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "0 1px 2px rgba(2,6,23,0.42), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
    transition: "width 600ms ease",
  },

  // ── Personal Records
  prRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  prBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 2px 6px rgba(245,158,11,0.3)",
  },
  prName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  prDetail: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "rgba(15,23,42,0.55)",
  },

  // ── Effort breakdown
  effortRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  effortName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0f172a",
    width: 90,
    flexShrink: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  effortBarWrap: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.12)",
    overflow: "hidden",
  },
  effortBarFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 500ms ease",
  },
  effortValue: {
    fontSize: 12,
    fontWeight: 800,
    width: 36,
    textAlign: "right" as const,
    flexShrink: 0,
  },

  // ── Compact progression
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  progressGroupLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(15,23,42,0.48)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  progressLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid rgba(15,23,42,0.04)",
    gap: 8,
  },
  progressLineName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  progressLineValue: {
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(15,23,42,0.55)",
    flexShrink: 0,
  },

  // ── Coach card
  coachCard: {
    borderRadius: 24,
    padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,245,250,0.75) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
  } as CSSProperties,
  coachHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  coachAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    overflow: "hidden",
    flexShrink: 0,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    padding: 1,
  },
  coachAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  coachTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0f172a",
  },
  coachMsg: {
    marginTop: 10,
    fontSize: 14,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  },
  coachBullet: {
    fontSize: 14,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  },

  // ── Hero title (for empty state)
  heroTitle: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.4,
    color: "#0f172a",
  },
  bodyText: {
    fontSize: 14.5,
    color: "rgba(15,23,42,0.55)",
    lineHeight: 1.4,
  },
  smallBtn: {
    height: 36,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    backdropFilter: "blur(18px)",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
  },

  // ── Sticky CTA
  stickyWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
    background: "linear-gradient(to top, rgba(245,245,247,0.96) 60%, rgba(245,245,247,0))",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  } as CSSProperties,
  stickyInner: {
    maxWidth: 760,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  ctaPrimary: {
    height: 52,
    width: "100%",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "0 1px 2px rgba(2,6,23,0.42), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: -0.1,
  },
  ctaSecondary: {
    height: 48,
    width: "100%",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.75)",
    cursor: "pointer",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 8px 24px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 15,
    letterSpacing: -0.1,
  } as CSSProperties,
};
