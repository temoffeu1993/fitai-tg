// webapp/src/lib/history.ts
// Single source of truth for workout history read / write / streak computation.

const HISTORY_KEY = "history_sessions_v1";

// ─── Types ──────────────────────────────────────────────────────────────────

export type HistSet = { reps?: number; weight?: number; done?: boolean };
export type HistItem = { name: string; pattern?: string; sets: HistSet[] };
export type HistSession = {
  id: string;
  finishedAt: string;
  title: string;
  location?: string;
  durationMin?: number;
  items: HistItem[];
  /** Client-side flag: "synced" after server confirm, "pending" before */
  _sync?: "pending" | "synced";
};

// ─── Read / Write ───────────────────────────────────────────────────────────

export function loadHistory(): HistSession[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveHistory(history: HistSession[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* quota exceeded — silently ignore */ }
}

// ─── Optimistic write (called BEFORE navigation) ───────────────────────────

/**
 * Add a session to history immediately with a client-generated id.
 * Returns the temporary id so the background-save can reconcile later.
 */
export function pushOptimisticSession(payload: {
  title: string;
  location?: string;
  durationMin?: number;
  exercises?: any[];
}): string {
  const tempId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const items: HistItem[] = (payload.exercises ?? []).map((ex: any) => ({
    name: ex.name ?? "",
    pattern: ex.pattern,
    sets: Array.isArray(ex.sets)
      ? ex.sets.map((s: any) => ({ reps: s.reps, weight: s.weight, done: s.done }))
      : [],
  }));

  const record: HistSession = {
    id: tempId,
    finishedAt: new Date().toISOString(),
    title: payload.title,
    location: payload.location,
    durationMin: payload.durationMin,
    items,
    _sync: "pending",
  };

  const history = loadHistory();
  saveHistory([record, ...history].slice(0, 500));
  return tempId;
}

/**
 * Called after successful server save.
 * Replaces the temp record with the real server id and marks it synced.
 */
export function reconcileSession(tempId: string, serverId: string | null): void {
  if (!serverId) return; // no valid server id → keep _sync: "pending"
  const history = loadHistory();
  const idx = history.findIndex((h) => h.id === tempId);
  if (idx === -1) return; // already gone or never existed
  history[idx].id = serverId;
  delete history[idx]._sync;
  saveHistory(history);
}

// ─── Date helpers ───────────────────────────────────────────────────────────

/** Local YYYY-MM-DD from a Date object (avoids UTC shift from toISOString). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Extract a local YYYY-MM-DD string from a history record. */
function sessionDate(s: { finishedAt?: string; completedAt?: string; date?: string }): string | null {
  const raw = (s as any).finishedAt || (s as any).completedAt || (s as any).date;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return toLocalDateStr(d);
}

// ─── Streak ─────────────────────────────────────────────────────────────────

const MAX_GAP_DAYS = 8; // allow up to 8 days gap (weekly + 1 day buffer)

/**
 * Count consecutive workout sessions (newest-first).
 * Each session counts as +1 (even multiple per day).
 * A gap of more than MAX_GAP_DAYS between two consecutive sessions breaks the streak.
 */
export function computeStreak(history: HistSession[]): number {
  // All session dates, sorted newest → oldest (keeps duplicates for same-day sessions)
  const dates = history
    .map(sessionDate)
    .filter((d): d is string => d !== null)
    .sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) return 0;

  let count = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff =
      (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) /
      (1000 * 60 * 60 * 24);
    if (diff > MAX_GAP_DAYS) break;
    count++;
  }
  return count;
}

// ─── Week progress ──────────────────────────────────────────────────────────

/** Local Monday YYYY-MM-DD for the current ISO week. */
function currentWeekMondayStr(): string {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  return toLocalDateStr(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  );
}

/** Local Sunday YYYY-MM-DD for the current ISO week. */
function currentWeekSundayStr(): string {
  const now = new Date();
  const sundayOffset = (7 - now.getDay()) % 7;
  return toLocalDateStr(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + sundayOffset)
  );
}

