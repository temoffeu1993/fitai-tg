import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProgressionJob, getWorkoutSessionById } from "@/api/plan";
import { BodyIcon, getDayHighlight } from "@/components/BodyIcon";
import { ArrowRight } from "lucide-react";
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
  } catch { }
}

/** Contextual mascot phrases by scenario */


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
          coachJob: null,
          coachReport: null,
        };
        setResult(next);
        setJob(next.progressionJob ?? null);
        setSummary(next.progression ?? null);
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

  const pollOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!jobId) return null;
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
      <div style={page.outer}>
        <div style={page.inner}>
          <div style={s.glassCard}>
            <div style={s.heroTitle}>Результат тренировки</div>
            <div style={{ ...s.bodyText, marginTop: 10 }}>Нет данных о последней тренировке.</div>
            <div style={{ marginTop: 14 }}>
              <button style={{ ...s.ctaPrimarySystem, width: "auto", padding: "12px 24px" }} onClick={() => nav("/")}>
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
      contentVisible={contentVisible}
      jobId={jobId}
      pollOnce={pollOnce}
      nav={nav}
    />
  );
}

// ─── Result Content ────────────────────────────────────────────────────────────

function tonnageToMetaphor(kg: number): string {
  if (kg <= 0) return "Разминка для героя 🦸";
  if (kg < 50) return "Ощутимый разгон! Больше микроволновки 🥐";
  if (kg < 150) return "Отличный темп. Вес стиральной машины 🧺";
  if (kg < 300) return "Серьезный вес! Равен бурому медведю 🐻";
  if (kg < 600) return "Мощь! Суммарно это вес пианино 🎹";
  if (kg < 1200) return "Фантастика! Это вес легкового авто 🚗";
  if (kg < 2500) return "Железная воля! Весь гигантского внедорожника 🚙";
  if (kg < 3500) return "Машина! Ты поднял взрослого носорога 🦏";
  if (kg < 5000) return "Легенда! Суммарный вес азиатского слона 🐘";
  if (kg < 8000) return "Титан! Это вес Тираннозавра Рекса 🦖";
  return "Годзилла! Вагон груженого самосвала 🚛";
}

