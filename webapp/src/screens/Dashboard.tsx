// webapp/src/screens/Dashboard.tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getPlannedWorkouts, type PlannedWorkout } from "@/api/schedule";
import { fireHapticImpact } from "@/utils/haptics";

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
const DASH_MASCOT_W = 120;

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

function getMascotText(
  stats: HistorySnapshot,
  nextWorkout: PlannedWorkout | null
): string {
  const todayISO = toISODate(new Date());

  if (stats.total === 0) {
    return "Программа готова — осталось только начать";
  }
  if (nextWorkout && nextWorkout.scheduledFor === todayISO) {
    return "Сегодня день тренировки. Готов?";
  }
  if (stats.completedDates.includes(todayISO)) {
    return "Хорошая работа сегодня! Отдых — часть прогресса";
  }
  if (
    stats.lastCompletedAt &&
    Date.now() - stats.lastCompletedAt > 3 * 86400000
  ) {
    return "Рад тебя видеть! Продолжим?";
  }
  return "Регулярность — ключ к результату";
}

function formatScheduledDate(scheduledFor: string): string {
  try {
    const d = new Date(scheduledFor + "T12:00:00");
    return d.toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
    });
  } catch {
    return scheduledFor;
  }
}

function getWorkoutTitle(workout: PlannedWorkout): string {
  const plan = workout.plan;
  if (plan?.title) return plan.title;
  if (plan?.name) return plan.name;
  if (plan?.label) return plan.label;
  if (plan?.scheme_label) return plan.scheme_label;
  return "Тренировка";
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
      return;
    }
    try {
      const list = await getPlannedWorkouts();
      setPlannedWorkouts(Array.isArray(list) ? list : []);
    } catch {
      setPlannedWorkouts([]);
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
  const [dsActiveIdx, setDsActiveIdx] = useState(
    dsTodayIdx >= 0 ? dsTodayIdx : DATE_PAST_DAYS
  );
  const dsScrollRef = useRef<HTMLDivElement>(null);
  const dsScrollRafRef = useRef<number | null>(null);
  const dsScrollStopTimer = useRef<number | null>(null);
  const dsLastTickRef = useRef<number | null>(null);
  const dsSuppressHapticsRef = useRef(true);

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
    return set;
  }, [plannedWorkouts]);

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

  const nextWorkout = useMemo(() => {
    return (
      plannedWorkouts
        .filter(
          (w) =>
            (w.status === "scheduled" || w.status === "pending") &&
            w.scheduledFor >= todayISO
        )
        .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0] || null
    );
  }, [plannedWorkouts, todayISO]);

  const rankInfo = useMemo(() => xpRankInfo(historyStats.xp), [historyStats.xp]);

  const weekDays = useMemo(() => getWeekDays(), []);

  const mascotText = useMemo(
    () => getMascotText(historyStats, nextWorkout),
    [historyStats, nextWorkout]
  );

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

  const isWorkoutToday = nextWorkout?.scheduledFor === todayISO;

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
        .speech-bubble:before {
          content: "";
          position: absolute;
          left: -8px;
          top: 18px;
          width: 0;
          height: 0;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-right: 8px solid rgba(255,255,255,0.9);
          filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
        }
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
        @media (prefers-reduced-motion: reduce) {
          .dash-fade { animation: none !important; opacity: 1 !important; transform: none !important; }
          .dash-primary-btn, .dash-quick-btn { transition: none !important; }
        }
      `}</style>

      {/* BLOCK 1: Mascot + Contextual Bubble */}
      <section style={s.mascotRow} className="dash-fade dash-delay-1">
        <img
          src={MASCOT_SRC}
          alt="Моро"
          style={s.mascotImg}
          loading="eager"
          decoding="async"
          draggable={false}
        />
        <div style={s.bubble} className="speech-bubble">
          <div style={s.bubbleGreeting}>Привет, {name}!</div>
          <div style={s.bubbleText}>{mascotText}</div>
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
        <div style={s.ctaHeader}>
          <span style={s.ctaHeaderIcon}>{isWorkoutToday ? "🔥" : "⭐"}</span>
          <span style={s.ctaHeaderLabel}>Следующее действие</span>
        </div>
        {nextWorkout ? (
          <>
            <div style={s.ctaTitle}>
              {isWorkoutToday
                ? "Пора тренироваться"
                : getWorkoutTitle(nextWorkout)}
            </div>
            <div style={s.ctaDate}>
              {isWorkoutToday
                ? getWorkoutTitle(nextWorkout)
                : formatScheduledDate(nextWorkout.scheduledFor)}
            </div>
            <button
              type="button"
              style={s.primaryBtn}
              className="dash-primary-btn"
              onClick={() => navigate("/plan/one")}
            >
              {isWorkoutToday ? "Начать тренировку" : "Посмотреть план"}
            </button>
          </>
        ) : (
          <>
            <div style={s.ctaTitle}>Запланируй тренировку</div>
            <div style={s.ctaDate}>
              Выбери программу и назначь дату
            </div>
            <button
              type="button"
              style={s.primaryBtn}
              className="dash-primary-btn"
              onClick={() => navigate("/plan/one")}
            >
              Выбрать тренировку
            </button>
          </>
        )}
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

  // ===== BLOCK 1: Mascot + Bubble =====
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: DASH_MASCOT_W,
    maxWidth: DASH_MASCOT_W,
    height: "auto",
    objectFit: "contain",
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.6)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    color: "#0f172a",
    boxShadow:
      "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  bubbleGreeting: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e1f22",
    lineHeight: 1.2,
    marginBottom: 4,
  },
  bubbleText: {
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
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow:
      "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  ctaHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  ctaHeaderIcon: {
    fontSize: 16,
  },
  ctaHeaderLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.15,
    letterSpacing: -0.3,
  },
  ctaDate: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(30, 31, 34, 0.6)",
    lineHeight: 1.3,
    marginBottom: 8,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
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