/** Read plannedWorkouts from schedule_cache_v1. */
function readPlannedWorkouts(): any[] {
  try {
    const raw = localStorage.getItem("schedule_cache_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.plannedWorkouts) ? parsed.plannedWorkouts : [];
  } catch {
    return [];
  }
}

/** Filter plannedWorkouts to those whose scheduledFor falls in the current Mon–Sun week. */
function thisWeekWorkouts(pw: any[]): any[] {
  const mon = currentWeekMondayStr();
  const sun = currentWeekSundayStr();
  return pw.filter((w: any) => {
    const d = String(w?.scheduledFor || "").slice(0, 10);
    return d >= mon && d <= sun;
  });
}

/**
 * Number of completed workouts in the current plan week.
 * Primary: plannedWorkouts with status "completed" in this Mon–Sun.
 * Fallback: unique history dates this week (covers case where plan cache is stale).
 * Returns whichever is higher so we never under-count.
 */
export function getWeekCompletedCount(history: HistSession[]): number {
  const planCompleted = thisWeekWorkouts(readPlannedWorkouts())
    .filter((w: any) => w.status === "completed").length;

  // Also count history sessions this week (Mon–Sun), not unique dates
  const mondayStr = currentWeekMondayStr();
  const sundayStr = currentWeekSundayStr();
  let historyCount = 0;
  for (const h of history) {
    const d = sessionDate(h);
    if (!d) continue;
    if (d >= mondayStr && d <= sundayStr) historyCount++;
  }

  return Math.max(planCompleted, historyCount);
}

/**
 * Returns a Set of ISO weekday indices (0=Mon … 6=Sun) on which
 * the user completed at least one workout this week.
 */
export function getWeekCompletedDays(history: HistSession[]): Set<number> {
  const mondayStr = currentWeekMondayStr();
  const sundayStr = currentWeekSundayStr();
  const days = new Set<number>();
  for (const h of history) {
    const d = sessionDate(h);
    if (!d) continue;
    if (d >= mondayStr && d <= sundayStr) {
      const jsDay = new Date(d).getDay(); // 0=Sun, 1=Mon …
      const isoDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon … 6=Sun
      days.add(isoDay);
    }
  }
  // Also include today (current workout just finished)
  const todayJs = new Date().getDay();
  days.add(todayJs === 0 ? 6 : todayJs - 1);
  return days;
}

/**
 * How many sessions per week the user has scheduled (target).
 * Counts scheduled + completed from this week's plannedWorkouts; falls back to onboarding.
 */
export function getSessionsPerWeek(): number {
  const weekPw = thisWeekWorkouts(readPlannedWorkouts());
  if (weekPw.length >= 2) {
    const active = weekPw.filter(
      (w: any) => w.status === "scheduled" || w.status === "completed"
    );
    if (active.length >= 2 && active.length <= 6) return active.length;
  }
  try {
    const onb = JSON.parse(localStorage.getItem("onb_summary") || "{}");
    const d = Number(onb?.schedule?.daysPerWeek);
    if (Number.isFinite(d) && d >= 2 && d <= 6) return d;
  } catch {}
  return 3;
}

// ─── Feature aggregation (unchanged, used by workout generation) ────────────

export function buildHistoryFeatures(history: HistSession[]) {
  const byName: Record<
    string,
    {
      sessions: number;
      lastDate?: string;
      last: { reps?: number; weight?: number } | null;
      bestWeight?: number;
      totalVolume?: number;
    }
  > = {};

  for (const s of history) {
    for (const it of s.items || []) {
      const key = it.name.trim().toLowerCase();
      byName[key] ||= { sessions: 0, last: null, totalVolume: 0 };
      byName[key].sessions++;
      byName[key].lastDate = s.finishedAt;

      const lastSet =
        [...(it.sets || [])].reverse().find((x) => x.reps || x.weight) || null;
      if (lastSet)
        byName[key].last = { reps: lastSet.reps, weight: lastSet.weight };

      for (const st of it.sets || []) {
        const w = Number(st.weight || 0),
          r = Number(st.reps || 0);
        if (w > 0) byName[key].bestWeight = Math.max(byName[key].bestWeight || 0, w);
        if (w > 0 && r > 0)
          byName[key].totalVolume = (byName[key].totalVolume || 0) + w * r;
      }
    }
  }

  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  const recentlyDone: string[] = [];
  for (const s of history) {
    const t = Date.parse(s.finishedAt || "");
    if (Number.isFinite(t) && t >= cutoff) {
      for (const it of s.items || []) {
        const key = it.name.trim().toLowerCase();
        if (!recentlyDone.includes(key)) recentlyDone.push(key);
      }
    }
  }

  return {
    byExercise: byName,
    recentlyDone,
    sessionsCount: history.length,
    lastSessionAt: history[0]?.finishedAt,
  };
}