function ResultContent(props: any) {
  const { result, job, summary, contentVisible, jobId, pollOnce, nav } = props;

  const details: Array<any> = Array.isArray(summary?.details) ? summary.details : [];
  const payloadExercises: Array<any> = Array.isArray(result.payload?.exercises) ? result.payload.exercises : [];
  const sessionNumber = typeof result.sessionNumber === "number" && result.sessionNumber > 0 ? result.sessionNumber : null;

  const durationMin: number | null = toNumber(result.payload?.durationMin);
  const exerciseCount = payloadExercises.length;
  const doneExercises = payloadExercises.filter((ex: any) => ex?.done === true).length;
  const splitType = String(result.payload?.splitType || "full_body");
  const planLabel = String(result.payload?.label || result.payload?.name || "Тренировка");

  // Tonnage
  const tonnage = useMemo(() => computeTonnage(payloadExercises), [payloadExercises]);
  const history = useMemo(() => readHistory(), []);

  // Compute Delta Per Exercise
  const exerciseDeltas = useMemo(() => {
    const deltas = [];
    // Sort history oldest to newest to find latest before this one
    const sortedHistory = history.slice().sort((a, b) => new Date(a.finishedAt || 0).getTime() - new Date(b.finishedAt || 0).getTime());

    // Find history before current session
    let pastSessions = sortedHistory;
    if (result.sessionId) {
      const idx = sortedHistory.findIndex(h => String(h.id) === String(result.sessionId));
      if (idx !== -1) pastSessions = sortedHistory.slice(0, idx);
    }

    // Build map of last known volumes per exercise
    const lastVolumeMap = new Map<string, { vol: number, reps: number }>();
    for (const session of pastSessions) {
      const exs = session?.exercises ?? session?.items ?? [];
      for (const ex of exs) {
        const key = normalizeNameKey(ex?.name || ex?.exerciseName || "");
        if (!key) continue;
        let vol = 0; let totalReps = 0;
        const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
        for (const set of sets) {
          const w = toNumber(set?.weight) ?? 0;
          const r = toNumber(set?.reps) ?? 0;
          if (w > 0 && r > 0) {
            vol += (w * r);
            totalReps += r;
          }
        }
        if (vol > 0) lastVolumeMap.set(key, { vol, reps: totalReps });
      }
    }

    // Compare cur vs last
    for (const ex of payloadExercises) {
      const name = String(ex?.name || ex?.exerciseName || "");
      const key = normalizeNameKey(name);
      if (!name || !key || ex.done === false) continue;

      let curVol = 0; let curReps = 0;
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      for (const set of sets) {
        if (set.done === false) continue;
        const w = toNumber(set?.weight) ?? 0;
        const r = toNumber(set?.reps) ?? 0;
        if (w > 0 && r > 0) {
          curVol += (w * r);
          curReps += r;
        }
      }
      if (curVol === 0) continue;

      const last = lastVolumeMap.get(key);
      if (last) {
        const volDiff = curVol - last.vol;
        const repDiff = curReps - last.reps;
        deltas.push({ name, currentVolume: curVol, volDiff, repDiff });
      }
    }
    return deltas.sort((a, b) => b.volDiff - a.volDiff); // biggest volume growth first
  }, [payloadExercises, history, result.sessionId]);

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
  const keep = details.filter((d: any) => String(d?.recommendation?.action || "") === "maintain");

  // Personal records
  const prs = useMemo(
    () => detectPRs(payloadExercises, history, result.sessionId),
    [payloadExercises, history, result.sessionId]
  );

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

  const bodyHighlightStatus = getDayHighlight(splitType, planLabel);
  const highlightLabel = bodyHighlightStatus === "full" ? "Всё тело" : bodyHighlightStatus === "upper" ? "Верх тела" : "Низ тела";

  return (
    <div style={page.outer}>
      <div style={page.inner}>

        {/* ── 1. Hero Title / Top Row ────────────────────────────── */}
        <div style={{ ...fadeStyle(0), paddingTop: 10, paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={s.heroTitleSession}>{sessionNumber ? `Тренировка #${sessionNumber}` : "Тренировка завершена"}</div>
            <div style={s.heroTitleDate}>{new Date(result.createdAt).toLocaleDateString("ru-RU", { day: 'numeric', month: 'long' })}</div>
          </div>
          {streak > 1 && (
            <div style={s.streakBadge}>
              <span style={{ fontSize: 14 }}>🔥</span> {streak} подряд
            </div>
          )}
        </div>

        {/* ── 2. Top Stats & Body Map ───────────────────────────────────── */}
        <div style={{ ...s.dashGrid, ...fadeStyle(40) }}>

          <div style={s.glassCardCompact}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, height: "100%" }}>
              <BodyIcon highlight={bodyHighlightStatus} size={64} activeColor="#f97316" mutedColor="rgba(15,23,42,0.1)" />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={s.statValue}>{durationMin || "—"} <span style={s.statLabelSpan}>мин</span></div>
                <div style={s.statValue}>{doneExercises}/{exerciseCount} <span style={s.statLabelSpan}>упр</span></div>
                <div style={s.statBadgeLight}>Фокус: {highlightLabel}</div>
              </div>
            </div>
          </div>

        </div>

        {/* ── 3. Tonnage Gamification─────────────────────────────────── */}
        <div style={{ ...s.glassCard, ...fadeStyle(80) }}>
          <div style={s.sectionTitleSmall}>Абсолютный тоннаж</div>
          <div style={s.tonnageRow}>
            <div style={s.tonnageValueMain}>{formatTonnage(tonnage)}</div>
            {tonnageDelta !== 0 && (
              <div style={{ ...s.tonnageDeltaBadge, color: tonnageDelta > 0 ? "#16a34a" : "#64748b" }}>
                {tonnageDelta > 0 ? "+" : ""}{formatTonnage(Math.abs(tonnageDelta))} к прошлой
              </div>
            )}
          </div>
          {tonnage > 0 && (
            <div style={s.tonnageMetaphorSentence}>{tonnageToMetaphor(tonnage)}</div>
          )}
        </div>

        {/* ── 4. Personal Records ────────────────────────────────────── */}
        {prs.length > 0 && (
          <div style={{ ...fadeStyle(120) }}>
            <div style={{ ...s.sectionTitle, marginBottom: 12 }}>Награды дня</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {prs.map((pr, i) => (
                <div key={i} style={s.prRow}>
                  <div style={s.prBadge}>{pr.type === "weight" ? "🏆" : "🔥"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.prName}>{pr.type === "weight" ? "Новый рекорд веса" : "Рекорд выносливости"}</div>
                    <div style={s.prDetail}>
                      {pr.name} — {pr.type === "weight" ? `${pr.weight} кг` : `${pr.reps} повт.`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Actual Progress vs Last Session ───────────────────── */}
        {exerciseDeltas.filter(d => d.volDiff > 0 || d.repDiff > 0).length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(160) }}>
            <div style={{ ...s.sectionTitle, marginBottom: 12 }}>Прогресс к прошлому разу</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {exerciseDeltas.filter(d => d.volDiff > 0 || d.repDiff > 0).slice(0, 4).map((d, i) => (
                <div key={i} style={s.deltaRow}>
                  <div style={s.deltaName}>{d.name}</div>
                  <div style={s.deltaValues}>
                    {d.volDiff > 0 && <span style={s.deltaPillVolume}>↗️ +{Math.round(d.volDiff)} кг</span>}
                    {d.repDiff > 0 && <span style={s.deltaPillReps}>↗️ +{Math.round(d.repDiff)} повт</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 6. Algo Adjustments (Future Plan) ────────────────────── */}
        {summary && details.length > 0 ? (
          <div style={{ ...s.glassCard, ...fadeStyle(200) }}>
            <div style={{ ...s.sectionTitle, marginBottom: 16 }}>План на следующую сессию</div>

            {weightUp.length > 0 && (
              <div style={s.progGroup}>
                <div style={s.progressGroupLabel}>Повышаем вес ({weightUp.length})</div>
                {weightUp.slice(0, 5).map((d: any, idx: number) => {
                  const rec = d?.recommendation;
                  const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const currentWLabel = formatKg(getCurrentWeightFor(name));
                  const newWeightLabel = formatKg(toNumber(rec?.newWeight));
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValueBold}>
                        {currentWLabel && newWeightLabel ? `${currentWLabel} → ${newWeightLabel}` : newWeightLabel || "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {repsUp.length > 0 && (
              <div style={s.progGroup}>
                <div style={s.progressGroupLabel}>Больше повторов ({repsUp.length})</div>
                {repsUp.slice(0, 5).map((d: any, idx: number) => {
                  const rec = d?.recommendation;
                  const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const upper = getTargetUpperFor(name, rec);
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValueBold}>до {upper} повт.</span>
                    </div>
                  );
                })}
              </div>
            )}

            {keep.length > 0 && (
              <div style={s.progGroup}>
                <div style={s.progressGroupLabel}>Фиксируем ({keep.length})</div>
                {keep.slice(0, 3).map((d: any, idx: number) => {
                  const name = String(d?.exerciseName || d?.recommendation?.exerciseId || `#${idx + 1}`);
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={s.progressLineValue}>Держим рабочий</span>
                    </div>
                  );
                })}
              </div>
            )}

            {loadDown.length > 0 && (
              <div style={s.progGroup}>
                <div style={s.progressGroupLabel}>Разгрузка ({loadDown.length})</div>
                {loadDown.slice(0, 3).map((d: any, idx: number) => {
                  const rec = d?.recommendation;
                  const name = String(d?.exerciseName || rec?.exerciseId || `#${idx + 1}`);
                  const newWeightLabel = formatKg(toNumber(rec?.newWeight));
                  return (
                    <div key={idx} style={s.progressLine}>
                      <span style={s.progressLineName}>{name}</span>
                      <span style={{ ...s.progressLineValue, color: "#64748b" }}>{newWeightLabel || "Легкий режим"}</span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        ) : (
          (!summary && job && job.status === "failed") && (
            <button style={s.planBtn} onClick={async () => { try { await pollOnce(); } catch { } }}>
              Обновить план адаптации
            </button>
          )
        )}

        {/* bottom spacer for sticky CTA */}
        <div style={{ height: 140 }} />
      </div>

      {/* ── 8. System Sticky CTA (Aligned to Session/CheckIn) ────────────────────────────────────────────── */}
      <div style={s.stickyWrap}>
        <div style={s.stickyInner}>
          <button
            style={s.ctaPrimarySystem}
            className="dash-primary-btn"
            onClick={() => {
              try { localStorage.removeItem(LAST_RESULT_KEY); } catch { }
              nav("/");
            }}
          >
            На главную <ArrowRight size={18} strokeWidth={2.5} style={{ marginLeft: 4, opacity: 0.8 }} />
          </button>
          <button
            style={s.ctaSecondarySystem}
            onClick={() => nav("/progress")}
            className="dash-primary-btn"
          >
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
    padding: "16px 16px 0",
    // Relying on global var(--app-gradient) internally
  },
  inner: {
    maxWidth: 760,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
};

const s: Record<string, CSSProperties> = {
  // ── Hero Headers
  heroTitleSession: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.5,
    color: "#0f172a",
    lineHeight: 1.1,
  },
  heroTitleDate: {
    fontSize: 15,
    fontWeight: 600,
    color: "rgba(15,23,42,0.5)",
    marginTop: 4,
  },
  streakBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    background: "rgba(234, 88, 12, 0.12)",
    color: "#c2410c",
    fontWeight: 800,
    fontSize: 13,
    border: "1px solid rgba(234,88,12,0.2)",
  },

  // ── Dashboard Glassmorphism Card System (Matching PlanOne and Dashboard)
  glassCard: {
    borderRadius: 24,
    padding: "20px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  } as CSSProperties,
  glassCardCompact: {
    borderRadius: 24,
    padding: "16px 12px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  } as CSSProperties,
  dashGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },

  // ── High Level Stats
  statValue: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.5,
    lineHeight: 1.1,
  },
  statLabelSpan: {
    fontSize: 14,
    fontWeight: 700,
    color: "rgba(15,23,42,0.45)",
    letterSpacing: 0.2,
  },
  statBadgeLight: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1e1f22",
    padding: "4px 8px",
    background: "rgba(15,23,42,0.06)",
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 2,
  },

  // ── Tonnage
  sectionTitleSmall: {
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(15,23,42,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  tonnageRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  tonnageValueMain: {
    fontSize: 64,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -2,
    lineHeight: 1,
    textShadow: "0 1px 0 rgba(255,255,255,0.8)",
  },
  tonnageMetaphorSentence: {
    fontSize: 14.5,
    fontWeight: 600,
    color: "#1e1f22",
    marginTop: 12,
    lineHeight: 1.4,
    padding: "10px 14px",
    background: "linear-gradient(90deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)",
    borderRadius: 12,
    borderLeft: "3px solid #f59e0b",
  },
  tonnageDeltaBadge: {
    fontSize: 14,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.05)",
  },

  // ── Personal Records
  sectionTitle: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  prRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    background: "linear-gradient(90deg, rgba(253, 230, 138, 0.45) 0%, rgba(255, 255, 255, 0.5) 100%)",
    borderRadius: 20,
    border: "1px solid rgba(245, 158, 11, 0.3)",
    boxShadow: "0 6px 16px rgba(245, 158, 11, 0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
  },
  prBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)",
    fontSize: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 4px 10px rgba(245,158,11,0.25), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  prName: {
    fontSize: 15,
    fontWeight: 800,
    color: "#92400e",
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  prDetail: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "#b45309",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  // ── Deltas vs Last Session
  deltaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(15,23,42,0.05)",
    paddingBottom: 10,
  },
  deltaName: {
    fontSize: 14.5,
    fontWeight: 700,
    color: "#1e1f22",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  deltaValues: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  deltaPillVolume: {
    fontSize: 12,
    fontWeight: 800,
    color: "#16a34a",
    background: "rgba(22,163,74,0.1)",
    padding: "4px 8px",
    borderRadius: 8,
  },
  deltaPillReps: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0284c7",
    background: "rgba(2,132,199,0.1)",
    padding: "4px 8px",
    borderRadius: 8,
  },

  // ── Adjustments Plan
  progGroup: {
    marginBottom: 16,
  },
  progressGroupLabel: {
    fontSize: 12.5,
    fontWeight: 800,
    color: "rgba(15,23,42,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  progressLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid rgba(15,23,42,0.04)",
    gap: 12,
  },
  progressLineName: {
    fontSize: 14.5,
    fontWeight: 600,
    color: "#334155",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  progressLineValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15,23,42,0.45)",
    flexShrink: 0,
  },
  progressLineValueBold: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
    flexShrink: 0,
  },
  planBtn: {
    width: "100%",
    padding: "14px",
    background: "rgba(15, 23, 42, 0.05)",
    color: "#0f172a",
    border: "none",
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },

  // ── Bottom Nav Sticky
  stickyWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
    background: "linear-gradient(to top, rgba(245,245,247,0.96) 60%, rgba(245,245,247,0))",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    zIndex: 10,
  } as CSSProperties,
  stickyInner: {
    maxWidth: 760,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  ctaPrimarySystem: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    height: "auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 600,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    WebkitTapHighlightColor: "transparent",
    outline: "none",
  },
  ctaSecondarySystem: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 16,
    fontWeight: 700,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
    WebkitTapHighlightColor: "transparent",
  },
};
