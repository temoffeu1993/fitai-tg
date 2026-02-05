// webapp/src/screens/Dashboard.tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getScheduleOverview, type PlannedWorkout, type ScheduleByDate } from "@/api/schedule";
import { getSelectedScheme, type WorkoutScheme } from "@/api/schemes";
import { fireHapticImpact } from "@/utils/haptics";
import { resolveDayCopy } from "@/utils/dayLabelCopy";

import robotImg from "../assets/morobot.png";
import mascotImg from "@/assets/robonew.webp";

const ROBOT_SRC = robotImg;
const MASCOT_SRC = mascotImg;

const HISTORY_KEY = "history_sessions_v1";

const XP_TIERS = [
  { min: 0, name: "Новичок" },
  { min: 1000, name: "Импульс" },
  { min: 2500, name: "Темпо" },
  { min: 5000, name: "Сталь" },
  { min: 9000, name: "Легенда" },
];

const DAY_NAMES_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const DATE_ITEM_W = 64;
const DATE_COUNT = 37;
const DATE_PAST_DAYS = 7;
const DATE_DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DASH_AVATAR_SIZE = 56;

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
  xp: number;
  streak: number;
  completedDates: string[];
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function formatDuration(minutes?: number | null) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "";
  const rounded = Math.round(total / 10) * 10;
  return `${rounded} мин`;
}

function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <g stroke="rgba(10,10,12,0.45)" transform="translate(0 0.6)">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.5 2" />
      </g>
      <g stroke="rgba(255,255,255,0.9)" transform="translate(0 -0.6)">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.5 2" />
      </g>
      <g stroke="#1e1f22">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.5 2" />
      </g>
    </svg>
  );
}

function DumbbellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <g stroke="rgba(10,10,12,0.45)" transform="translate(0 0.6)">
        <path d="M4 9v6" />
        <path d="M7 8v8" />
        <path d="M17 8v8" />
        <path d="M20 9v6" />
        <path d="M7 12h10" />
      </g>
      <g stroke="rgba(255,255,255,0.9)" transform="translate(0 -0.6)">
        <path d="M4 9v6" />
        <path d="M7 8v8" />
        <path d="M17 8v8" />
        <path d="M20 9v6" />
        <path d="M7 12h10" />
      </g>
      <g stroke="#1e1f22">
        <path d="M4 9v6" />
        <path d="M7 8v8" />
        <path d="M17 8v8" />
        <path d="M20 9v6" />
        <path d="M7 12h10" />
      </g>
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

function readHistorySnapshot(): HistorySnapshot {
  if (typeof window === "undefined")
    return { total: 0, lastCompletedAt: null, xp: 0, streak: 0, completedDates: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw))
      return { total: 0, lastCompletedAt: null, xp: 0, streak: 0, completedDates: [] };

    const sorted = raw
      .map((rec) => {
        const dateValue = rec?.finishedAt || rec?.completedAt || rec?.date;
        const ts = dateValue ? new Date(dateValue).getTime() : NaN;
        return { ...rec, __ts: Number.isNaN(ts) ? null : ts };
      })
      .sort((a, b) => (a.__ts || 0) - (b.__ts || 0));

    let last: number | null = null;
    let xp = 0;
    let streak = 0;
    let prevDayNumber: number | null = null;
    const completedDatesSet = new Set<string>();

    for (const rec of sorted) {
      const ts = rec.__ts;
      const duration = Number(rec?.durationMin) || 0;
      const exercisesCount = Array.isArray(rec?.exercises)
        ? rec.exercises.length
        : Array.isArray(rec?.items)
        ? rec.items.length
        : 0;

      const base = 120;
      const durationBonus = Math.min(90, Math.max(20, duration || 30)) * 1.5;
      const varietyBonus = Math.min(10, Math.max(3, exercisesCount || 4)) * 12;
      xp += Math.round(base + durationBonus + varietyBonus);

      if (typeof ts === "number") {
        const dayNumber = Math.floor(ts / 86400000);
        if (prevDayNumber != null && dayNumber - prevDayNumber <= 2) {
          streak += 1;
        } else {
          streak = 1;
        }
        xp += Math.max(0, streak - 1) * 25;
        prevDayNumber = dayNumber;
        if (last == null || ts > last) last = ts;
        completedDatesSet.add(toISODate(new Date(ts)));
      }
    }

    const todayDayNumber = Math.floor(Date.now() / 86400000);
    const lastDayNumber = last ? Math.floor(last / 86400000) : null;
    const currentStreak =
      lastDayNumber != null && todayDayNumber - lastDayNumber <= 2 ? streak : 0;

    return {
      total: raw.length,
      lastCompletedAt: last,
      xp,
      streak: currentStreak,
      completedDates: Array.from(completedDatesSet),
    };
  } catch {
    return { total: 0, lastCompletedAt: null, xp: 0, streak: 0, completedDates: [] };
  }
}

