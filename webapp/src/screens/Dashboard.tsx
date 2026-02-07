// webapp/src/screens/Dashboard.tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { getGamificationSummary } from "@/api/progress";
import { getScheduleOverview, type PlannedWorkout, type ScheduleByDate } from "@/api/schedule";
import { getSelectedScheme, type WorkoutScheme } from "@/api/schemes";
import {
  EMPTY_GAMIFICATION_SUMMARY,
  buildGamificationSummaryFromCounts,
  type GamificationSummary,
} from "@/lib/gamification";
import { fireHapticImpact } from "@/utils/haptics";
import { resolveDayCopy } from "@/utils/dayLabelCopy";
import {
  getSchemeDisplayData,
  type UserContext,
  type UserGoal,
  type ExperienceLevel,
  type Location,
  type SplitType,
} from "@/utils/getSchemeDisplayData";

import robotImg from "../assets/morobot.png";
import tyagaImg from "@/assets/tyaga.webp";
import zhimImg from "@/assets/zhim.webp";
import nogiImg from "@/assets/nogi.webp";
import mascotImg from "@/assets/robonew.webp";
import sredneImg from "@/assets/sredne.webp";

const ROBOT_SRC = robotImg;
const MASCOT_SRC = mascotImg;
const BACK_MASCOT_SRC = tyagaImg;
const CHEST_MASCOT_SRC = zhimImg;
const LEGS_MASCOT_SRC = nogiImg;
const REST_MASCOT_SRC = sredneImg;
const PROGRESS_CTA_BAR_METRICS = [
  { track: 52, fill: 0.62 },
  { track: 72, fill: 0.8 },
  { track: 60, fill: 0.58 },
  { track: 78, fill: 0.9 },
  { track: 66, fill: 0.72 },
];

const HISTORY_KEY = "history_sessions_v1";
const SCHEDULE_CACHE_KEY = "schedule_cache_v1";

const DAY_NAMES_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const DATE_ITEM_W = 64;
const DATE_COUNT = 37;
const DATE_PAST_DAYS = 7;
const DATE_DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DASH_AVATAR_SIZE = 56;
const VALID_USER_GOALS: UserGoal[] = [
  "lose_weight",
  "build_muscle",
  "athletic_body",
  "health_wellness",
];
const VALID_EXPERIENCE_LEVELS: ExperienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
];
const VALID_LOCATIONS: Location[] = ["gym", "home_no_equipment", "home_with_gear"];
const VALID_SPLIT_TYPES: SplitType[] = [
  "full_body",
  "upper_lower",
  "push_pull_legs",
  "conditioning",
  "bro_split",
];

function buildDsDates(count: number, offsetDays: number) {
  const now = new Date();
  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i - offsetDays);
    return {
      date: d,
      dow: DATE_DOW[d.getDay()],
      day: d.getDate(),
      idx: i,
      isToday: d.getTime() === todayKey,
    };
  });
}

// ============================================================================
// TYPES & HELPERS
// ============================================================================

type HistorySnapshot = {
  total: number;
  lastCompletedAt: number | null;
  completedDates: string[];
};

type JsonRecord = Record<string, unknown>;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readOnboardingSummary(): JsonRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("onb_summary");
    if (!raw) return null;
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toUserGoal(value: unknown): UserGoal {
  return typeof value === "string" && VALID_USER_GOALS.includes(value as UserGoal)
    ? (value as UserGoal)
    : "athletic_body";
}

function toExperienceLevel(value: unknown): ExperienceLevel {
  return typeof value === "string" && VALID_EXPERIENCE_LEVELS.includes(value as ExperienceLevel)
    ? (value as ExperienceLevel)
    : "beginner";
}

function toLocation(value: unknown): Location {
  return typeof value === "string" && VALID_LOCATIONS.includes(value as Location)
    ? (value as Location)
    : "gym";
}

function toOptionalLocation(value: unknown): Location | null {
  return typeof value === "string" && VALID_LOCATIONS.includes(value as Location)
    ? (value as Location)
    : null;
}

function toSplitType(value: unknown): SplitType {
  return typeof value === "string" && VALID_SPLIT_TYPES.includes(value as SplitType)
    ? (value as SplitType)
    : "full_body";
}

function toLocations(value: unknown): Location[] {
  if (!Array.isArray(value)) return [];
  const out: Location[] = [];
  value.forEach((item) => {
    const location = toOptionalLocation(item);
    if (location && !out.includes(location)) out.push(location);
  });
  return out;
}

const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value);

function normalizeScheduleDates(
  dates: Record<string, { time?: string }> | null | undefined
): ScheduleByDate {
  if (!dates) return {};
  const out: ScheduleByDate = {};
  Object.entries(dates).forEach(([iso, entry]) => {
    if (entry && isValidTime(entry.time ?? "")) {
      out[iso] = { time: entry.time as string };
    }
  });
  return out;
}

function readScheduleCache() {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const planned = Array.isArray(parsed?.plannedWorkouts) ? parsed.plannedWorkouts : [];
    const dates = normalizeScheduleDates(parsed?.scheduleDates);
    return { plannedWorkouts: planned, scheduleDates: dates };
  } catch {
    return null;
  }
}

function writeScheduleCache(plannedWorkouts: PlannedWorkout[], scheduleDates: ScheduleByDate) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SCHEDULE_CACHE_KEY,
      JSON.stringify({ plannedWorkouts, scheduleDates, ts: Date.now() })
    );
  } catch {}
}

function formatDuration(minutes?: number | null) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "";
  const rounded = Math.round(total / 10) * 10;
  return `${rounded} мин`;
}