function xpRankInfo(xp: number) {
  for (let i = XP_TIERS.length - 1; i >= 0; i--) {
    if (xp >= XP_TIERS[i].min) {
      const nextTier = XP_TIERS[i + 1] || null;
      const tierMin = XP_TIERS[i].min;
      const target = nextTier ? nextTier.min - tierMin : 0;
      const current = xp - tierMin;
      return {
        name: XP_TIERS[i].name,
        nextName: nextTier?.name || null,
        xpInTier: current,
        xpToNext: target,
        progress: target > 0 ? Math.min(1, current / target) : 1,
        totalXp: xp,
      };
    }
  }
  return {
    name: "Новичок",
    nextName: "Импульс",
    xpInTier: 0,
    xpToNext: 1000,
    progress: 0,
    totalXp: 0,
  };
}


// ============================================================================
// PRELOAD
// ============================================================================

let robotPreloaded = false;
function ensureRobotPreloaded(src: string) {
  if (robotPreloaded) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!src) return;
  robotPreloaded = true;
  try {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    link.setAttribute("data-preload-img", "robot");
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
  } catch {}
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}
ensureRobotPreloaded(ROBOT_SRC);

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
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [scheduleDates, setScheduleDates] = useState<ScheduleByDate>({});
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
      setPlannedWorkouts(
        Array.isArray(data?.plannedWorkouts) ? data.plannedWorkouts : []
      );
      setScheduleDates(normalizeScheduleDates(data?.schedule?.dates));
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

  // ---------- Date scroller ----------
  const dsDates = useMemo(() => buildDsDates(DATE_COUNT, DATE_PAST_DAYS), []);
  const dsTodayIdx = useMemo(() => dsDates.findIndex((d) => d.isToday), [dsDates]);
  const dsInitialIdx = dsTodayIdx >= 0 ? dsTodayIdx : DATE_PAST_DAYS;
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
  const dayCardTimerRef = useRef<number | null>(null);

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
  }, [dsSettledIdx, dayCardIdx]);

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
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const plannedDatesSet = useMemo(() => {
    const set = new Set<string>();
    plannedWorkouts
      .filter((w) => w.status === "scheduled" || w.status === "pending")
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
        (w) => w.status === "scheduled" || w.status === "pending"
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

  const rankInfo = useMemo(() => xpRankInfo(historyStats.xp), [historyStats.xp]);

  const weekDays = useMemo(() => getWeekDays(), []);


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

  const dayState: "completed" | "planned" | "rest" = isSelectedCompleted
    ? "completed"
    : isSelectedPlanned
    ? "planned"
    : "rest";
  const dayHeaderText =
    dayState === "completed"
      ? "Тренировка выполнена"
      : dayState === "planned"
      ? "Тренировка на"
      : "День отдыха";
  const dayTitle = dayState === "rest" ? "Выбрать тренировку" : selectedWorkoutTitle;
  const dayDurationText = formatDuration(workoutChips.minutes);
  const dayExercisesText =
    workoutChips.totalExercises > 0 ? `${workoutChips.totalExercises} упражнений` : "";
  const showDayMeta = Boolean(dayDurationText || dayExercisesText) && dayState !== "rest";
  const showChips = false;
  const dayButtonText =
    dayState === "completed"
      ? "Результат"
      : dayState === "planned"
      ? "Начать"
      : "План";
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
                          ...(dot === "scheduled" ? s.dsDotPitScheduled : undefined),
                          ...(dot === "completed" ? s.dsDotPitCompleted : undefined),
                        }}
                      >
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
          {showDayMeta && (
            <div style={s.dayMetaRow}>
              {dayDurationText ? (
                <span style={s.dayMetaItem}>
                  <ClockIcon size={16} />
                  <span>{dayDurationText}</span>
                </span>
              ) : null}
              {dayExercisesText ? (
                <span style={s.dayMetaItem}>
                  <DumbbellIcon size={16} />
                  <span>{dayExercisesText}</span>
                </span>
              ) : null}
            </div>
          )}
          <button
            type="button"
            style={{ ...s.dayBtn, marginTop: "auto" }}
            className="dash-primary-btn day-cta"
            onClick={handleDayAction}
          >
            <span>{dayButtonText}</span>
            <span style={s.dayBtnIconWrap}>
              <span style={s.dayBtnArrow}>→</span>
            </span>
          </button>
        </div>
      </section>

      {/* BLOCK 4: Progress (Streak + XP Bar) */}
      <section style={s.progressCard} className="dash-fade dash-delay-3">
        <div style={s.progressTop}>
          <div style={s.progressStreak}>
            <span style={s.streakIcon}>🔥</span>
            <span style={s.streakValue}>
              {historyStats.streak}{" "}
              {historyStats.streak === 1
                ? "день"
                : historyStats.streak >= 2 && historyStats.streak <= 4
                ? "дня"
                : "дней"}
            </span>
          </div>
          <div style={s.progressRank}>
            <span style={s.rankName}>{rankInfo.name}</span>
            <span style={s.rankIcon}>⚡</span>
          </div>
        </div>
        <div style={s.xpBarTrack}>
          <div
            style={{
              ...s.xpBarFill,
              width: `${Math.max(rankInfo.progress * 100, 2)}%`,
            }}
          />
        </div>
        <div style={s.xpLabel}>
          {rankInfo.nextName ? (
            <>
              {rankInfo.xpInTier} / {rankInfo.xpToNext} XP до ранга{" "}
              {rankInfo.nextName}
            </>
          ) : (
            <>{rankInfo.totalXp} XP — максимальный ранг</>
          )}
        </div>
      </section>

      {/* BLOCK 5: Quick Actions 2×2 */}
      <section style={s.quickGrid} className="dash-fade dash-delay-3">
        <button
          type="button"
          style={s.quickCard}
          className="dash-quick-btn"
          onClick={() => navigate("/plan/one")}
        >
          <div style={s.quickEmoji}>🏋️</div>
          <div style={s.quickTitle}>План</div>
          <div style={s.quickHint}>Тренировки</div>
        </button>
        <button
          type="button"
          style={s.quickCard}
          className="dash-quick-btn"
          onClick={() => navigate("/nutrition/today")}
        >
          <div style={s.quickEmoji}>🍎</div>
          <div style={s.quickTitle}>Питание</div>
          <div style={s.quickHint}>Сегодня</div>
        </button>
        <button
          type="button"
          style={s.quickCard}
          className="dash-quick-btn"
          onClick={() => navigate("/progress")}
        >
          <div style={s.quickEmoji}>📊</div>
          <div style={s.quickTitle}>Прогресс</div>
          <div style={s.quickHint}>Данные</div>
        </button>
        <button
          type="button"
          style={s.quickCard}
          className="dash-quick-btn"
          onClick={() => navigate("/coach")}
        >
          <div style={s.quickEmoji}>🤖</div>
          <div style={s.quickTitle}>Тренер</div>
          <div style={s.quickHint}>Задать вопрос</div>
        </button>
      </section>

      <div style={{ height: 120 }} />
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const glassCard: React.CSSProperties = {
  borderRadius: 18,
  padding: "16px 16px",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
  border: "1px solid rgba(255,255,255,0.6)",
  boxShadow:
    "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

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
    border: "1px solid rgba(255,255,255,0.85)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(242,242,247,0.9) 100%)",
    boxShadow:
      "0 12px 22px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
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
  dsDotPitScheduled: {
    background: "linear-gradient(180deg, #9ea1a8 0%, #c2c5cc 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(17,24,39,0.32), inset 0 -1px 0 rgba(255,255,255,0.5)",
  } as React.CSSProperties,
  dsDotPitCompleted: {
    background: "linear-gradient(180deg, #c9f3d9 0%, #ddf7e7 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(34,197,94,0.25), inset 0 -1px 0 rgba(255,255,255,0.8)",
  } as React.CSSProperties,

  // ===== BLOCK 3: Next Action CTA =====
  ctaCard: {
    borderRadius: 18,
    padding: "20px 18px",
    background:
      "radial-gradient(140% 120% at 8% 10%, rgba(255,214,232,0.9) 0%, rgba(255,214,232,0) 45%), radial-gradient(120% 120% at 85% 15%, rgba(173,185,255,0.85) 0%, rgba(173,185,255,0) 55%), radial-gradient(140% 140% at 78% 85%, rgba(243,155,235,0.8) 0%, rgba(243,155,235,0) 55%), linear-gradient(135deg, rgba(248,214,236,0.9) 0%, rgba(201,178,245,0.9) 45%, rgba(141,164,241,0.9) 100%)",
    border: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 210,
    height: 210,
    position: "relative",
    overflow: "hidden",
  },
  dayCardBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    height: "100%",
    flex: 1,
  },
  dayHeader: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    fontWeight: 600,
    lineHeight: 1,
  },
  dayTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
    letterSpacing: -0.5,
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
    width: "100%",
    justifyContent: "space-between",
  },
  dayBtnIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  dayBtnArrow: {
    fontSize: 18,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  // ===== BLOCK 4: Progress =====
  progressCard: {
    ...glassCard,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  progressTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressStreak: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  streakIcon: {
    fontSize: 18,
  },
  streakValue: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1e1f22",
  },
  progressRank: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  rankName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1e1f22",
  },
  rankIcon: {
    fontSize: 16,
  },
  xpBarTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    background: "rgba(30, 31, 34, 0.08)",
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "#1e1f22",
    transition: "width 600ms ease-out",
  },
  xpLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "rgba(30, 31, 34, 0.5)",
  },

  // ===== BLOCK 5: Quick Actions 2×2 =====
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  quickCard: {
    ...glassCard,
    padding: "18px 14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    textAlign: "center",
    cursor: "pointer",
    minHeight: 110,
    color: "#1e1f22",
  },
  quickEmoji: {
    fontSize: 28,
    lineHeight: 1,
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1e1f22",
    lineHeight: 1.2,
  },
  quickHint: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(30, 31, 34, 0.5)",
    lineHeight: 1.2,
  },
};