function formatWorkoutCountRu(count: number) {
  const n = Math.abs(Math.trunc(count));
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n} тренировка`;
  if (rem10 >= 2 && rem10 <= 4 && (rem100 < 12 || rem100 > 14)) return `${n} тренировки`;
  return `${n} тренировок`;
}

function ClockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="12" r="8.5" stroke="#1e1f22" />
      <path d="M12 7.5v5l3.5 2" stroke="#1e1f22" />
    </svg>
  );
}

function DumbbellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M4 9v6" stroke="#1e1f22" />
      <path d="M7 8v8" stroke="#1e1f22" />
      <path d="M17 8v8" stroke="#1e1f22" />
      <path d="M20 9v6" stroke="#1e1f22" />
      <path d="M7 12h10" stroke="#1e1f22" />
    </svg>
  );
}

function datePart(value?: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function getWeekDays(): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function collectAssignedDateKeys(
  planned: PlannedWorkout[],
  scheduleByDate: ScheduleByDate
): string[] {
  const set = new Set<string>();
  planned
    .filter((w) => w.status === "scheduled")
    .forEach((w) => {
      const iso = datePart(w.scheduledFor);
      if (iso) set.add(iso);
    });
  Object.keys(scheduleByDate || {}).forEach((iso) => {
    if (iso) set.add(iso);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function resolvePreferredDateIndex(
  dsDates: Array<{ date: Date }>,
  planned: PlannedWorkout[],
  scheduleByDate: ScheduleByDate,
  fallbackIdx: number
): number {
  const assigned = collectAssignedDateKeys(planned, scheduleByDate);
  if (!assigned.length) return fallbackIdx;
  const today = toISODate(new Date());
  const preferredIso = assigned.find((iso) => iso >= today) || assigned[0];
  const idx = dsDates.findIndex((item) => toISODate(item.date) === preferredIso);
  return idx >= 0 ? idx : fallbackIdx;
}

function readHistorySnapshot(): HistorySnapshot {
  if (typeof window === "undefined")
    return { total: 0, lastCompletedAt: null, completedDates: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw))
      return { total: 0, lastCompletedAt: null, completedDates: [] };

    let lastCompletedAt: number | null = null;
    const completedDatesSet = new Set<string>();

    for (const rec of raw) {
      const dateValue = rec?.finishedAt || rec?.completedAt || rec?.date;
      const ts = dateValue ? new Date(dateValue).getTime() : NaN;
      if (Number.isFinite(ts)) {
        if (lastCompletedAt == null || ts > lastCompletedAt) lastCompletedAt = ts;
        completedDatesSet.add(toISODate(new Date(ts)));
      }
    }

    return {
      total: raw.length,
      lastCompletedAt,
      completedDates: Array.from(completedDatesSet),
    };
  } catch {
    return { total: 0, lastCompletedAt: null, completedDates: [] };
  }
}

/**
 * Calculate week streak: consecutive weeks where user completed ALL planned workouts.
 * A week is Mon-Sun. We check backwards from current week.
 */
function calculateWeekStreak(
  completedDates: string[],
  plannedWorkouts: PlannedWorkout[],
  daysPerWeek: number
): number {
  if (daysPerWeek <= 0) return 0;

  const completedSet = new Set(completedDates);
  const now = new Date();

  // Get Monday of current week
  const dayOfWeek = now.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - mondayOffset);
  currentMonday.setHours(0, 0, 0, 0);

  let streak = 0;
  let weekMonday = new Date(currentMonday);

  // Check up to 52 weeks back
  for (let w = 0; w < 52; w++) {
    const weekStart = new Date(weekMonday);
    const weekEnd = new Date(weekMonday);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Count completed workouts this week
    let weekCompleted = 0;
    for (let d = 0; d < 7; d++) {
      const checkDate = new Date(weekStart);
      checkDate.setDate(checkDate.getDate() + d);
      const iso = toISODate(checkDate);
      if (completedSet.has(iso)) {
        weekCompleted++;
      }
    }

    // For current week, don't count yet (it's in progress)
    if (w === 0) {
      weekMonday.setDate(weekMonday.getDate() - 7);
      continue;
    }

    // Check if week was fully completed
    if (weekCompleted >= daysPerWeek) {
      streak++;
      weekMonday.setDate(weekMonday.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

// ============================================================================
// PRELOAD
// ============================================================================

const preloadedImages = new Set<string>();
function ensureImagePreloaded(src: string, tag: string) {
  if (preloadedImages.has(src)) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!src) return;
  preloadedImages.add(src);
  try {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    link.setAttribute("data-preload-img", tag);
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
  } catch {}
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}
ensureImagePreloaded(ROBOT_SRC, "robot");
ensureImagePreloaded(BACK_MASCOT_SRC, "day-back");
ensureImagePreloaded(CHEST_MASCOT_SRC, "day-chest");
ensureImagePreloaded(LEGS_MASCOT_SRC, "day-legs");
ensureImagePreloaded(REST_MASCOT_SRC, "day-rest");

// ============================================================================
// IDENTITY
// ============================================================================

function resolveTelegramName() {
  try {
    const profileData = localStorage.getItem("profile");
    if (!profileData) return "Гость";
    const p = JSON.parse(profileData);
    if (p && typeof p === "object") {
      if (p.first_name && typeof p.first_name === "string" && p.first_name.trim()) {
        return p.first_name.trim();
      }
      if (p.username && typeof p.username === "string" && p.username.trim()) {
        return p.username.trim();
      }
    }
  } catch (err) {
    console.error("Error parsing Telegram profile:", err);
  }
  return "Гость";
}


function hasOnb() {
  try {
    return localStorage.getItem("onb_complete") === "1";
  } catch {
    return false;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Dashboard() {
  const navigate = useNavigate();
  const [onbDone, setOnbDone] = useState<boolean>(hasOnb());
  const [name, setName] = useState<string>(() => resolveTelegramName());
  const [historyStats, setHistoryStats] = useState<HistorySnapshot>(() =>
    readHistorySnapshot()
  );
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>(() => {
    return readScheduleCache()?.plannedWorkouts ?? [];
  });
  const [scheduleDates, setScheduleDates] = useState<ScheduleByDate>(() => {
    return readScheduleCache()?.scheduleDates ?? {};
  });
  const [gamification, setGamification] = useState<GamificationSummary>(
    EMPTY_GAMIFICATION_SUMMARY
  );
  const [selectedScheme, setSelectedScheme] = useState<WorkoutScheme | null>(null);
  const [introLeaving, setIntroLeaving] = useState(false);

  // Lock scroll for intro
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (!root || onbDone) return;
    const prevOverflow = root.style.overflowY;
    const prevOverscroll = root.style.overscrollBehaviorY;
    root.style.overflowY = "hidden";
    root.style.overscrollBehaviorY = "none";
    requestAnimationFrame(() => {
      root.scrollTop = root.scrollHeight;
    });
    return () => {
      root.style.overflowY = prevOverflow;
      root.style.overscrollBehaviorY = prevOverscroll;
    };
  }, [onbDone]);

  // Identity updates
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateIdentity = () => {
      const done = hasOnb();
      setOnbDone(done);
      setName(resolveTelegramName());
    };
    updateIdentity();
    window.addEventListener("focus", updateIdentity);
    window.addEventListener("onb_updated" as any, () => updateIdentity());
    return () => {
      window.removeEventListener("focus", updateIdentity);
      window.removeEventListener("onb_updated" as any, updateIdentity);
    };
  }, []);

  // Fetch planned workouts
  const refreshPlanned = useCallback(async () => {
    if (!onbDone) {
      setPlannedWorkouts([]);
      setScheduleDates({});
      return;
    }
    try {
      const data = await getScheduleOverview();
      const nextPlanned = Array.isArray(data?.plannedWorkouts) ? data.plannedWorkouts : [];
      const nextDates = normalizeScheduleDates(data?.schedule?.dates);
      setPlannedWorkouts(nextPlanned);
      setScheduleDates(nextDates);
      writeScheduleCache(nextPlanned, nextDates);
    } catch {
      setPlannedWorkouts([]);
      setScheduleDates({});
    }
  }, [onbDone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    refreshPlanned();
    window.addEventListener("focus", refreshPlanned);
    window.addEventListener("planned_workouts_updated" as any, refreshPlanned);
    window.addEventListener("schedule_updated" as any, refreshPlanned);
    window.addEventListener("plan_completed" as any, refreshPlanned);
    return () => {
      window.removeEventListener("focus", refreshPlanned);
      window.removeEventListener("planned_workouts_updated" as any, refreshPlanned);
      window.removeEventListener("schedule_updated" as any, refreshPlanned);
      window.removeEventListener("plan_completed" as any, refreshPlanned);
    };
  }, [refreshPlanned]);

  // Selected scheme (for day label fallbacks)
  useEffect(() => {
    if (!onbDone) {
      setSelectedScheme(null);
      return;
    }
    let active = true;
    const loadScheme = async () => {
      try {
        const scheme = await getSelectedScheme();
        if (active) setSelectedScheme(scheme);
      } catch {
        if (active) setSelectedScheme(null);
      }
    };
    loadScheme();
    const onSchemeSelected = () => loadScheme();
    window.addEventListener("scheme_selected" as any, onSchemeSelected);
    return () => {
      active = false;
      window.removeEventListener("scheme_selected" as any, onSchemeSelected);
    };
  }, [onbDone]);

  // History updates
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshHistory = () => setHistoryStats(readHistorySnapshot());
    refreshHistory();
    window.addEventListener("focus", refreshHistory);
    window.addEventListener("history_updated" as any, refreshHistory);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_KEY || event.key === "onb_complete") {
        setOnbDone(hasOnb());
        setName(resolveTelegramName());
        refreshHistory();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("focus", refreshHistory);
      window.removeEventListener("history_updated" as any, refreshHistory);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const localGamificationFallback = useMemo(() => {
    const plannedCount = plannedWorkouts.filter((workout) => {
      if (!workout?.id) return false;
      if (workout.status === "cancelled") return false;
      return workout.status === "scheduled" || workout.status === "completed";
    }).length;

    return buildGamificationSummaryFromCounts({
      onboardingCompleted: onbDone,
      plannedWorkouts: plannedCount,
      completedWorkouts: historyStats.total,
    });
  }, [onbDone, plannedWorkouts, historyStats.total]);

  const refreshGamification = useCallback(async () => {
    if (!onbDone) {
      setGamification(EMPTY_GAMIFICATION_SUMMARY);
      return;
    }
    try {
      const summary = await getGamificationSummary();
      setGamification(summary);
    } catch {
      setGamification(localGamificationFallback);
    }
  }, [onbDone, localGamificationFallback]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    refreshGamification();
    window.addEventListener("focus", refreshGamification);
    window.addEventListener("history_updated" as any, refreshGamification);
    window.addEventListener("planned_workouts_updated" as any, refreshGamification);
    window.addEventListener("schedule_updated" as any, refreshGamification);
    window.addEventListener("plan_completed" as any, refreshGamification);
    window.addEventListener("onb_complete" as any, refreshGamification);
    return () => {
      window.removeEventListener("focus", refreshGamification);
      window.removeEventListener("history_updated" as any, refreshGamification);
      window.removeEventListener("planned_workouts_updated" as any, refreshGamification);
      window.removeEventListener("schedule_updated" as any, refreshGamification);
      window.removeEventListener("plan_completed" as any, refreshGamification);
      window.removeEventListener("onb_complete" as any, refreshGamification);
    };
  }, [refreshGamification]);

  // ---------- Date scroller ----------
  const dsDates = useMemo(() => buildDsDates(DATE_COUNT, DATE_PAST_DAYS), []);
  const dsTodayIdx = useMemo(() => dsDates.findIndex((d) => d.isToday), [dsDates]);
  const dsFallbackIdx = dsTodayIdx >= 0 ? dsTodayIdx : DATE_PAST_DAYS;
  const dsInitialIdx = useMemo(
    () => resolvePreferredDateIndex(dsDates, plannedWorkouts, scheduleDates, dsFallbackIdx),
    [dsDates, plannedWorkouts, scheduleDates, dsFallbackIdx]
  );
  const [dsActiveIdx, setDsActiveIdx] = useState(dsInitialIdx);
  const [dsSettledIdx, setDsSettledIdx] = useState(dsInitialIdx);
  const [dayCardIdx, setDayCardIdx] = useState(dsInitialIdx);
  const [dayCardOpacity, setDayCardOpacity] = useState(1);
  const [dayCardOffset, setDayCardOffset] = useState(0);
  const [dayCardDir, setDayCardDir] = useState<"left" | "right">("right");
  const dsScrollRef = useRef<HTMLDivElement>(null);
  const dsScrollRafRef = useRef<number | null>(null);
  const dsScrollStopTimer = useRef<number | null>(null);
  const dsLastTickRef = useRef<number | null>(null);
  const dsLastSettledRef = useRef<number>(dsInitialIdx);
  const dsSuppressHapticsRef = useRef(true);
  const dsAutoCenterAppliedRef = useRef(false);
  const dsUserInteractedRef = useRef(false);
  const dsFirstRenderIdxRef = useRef(dsInitialIdx);
  const dayCardTimerRef = useRef<number | null>(null);
  const hasAssignedDatesForDayCard = useMemo(
    () => collectAssignedDateKeys(plannedWorkouts, scheduleDates).length > 0,
    [plannedWorkouts, scheduleDates]
  );

  useEffect(() => {
    dsScrollRef.current?.scrollTo({ left: dsActiveIdx * DATE_ITEM_W, behavior: "auto" });
    dsLastTickRef.current = dsActiveIdx;
  }, []); // center on mount

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dsSuppressHapticsRef.current = false;
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (dsAutoCenterAppliedRef.current || dsUserInteractedRef.current) return;
    // Wait until assigned dates are available (from API/cache), otherwise
    // the first render locks auto-centering on "today".
    if (!hasAssignedDatesForDayCard) return;
    const preferredIdx = resolvePreferredDateIndex(
      dsDates,
      plannedWorkouts,
      scheduleDates,
      dsFallbackIdx
    );
    const stillOnInitial =
      dsActiveIdx === dsFirstRenderIdxRef.current &&
      dsSettledIdx === dsFirstRenderIdxRef.current &&
      dayCardIdx === dsFirstRenderIdxRef.current;
    if (!stillOnInitial) {
      dsAutoCenterAppliedRef.current = true;
      return;
    }
    setDsActiveIdx(preferredIdx);
    setDsSettledIdx(preferredIdx);
    setDayCardIdx(preferredIdx);
    dsLastTickRef.current = preferredIdx;
    dsLastSettledRef.current = preferredIdx;
    dsScrollRef.current?.scrollTo({ left: preferredIdx * DATE_ITEM_W, behavior: "auto" });
    dsAutoCenterAppliedRef.current = true;
  }, [
    dsDates,
    plannedWorkouts,
    scheduleDates,
    dsFallbackIdx,
    dsActiveIdx,
    dsSettledIdx,
    dayCardIdx,
    hasAssignedDatesForDayCard,
  ]);

  useEffect(() => {
    if (!hasAssignedDatesForDayCard) {
      if (dayCardTimerRef.current) window.clearTimeout(dayCardTimerRef.current);
      if (dayCardIdx !== dsSettledIdx) setDayCardIdx(dsSettledIdx);
      if (dayCardOpacity !== 1) setDayCardOpacity(1);
      if (dayCardOffset !== 0) setDayCardOffset(0);
      return;
    }
    if (dsSettledIdx === dayCardIdx) return;
    const dir = dsSettledIdx > dayCardIdx ? 1 : -1;
    setDayCardDir(dir > 0 ? "right" : "left");
    setDayCardOffset(-dir * 12);
    setDayCardOpacity(0);
    if (dayCardTimerRef.current) window.clearTimeout(dayCardTimerRef.current);
    dayCardTimerRef.current = window.setTimeout(() => {
      setDayCardIdx(dsSettledIdx);
      setDayCardOffset(dir * 18);
      requestAnimationFrame(() => {
        setDayCardOpacity(1);
        setDayCardOffset(0);
      });
    }, 140);
    return () => {
      if (dayCardTimerRef.current) window.clearTimeout(dayCardTimerRef.current);
    };
  }, [dsSettledIdx, dayCardIdx, dayCardOpacity, dayCardOffset, hasAssignedDatesForDayCard]);

  const handleDsScroll = useCallback(() => {
    if (dsScrollRafRef.current == null) {
      dsScrollRafRef.current = window.requestAnimationFrame(() => {
        dsScrollRafRef.current = null;
        const el = dsScrollRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
        const clamped = Math.max(0, Math.min(idx, dsDates.length - 1));
        if (dsLastTickRef.current !== clamped) {
          dsLastTickRef.current = clamped;
          if (!dsSuppressHapticsRef.current) fireHapticImpact("light");
        }
        if (clamped !== dsActiveIdx) setDsActiveIdx(clamped);
      });
    }
    if (dsScrollStopTimer.current) window.clearTimeout(dsScrollStopTimer.current);
    dsScrollStopTimer.current = window.setTimeout(() => {
      const el = dsScrollRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
      const clamped = Math.max(0, Math.min(idx, dsDates.length - 1));
      if (clamped !== dsActiveIdx) setDsActiveIdx(clamped);
      if (clamped !== dsLastSettledRef.current) {
        setDayCardDir(clamped > dsLastSettledRef.current ? "right" : "left");
        dsLastSettledRef.current = clamped;
        setDsSettledIdx(clamped);
      }
      el.scrollTo({ left: clamped * DATE_ITEM_W, behavior: "smooth" });
      if (!dsSuppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  }, [dsDates.length, dsActiveIdx]);

  // Computed values
  const plannedDatesSet = useMemo(() => {
    const set = new Set<string>();
    plannedWorkouts
      .filter((w) => w.status === "scheduled")
      .forEach((w) => {
        const iso = w.scheduledFor?.slice(0, 10);
        if (iso) set.add(iso);
      });
    Object.keys(scheduleDates || {}).forEach((iso) => {
      if (iso) set.add(iso);
    });
    return set;
  }, [plannedWorkouts, scheduleDates]);

  const completedDatesSet = useMemo(
    () => new Set(historyStats.completedDates),
    [historyStats.completedDates]
  );

  const getDotState = useCallback(
    (d: Date): "completed" | "scheduled" | null => {
      const iso = toISODate(d);
      if (completedDatesSet.has(iso)) return "completed";
      if (plannedDatesSet.has(iso)) return "scheduled";
      return null;
    },
    [completedDatesSet, plannedDatesSet]
  );

  const selectedDate = useMemo(
    () => dsDates[dayCardIdx]?.date || new Date(),
    [dsDates, dayCardIdx]
  );
  const selectedISO = useMemo(() => toISODate(selectedDate), [selectedDate]);

  const plannedForSelected = useMemo(() => {
    return plannedWorkouts
      .filter((w) => w && w.status !== "cancelled")
      .filter((w) => datePart(w.scheduledFor) === selectedISO)
      .slice()
      .sort((a, b) => String(a.scheduledFor || "").localeCompare(String(b.scheduledFor || "")));
  }, [plannedWorkouts, selectedISO]);

  const completedForSelected = useMemo(
    () => plannedForSelected.find((w) => w.status === "completed") || null,
    [plannedForSelected]
  );
  const activeForSelected = useMemo(
    () =>
      plannedForSelected.find(
        (w) => w.status === "scheduled"
      ) || null,
    [plannedForSelected]
  );

  const slotForSelected = scheduleDates[selectedISO];
  const isSelectedCompleted =
    completedDatesSet.has(selectedISO) || Boolean(completedForSelected);
  const isSelectedPlanned =
    Boolean(activeForSelected) || (!isSelectedCompleted && Boolean(slotForSelected));

  const selectedPlanned =
    activeForSelected || completedForSelected || plannedForSelected[0] || null;

  const fallbackSchemeTitle = useMemo(() => {
    const firstLabel = selectedScheme?.dayLabels?.[0]?.label;
    if (firstLabel) {
      const resolved = resolveDayCopy(firstLabel, selectedScheme?.splitType || "", 0).title;
      if (/^День\\s+\\d+/.test(resolved)) return firstLabel;
      return resolved;
    }
    return "Тренировка";
  }, [selectedScheme]);

  const selectedWorkoutTitle = useMemo(() => {
    const plan: any = selectedPlanned?.plan || {};
    const raw =
      String(
        plan.dayLabel ||
          plan.title ||
          plan.name ||
          plan.label ||
          plan.scheme_label ||
          ""
      ).trim();
    const idxRaw = Number(plan?.dayIndex);
    const idx = Number.isFinite(idxRaw) ? Math.max(0, idxRaw - 1) : 0;
    const splitType =
      String(plan?.splitType || selectedScheme?.splitType || "").trim();
    if (raw) {
      const resolved = resolveDayCopy(raw, splitType, idx).title;
      if (/^День\\s+\\d+/.test(resolved)) return raw;
      return resolved;
    }
    return fallbackSchemeTitle;
  }, [selectedPlanned, selectedScheme, fallbackSchemeTitle]);

  const workoutChips = useMemo(() => {
    const plan: any = selectedPlanned?.plan || {};
    const totalExercises =
      Number(plan?.totalExercises) ||
      (Array.isArray(plan?.exercises) ? plan.exercises.length : 0);
    const minutes = Number(plan?.estimatedDuration) || null;
    return { totalExercises, minutes };
  }, [selectedPlanned]);

  const weekDays = useMemo(() => getWeekDays(), []);
  const dashboardUserContext = useMemo<UserContext>(() => {
    const summary = readOnboardingSummary();
    const motivation = asRecord(summary?.motivation);
    const experienceNode = summary?.experience;
    const experience = asRecord(experienceNode);
    const trainingPlace = asRecord(summary?.trainingPlace);
    const ageSex = asRecord(summary?.ageSex);
    const body = asRecord(summary?.body);

    const goal = toUserGoal(motivation?.goal ?? summary?.goal);
    const experienceLevel = toExperienceLevel(experience?.level ?? experienceNode);
    const location = toLocation(trainingPlace?.place ?? summary?.location);
    const sexRaw = ageSex?.sex ?? summary?.sex;
    const sex = sexRaw === "male" || sexRaw === "female" ? sexRaw : undefined;
    const age = toOptionalNumber(ageSex?.age ?? summary?.age);
    const weight = toOptionalNumber(body?.weight);
    const height = toOptionalNumber(body?.height);
    const bmi =
      typeof weight === "number" && typeof height === "number" && height > 0
        ? weight / ((height / 100) ** 2)
        : undefined;

    return {
      goal,
      experience: experienceLevel,
      location,
      sex,
      age,
      bmi,
    };
  }, [onbDone]);
  const totalPlanDays = useMemo(() => {
    const daysByScheme = Number(selectedScheme?.daysPerWeek);
    if (Number.isFinite(daysByScheme) && daysByScheme >= 2 && daysByScheme <= 6) {
      return daysByScheme;
    }
    const labels = selectedScheme?.dayLabels;
    if (Array.isArray(labels) && labels.length >= 2 && labels.length <= 6) {
      return labels.length;
    }
    return 3;
  }, [selectedScheme]);
  const weeklyPlanTitle = useMemo(() => {
    if (selectedScheme) {
      try {
        const displayData = getSchemeDisplayData(
          {
            id: selectedScheme.id,
            name: selectedScheme.name,
            splitType: toSplitType(selectedScheme.splitType),
            intensity: selectedScheme.intensity,
            daysPerWeek: selectedScheme.daysPerWeek,
            locations: toLocations(selectedScheme.equipmentRequired),
          },
          dashboardUserContext
        );
        const mapped = String(displayData?.title || "").trim();
        if (mapped) return mapped;
      } catch {}
    }
    const named = String(selectedScheme?.russianName || selectedScheme?.name || "").trim();
    if (named) return named;
    return `План на ${totalPlanDays} тренировки`;
  }, [selectedScheme, totalPlanDays, dashboardUserContext]);
  const weeklyCompletedCount = useMemo(() => {
    const completed = plannedWorkouts.filter((w) => w.status === "completed").length;
    return Math.min(totalPlanDays, completed);
  }, [plannedWorkouts, totalPlanDays]);
  const goalDotColumns = useMemo(() => {
    if (totalPlanDays <= 3) return totalPlanDays;
    if (totalPlanDays === 4) return 2;
    return 3;
  }, [totalPlanDays]);
  const goalDotSize = useMemo(() => {
    if (totalPlanDays <= 3) return 32;
    if (totalPlanDays === 4) return 28;
    return 24;
  }, [totalPlanDays]);
  const weeklyGoalLabel = useMemo(() => formatWorkoutCountRu(totalPlanDays), [totalPlanDays]);

  // Calculate week streak (consecutive weeks with all workouts completed)
  const weekStreak = useMemo(() => {
    return calculateWeekStreak(
      historyStats.completedDates,
      plannedWorkouts,
      totalPlanDays
    );
  }, [historyStats.completedDates, plannedWorkouts, totalPlanDays]);

  const goOnb = () => navigate("/onb/age-sex");

  // ========================================================================
  // PRE-ONBOARDING: Intro screen
  // ========================================================================

  if (!onbDone) {
    return (
      <div
        style={s.introPage}
        className={introLeaving ? "intro-leave" : undefined}
      >
        <style>{`
          @keyframes introFadeUp {
            0% { opacity: 0; transform: translateY(14px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes introFadeDown {
            0% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(12px); }
          }
          .intro-fade {
            animation: introFadeUp 520ms ease-out both;
          }
          .intro-fade-delay-1 { animation-delay: 80ms; }
          .intro-fade-delay-2 { animation-delay: 160ms; }
          .intro-fade-delay-3 { animation-delay: 240ms; }
          .intro-leave {
            animation: introFadeDown 220ms ease-in both;
          }
          @media (prefers-reduced-motion: reduce) {
            .intro-fade,
            .intro-fade-delay-1,
            .intro-fade-delay-2,
            .intro-fade-delay-3 { animation: none !important; }
            .intro-leave { animation: none !important; }
          }
          .intro-primary-btn {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
            transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
          }
          .intro-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #1e1f22 !important;
          border-color: #1e1f22 !important;
        }
          @media (hover: hover) {
            .intro-primary-btn:hover:not(:disabled) {
              filter: brightness(1.03);
            }
          }
          .intro-primary-btn:focus-visible {
            outline: 3px solid rgba(15, 23, 42, 0.18);
            outline-offset: 2px;
          }
          @media (prefers-reduced-motion: reduce) {
            .intro-primary-btn {
              transition: none !important;
            }
          }
        `}</style>
        <section style={s.introHero} className="intro-fade intro-fade-delay-1">
          <div style={s.introImageWrap}>
            <img
              src={ROBOT_SRC}
              alt="ИИ-тренер"
              style={s.introImage}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
          </div>
        </section>

        <section
          style={s.introFooter}
          className="intro-fade intro-fade-delay-2"
        >
          <div style={s.introTextBlock}>
            <h1 style={s.introTitle}>
              <span style={s.introTitleLine}>Меняйся</span>
              <span style={s.introTitleLine}>с Моро</span>
            </h1>
            <p style={s.introSubtitle}>
              Умный фитнес в одном месте: тренировки, прогрессия, питание и
              рекомендации
            </p>
          </div>

          <button
            type="button"
            style={s.introPrimaryBtn}
            className="intro-primary-btn intro-fade intro-fade-delay-3"
            onClick={() => {
              if (introLeaving) return;
              const prefersReduced = window.matchMedia?.(
                "(prefers-reduced-motion: reduce)"
              )?.matches;
              if (prefersReduced) {
                goOnb();
                return;
              }
              setIntroLeaving(true);
              window.setTimeout(() => {
                goOnb();
              }, 220);
            }}
          >
            Начать
          </button>
        </section>
      </div>
    );
  }

  // ========================================================================
  // POST-ONBOARDING: New Dashboard
  // ========================================================================

  const dayState: "weekly" | "completed" | "planned" = isSelectedCompleted
    ? "completed"
    : isSelectedPlanned
    ? "planned"
    : "weekly";
  const dayHeaderText =
    dayState === "weekly"
      ? "План на неделю"
      : dayState === "completed"
      ? "Тренировка выполнена"
      : "Тренировка на";
  const dayTitle =
    dayState === "weekly"
      ? weeklyPlanTitle
      : selectedWorkoutTitle;
  const dayWeeklyProgressText = "Выполнено";
  const dayMascotSrc = useMemo(() => {
    if (dayState === "weekly") return REST_MASCOT_SRC;
    const title = String(dayTitle || "").toLowerCase();
    if (title.includes("ног") && title.includes("ягод")) return LEGS_MASCOT_SRC;
    if (title.includes("грудь") && title.includes("плеч")) return CHEST_MASCOT_SRC;
    if (title.includes("спина") && title.includes("бицепс")) return BACK_MASCOT_SRC;
    return ROBOT_SRC;
  }, [dayState, dayTitle]);
  const dayDurationText = formatDuration(workoutChips.minutes);
  const dayExercisesText =
    workoutChips.totalExercises > 0 ? `${workoutChips.totalExercises} упражнений` : "";
  const showDayMeta =
    Boolean(dayDurationText || dayExercisesText) &&
    dayState !== "weekly";
  const dayButtonText =
    dayState === "completed"
      ? "Результат"
      : dayState === "planned"
      ? "Начать"
      : "Выбрать тренировку";
  const isResultButton = dayState === "completed";
  const showPlannedStartReplace = dayState === "planned" && Boolean(selectedPlanned?.id);

  const handleDayStart = () => {
    if (showPlannedStartReplace && selectedPlanned?.id) {
      navigate("/check-in", {
        state: {
          workoutDate: selectedISO,
          plannedWorkoutId: selectedPlanned.id,
          returnTo: "/",
        },
      });
      return;
    }
    handleDayAction();
  };

  const handleDayReplace = () => {
    navigate("/plan/one", {
      state: {
        replaceDate: selectedISO,
        replaceFromPlannedWorkoutId: selectedPlanned?.id || null,
      },
    });
  };

  const handleDayAction = () => {
    if (dayState === "completed") {
      const sessionId = selectedPlanned?.resultSessionId;
      if (sessionId) {
        navigate(`/workout/result?sessionId=${encodeURIComponent(sessionId)}`);
        return;
      }
      navigate("/workout/result");
      return;
    }
    navigate("/plan/one");
  };

  return (
    <div style={s.page}>
      <style>{`
        @keyframes dashFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .dash-fade {
          animation: dashFadeUp 520ms ease-out both;
        }
        .dash-delay-1 { animation-delay: 80ms; }
        .dash-delay-2 { animation-delay: 160ms; }
        .dash-delay-3 { animation-delay: 240ms; }
        .dash-primary-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }
        .dash-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #1e1f22 !important;
        }
        .dash-quick-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .dash-quick-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.98) !important;
        }
        .day-cta:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
        }
        .day-card-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          height: 100%;
          transition: opacity 220ms ease, transform 220ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .dash-fade { animation: none !important; opacity: 1 !important; transform: none !important; }
          .dash-primary-btn, .dash-quick-btn { transition: none !important; }
          .day-card-body { transition: none !important; transform: none !important; opacity: 1 !important; }
        }
      `}</style>

      {/* BLOCK 1: Avatar Header */}
      <section style={s.headerRow} className="dash-fade dash-delay-1">
        <div style={s.headerLeft}>
          <div style={s.avatarCircle}>
            <img
              src={MASCOT_SRC}
              alt="Моро"
              style={s.mascotAvatarImg}
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
          <div style={s.headerText}>
            <div style={s.headerGreeting}>Привет, {name}!</div>
            <div style={s.headerSub}>Приступим к тренировкам</div>
          </div>
        </div>
      </section>

      {/* BLOCK 2: Scrollable Date Picker */}
      <section style={s.dsWrap} className="dash-fade dash-delay-2">
        <style>{`
          .date-track::-webkit-scrollbar { display: none; }
          .date-item {
            appearance: none; outline: none; border: none; cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            touch-action: pan-x;
          }
        `}</style>
        <div style={s.dsCard}>
          <div style={s.dsScroller}>
            <div style={s.dsIndicator} />
            <div
              ref={dsScrollRef}
              style={s.dsTrack}
              className="date-track"
              onPointerDown={() => {
                dsUserInteractedRef.current = true;
              }}
              onScroll={handleDsScroll}
            >
              {dsDates.map((d, idx) => {
                const active = idx === dsActiveIdx;
                const dot = getDotState(d.date);
                return (
                  <button
                    key={idx}
                    type="button"
                    className="date-item"
                    style={{ ...s.dsItem, scrollSnapAlign: "center" }}
                    onClick={() => {
                      dsUserInteractedRef.current = true;
                      fireHapticImpact("light");
                      setDsActiveIdx(idx);
                      dsScrollRef.current?.scrollTo({ left: idx * DATE_ITEM_W, behavior: "smooth" });
                    }}
                  >
                    <span style={{ ...s.dsDow, ...(active ? s.dsDowActive : undefined) }}>
                      {d.dow}
                    </span>
                    <span style={{ ...s.dsNum, ...(active ? s.dsNumActive : undefined) }}>
                      {d.day}
                    </span>
                    <span style={s.dsDotWrap}>
                      <span
                        style={{
                          ...s.dsDotPit,
                        }}
                      >
                        {dot === "scheduled" ? (
                          <span style={s.dsDotSphereScheduled} />
                        ) : dot === "completed" ? (
                          <span style={s.dsDotSphereCompleted} />
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* BLOCK 3: Next Action CTA */}
      <section style={s.ctaCard} className="dash-fade dash-delay-2">
        <img
          src={dayMascotSrc}
          alt=""
          aria-hidden="true"
          style={{
            ...s.dayCardMascot,
            opacity: dayCardOpacity,
            transform: `translateX(${dayCardOffset}px)`,
          }}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />
        <div
          className="day-card-body"
          style={{
            ...s.dayCardBody,
            opacity: dayCardOpacity,
            transform: `translateX(${dayCardOffset}px)`,
          }}
        >
          <div style={s.dayHeader}>{dayHeaderText}</div>
          <div style={s.dayTitle}>{dayTitle}</div>
          {dayState === "weekly" ? (
            <div style={s.dayWeeklyMetaRow}>
              <span style={s.dayWeeklyProgressLabel}>{dayWeeklyProgressText}</span>
              <span style={s.dayWeeklyProgressPits}>
                {Array.from({ length: totalPlanDays }, (_, idx) => {
                  const done = idx < weeklyCompletedCount;
                  return (
                    <span key={`week-progress-${idx}`} style={s.dayWeeklyProgressPit}>
                      {done ? <span style={s.dayWeeklyProgressSphere} /> : null}
                    </span>
                  );
                })}
              </span>
            </div>
          ) : null}
          {showDayMeta && (
            <div style={s.dayMetaRow}>
              {dayDurationText ? (
                <span style={s.dayMetaItem}>
                  <ClockIcon size={14} />
                  <span>{dayDurationText}</span>
                </span>
              ) : null}
              {dayExercisesText ? (
                <span style={s.dayMetaItem}>
                  <DumbbellIcon size={14} />
                  <span>{dayExercisesText}</span>
                </span>
              ) : null}
            </div>
          )}
          {showPlannedStartReplace ? (
            <div style={s.dayBtnRow}>
              <button
                type="button"
                style={{ ...s.dayBtn, ...s.dayBtnInRow }}
                className="dash-primary-btn day-cta"
                onClick={handleDayStart}
              >
                <span>{dayButtonText}</span>
                <span style={s.dayBtnIconWrap}>
                  <span style={s.dayBtnArrow}>→</span>
                </span>
              </button>
              <button
                type="button"
                style={s.dayBtnSecondary}
                onClick={handleDayReplace}
              >
                Заменить
              </button>
            </div>
          ) : (
            <button
              type="button"
              style={{ ...s.dayBtn, marginTop: "auto" }}
              className="dash-primary-btn day-cta"
              onClick={handleDayAction}
            >
              <span>{dayButtonText}</span>
              <span style={s.dayBtnIconWrap}>
                {isResultButton ? (
                  <span style={s.dayBtnDoneMark}>✓</span>
                ) : (
                  <span style={s.dayBtnArrow}>→</span>
                )}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* BLOCK 4-5: Weekly Goal + Progress CTA */}
      <section style={s.goalProgressRow} className="dash-fade dash-delay-3">
        <div style={s.goalCompactCard}>
          <div style={s.goalCompactTitle}>Цель недели</div>
          <div style={s.goalCompactCaption}>{weeklyGoalLabel}</div>
          <div
            style={{
              ...s.goalCompactDotsWrap,
              gridTemplateColumns: `repeat(${goalDotColumns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: totalPlanDays }, (_, idx) => {
              const done = idx < weeklyCompletedCount;
              return (
                <span key={`goal-dot-${idx}`} style={s.goalCompactDotCell}>
                  <span
                    style={{
                      ...s.goalCompactDotPit,
                      width: goalDotSize,
                      height: goalDotSize,
                      ...(done ? s.goalCompactDotFilled : undefined),
                    }}
                  >
                    {!done ? (
                      <svg viewBox="0 0 20 18" aria-hidden style={s.goalCompactDotCheckSvg}>
                        <path
                          d="M4.3 9.2L8.1 12.9L15.8 5.2"
                          fill="none"
                          stroke="rgba(148,163,184,0.56)"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4 8.9L7.8 12.6L15.5 4.9"
                          fill="none"
                          stroke="rgba(255,255,255,0.62)"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4.6 9.5L8.4 13.2L16.1 5.5"
                          fill="none"
                          stroke="rgba(71,85,105,0.42)"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          style={s.progressCtaCard}
          className="dash-quick-btn"
          onClick={() => navigate("/progress")}
        >
          <div style={s.progressCtaArrowPit}>
            <span style={s.progressCtaArrow}>→</span>
          </div>
          <div style={s.progressCtaBars} aria-hidden>
            {PROGRESS_CTA_BAR_METRICS.map((bar, idx) => (
              <span key={`progress-cta-bar-${idx}`} style={{ ...s.progressCtaBarTrack, height: bar.track }}>
                <span style={{ ...s.progressCtaBarFill, height: `${bar.fill * 100}%` }} />
              </span>
            ))}
          </div>
          <div style={s.progressCtaTitle}>Прогресс</div>
        </button>
      </section>

      <div style={{ height: 120 }} />
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s: Record<string, React.CSSProperties> = {
  // Page
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 0",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "transparent",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  // ===== INTRO SCREEN (unchanged) =====
  introPage: {
    height: "100vh",
    padding: "8px 20px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "transparent",
    color: "#0f172a",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
    overflow: "hidden",
  },
  introHero: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    flex: "0 0 auto",
    paddingTop: 0,
  },
  introImageWrap: {
    position: "relative",
    width: "min(864px, 95vw)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  introImage: {
    width: "100%",
    height: "auto",
    maxHeight: "55vh",
    objectFit: "contain",
    transform: "translateY(36px) scale(0.95)",
    transformOrigin: "center bottom",
  },
  introFooter: {
    width: "100%",
    display: "grid",
    gap: 18,
    paddingBottom: 18,
  },
  introTextBlock: {
    width: "100%",
    textAlign: "center",
    display: "grid",
    gap: 10,
    marginTop: -14,
  },
  introTitle: {
    margin: 0,
    fontSize: 42,
    lineHeight: 1.05,
    fontWeight: 900,
    letterSpacing: -0.8,
  },
  introTitleLine: {
    display: "block",
  },
  introSubtitle: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, .65)",
    maxWidth: 340,
    marginLeft: "auto",
    marginRight: "auto",
  },
  introPrimaryBtn: {
    marginTop: 6,
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    WebkitTapHighlightColor: "transparent",
  },

  // ===== BLOCK 1: Avatar Header =====
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatarCircle: {
    width: DASH_AVATAR_SIZE,
    height: DASH_AVATAR_SIZE,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flex: "0 0 auto",
    padding: 2,
  },
  mascotAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  headerGreeting: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e1f22",
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "rgba(30, 31, 34, 0.7)",
  },

  // ===== BLOCK 2: Date Scroller =====
  dsWrap: {
    marginBottom: 4,
  },
  dsCard: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.75)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow:
      "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    position: "relative",
    overflow: "hidden",
    alignSelf: "stretch",
    width: "100%",
    padding: 0,
  },
  dsScroller: {
    position: "relative",
    overflow: "visible",
    width: "100%",
  },
  dsIndicator: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 68,
    height: 80,
    transform: "translate(-50%, -50%)",
    borderRadius: 22,
    background: "linear-gradient(180deg, #ffffff 0%, #f4f4f7 100%)",
    border: "1px solid rgba(255,255,255,0.95)",
    boxShadow:
      "0 12px 24px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
    pointerEvents: "none",
    zIndex: 1,
  },
  dsTrack: {
    overflowX: "auto",
    overflowY: "hidden",
    whiteSpace: "nowrap",
    scrollSnapType: "x proximity",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    padding: "16px 0 14px",
    paddingLeft: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    paddingRight: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    position: "relative",
    zIndex: 2,
    display: "flex",
  } as React.CSSProperties,
  dsItem: {
    width: DATE_ITEM_W,
    minWidth: DATE_ITEM_W,
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 0,
    background: "transparent",
    cursor: "pointer",
  } as React.CSSProperties,
  dsDow: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(17,17,17,0.35)",
    lineHeight: 1.1,
    letterSpacing: 0.3,
  },
  dsDowActive: {
    color: "#1e1f22",
    fontWeight: 600,
  },
  dsNum: {
    fontSize: 24,
    fontWeight: 500,
    color: "rgba(17,17,17,0.3)",
    lineHeight: 1.1,
  },
  dsNumActive: {
    color: "#111",
    fontWeight: 700,
    fontSize: 28,
  },
  dsDotWrap: {
    height: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  dsDotPit: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  dsDotSphereScheduled: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(180deg, #eef1f5 0%, #bcc3ce 62%, #8a92a0 100%)",
    boxShadow:
      "0 1px 2px rgba(55,65,81,0.35), inset 0 1px 1px rgba(255,255,255,0.7), inset 0 -1px 1px rgba(75,85,99,0.5)",
  } as React.CSSProperties,
  dsDotSphereCompleted: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(180deg, #d7ff52 0%, #8bff1a 62%, #61d700 100%)",
    boxShadow:
      "0 1px 2px rgba(86, 190, 0, 0.45), inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(56, 135, 0, 0.45)",
  } as React.CSSProperties,

  // ===== BLOCK 3: Next Action CTA =====
  ctaCard: {
    borderRadius: 24,
    padding: "20px 18px",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow:
      "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 210,
    height: 210,
    position: "relative",
    overflow: "hidden",
  },
  dayCardMascot: {
    position: "absolute",
    right: -36,
    bottom: -18,
    width: 150,
    height: "auto",
    opacity: 1,
    filter: "none",
    pointerEvents: "none",
    zIndex: 0,
    transition: "opacity 220ms ease, transform 220ms ease",
  },
  dayCardBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    height: "100%",
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
  dayHeader: {
    fontSize: 18,
    fontWeight: 700,
    color: "rgba(15, 23, 42, 0.6)",
    lineHeight: 1.2,
  },
  dayMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "#0f172a",
  },
  dayMetaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  dayTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
    letterSpacing: -0.5,
  },
  dayWeeklyMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  dayWeeklyProgressLabel: {
    display: "inline-flex",
    alignItems: "center",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1,
  },
  dayWeeklyProgressPits: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  },
  dayWeeklyProgressPit: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dayWeeklyProgressSphere: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(180deg, #d7ff52 0%, #8bff1a 62%, #61d700 100%)",
    boxShadow:
      "0 1px 2px rgba(86, 190, 0, 0.45), inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(56, 135, 0, 0.45)",
  },
  dayDistributionWrap: {
    display: "grid",
    gap: 10,
  },
  dayDistributionLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.62)",
    lineHeight: 1.35,
  },
  dayDistributionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  dayDistributionPit: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  dayDistributionPitAssigned: {
    background: "linear-gradient(180deg, #9ea1a8 0%, #c2c5cc 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(17,24,39,0.32), inset 0 -1px 0 rgba(255,255,255,0.5)",
  },
  dayBtn: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 50,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
  },
  dayBtnRow: {
    marginTop: "auto",
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  dayBtnInRow: {
    alignSelf: "flex-end",
  },
  dayBtnSecondary: {
    alignSelf: "flex-end",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "auto",
    padding: 0,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    color: "rgba(15, 23, 42, 0.6)",
    fontWeight: 400,
    fontSize: 14,
    lineHeight: 1.5,
    cursor: "pointer",
    boxShadow: "none",
    appearance: "none",
    WebkitTapHighlightColor: "transparent",
  },
  dayBtnIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  dayBtnArrow: {
    fontSize: 18,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  dayBtnDoneMark: {
    fontSize: 18,
    lineHeight: 1,
    color: "#8bff1a",
    fontWeight: 800,
    textShadow:
      "0 1px 2px rgba(86,190,0,0.45), 0 0 1px rgba(56,135,0,0.45)",
  },
  // ===== BLOCK 4-5: Weekly Goal + Progress CTA =====
  goalProgressRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  goalCompactCard: {
    borderRadius: 24,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow:
      "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    padding: "14px 12px 10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 0,
    minHeight: 160,
    height: 160,
    color: "#0f172a",
    overflow: "hidden",
  },
  goalCompactTitle: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#0f172a",
    whiteSpace: "nowrap",
  },
  goalCompactDotsWrap: {
    marginTop: 10,
    height: 78,
    width: "100%",
    display: "grid",
    alignContent: "center",
    justifyItems: "stretch",
    rowGap: 8,
    columnGap: 10,
    padding: "0 6px",
  },
  goalCompactDotCell: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  goalCompactDotPit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  goalCompactDotFilled: {
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow:
      "0 1px 2px rgba(2,6,23,0.42), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
  },
  goalCompactDotCheckSvg: {
    width: 15,
    height: 14,
    transform: "translateY(-0.2px)",
    mixBlendMode: "multiply",
    opacity: 0.84,
  },
  goalCompactCaption: {
    marginTop: 2,
    textAlign: "left",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: "rgba(15, 23, 42, 0.6)",
  },
  progressCtaCard: {
    borderRadius: 24,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow:
      "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    padding: "14px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    cursor: "pointer",
    minHeight: 160,
    color: "#0f172a",
    position: "relative",
    overflow: "hidden",
  },
  progressCtaArrowPit: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    zIndex: 1,
  },
  progressCtaBars: {
    height: 60,
    marginTop: 10,
    marginLeft: 2,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    position: "relative",
    zIndex: 1,
    overflow: "visible",
  },
  progressCtaBarTrack: {
    width: 14,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 4px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "flex-end",
    flexShrink: 0,
  },
  progressCtaBarFill: {
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow:
      "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
  },
  progressCtaTitle: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#0f172a",
    marginTop: "auto",
    alignSelf: "flex-start",
    textAlign: "left",
    position: "relative",
    zIndex: 1,
  },
  progressCtaArrow: {
    fontSize: 18,
    lineHeight: 1,
    fontWeight: 700,
    color: "#0f172a",
  },
};
