// webapp/src/screens/onb/OnbFirstWorkout.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import smotrchasImg from "@/assets/smotrchas.webp";
import morobotImg from "@/assets/morobot.webp";
import { generatePlan } from "@/api/plan";
import {
  getScheduleOverview,
  reschedulePlannedWorkout,
  type PlannedWorkout,
} from "@/api/schedule";
import { fireHapticImpact } from "@/utils/haptics";
import { useTypewriterText } from "@/hooks/useTypewriterText";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

type Phase = "form" | "leaving" | "success";

// ── Date picker (scroll-snap like OnbWeight) ──────────────────
const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DATE_ITEM_W = 64; // px width of each date slot
const DATE_COUNT = 37;
const DATE_PAST_DAYS = 7;
const DATE_VISIBLE = 5;
const TIME_ITEM_H = 96;
const TIME_VISIBLE = 1;
const TIME_FADE_H = 0;
const TIME_COL_GAP = 14;
const HOUR_BASE = 24;
const MIN_BASE = 60;
const HOUR_CYCLES = 7;
const MIN_CYCLES = 7;
const HOUR_MID = Math.floor(HOUR_CYCLES / 2);
const MIN_MID = Math.floor(MIN_CYCLES / 2);
const SCHEDULE_CACHE_KEY = "schedule_cache_v1";

type DateItem = { date: Date; dow: string; day: number; idx: number };

const REMINDER_OPTIONS = [
  "За 1 час",
  "За 30 минут",
  "За 15 минут",
  "За 5 минут",
  "В момент события",
  "Не напоминать",
  "За 1 день",
];
const FORM_BUBBLE_TARGET = "План идеален! Давай запланируем первую тренировку.";
const SUCCESS_BUBBLE_PREFIX = "Еее! Жду первую тренировку!\n";

function buildDates(count: number, offsetDays: number): DateItem[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i - offsetDays);
    return {
      date: d,
      dow: DAY_SHORT[d.getDay()],
      day: d.getDate(),
      idx: i,
    };
  });
}

function toISODateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toHHMM(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toDayIndex(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function plannedWorkoutSort(a: PlannedWorkout, b: PlannedWorkout): number {
  const ai = toDayIndex((a?.plan as any)?.dayIndex);
  const bi = toDayIndex((b?.plan as any)?.dayIndex);
  if (ai != null && bi != null && ai !== bi) return ai - bi;
  if (ai != null && bi == null) return -1;
  if (ai == null && bi != null) return 1;
  const at = a?.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
  const bt = b?.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
  return at - bt;
}

function pickFirstWorkoutFromPlan(plannedWorkouts: PlannedWorkout[]): PlannedWorkout | null {
  const active = plannedWorkouts.filter((w) => w && w.id && w.status !== "cancelled" && w.status !== "completed");
  if (!active.length) return null;

  const pending = active
    .filter((w) => w.status === "pending")
    .sort(plannedWorkoutSort);
  if (pending.length) return pending[0];

  const scheduled = active
    .filter((w) => w.status === "scheduled")
    .sort(plannedWorkoutSort);
  if (scheduled.length) return scheduled[0];

  return active.slice().sort(plannedWorkoutSort)[0] || null;
}

// ── Confetti: foil popper explosion (JS physics) ─────────────
const FOIL_COLORS = [
  // Each: [face gradient, back gradient] — foil has two sides
  ["linear-gradient(135deg,#f5e6d0,#c9a96e 50%,#f5e6d0)", "linear-gradient(135deg,#b8956a,#e8d5b7 50%,#b8956a)"], // gold
  ["linear-gradient(135deg,#f4f4f5,#a1a1aa 50%,#f4f4f5)", "linear-gradient(135deg,#71717a,#d4d4d8 50%,#71717a)"], // silver
  ["linear-gradient(135deg,#fff1f2,#f9a8d4 50%,#fce7f3)", "linear-gradient(135deg,#ec4899,#fecdd3 50%,#ec4899)"], // rose gold
  ["linear-gradient(135deg,#e0e7ff,#818cf8 50%,#e0e7ff)", "linear-gradient(135deg,#6366f1,#c7d2fe 50%,#6366f1)"], // lavender
  ["linear-gradient(135deg,#d1fae5,#6ee7b7 50%,#d1fae5)", "linear-gradient(135deg,#34d399,#a7f3d0 50%,#34d399)"], // mint
  ["linear-gradient(135deg,#e0f2fe,#7dd3fc 50%,#e0f2fe)", "linear-gradient(135deg,#38bdf8,#bae6fd 50%,#38bdf8)"], // ice blue
  ["linear-gradient(135deg,#fef3c7,#fbbf24 50%,#fef3c7)", "linear-gradient(135deg,#d97706,#fde68a 50%,#d97706)"], // amber
  ["linear-gradient(135deg,#fce4ec,#f06292 50%,#fce4ec)", "linear-gradient(135deg,#c2185b,#f48fb1 50%,#c2185b)"], // hot pink
];
type Particle = {
  el: HTMLSpanElement;
  x: number; y: number;
  vx: number; vy: number;
  rotX: number; rotY: number; rotZ: number;
  vRotX: number; vRotY: number; vRotZ: number;
  w: number; h: number;
  face: string; back: string;
  opacity: number;
  life: number; maxLife: number;
  wobblePhase: number; wobbleSpeed: number;
};
const GRAVITY = 0.12;
const DRAG = 0.985;
const WOBBLE_AMP = 0.6;

function spawnConfetti(container: HTMLDivElement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = vw / 2;
  const cy = vh * 0.45; // explosion origin: center-ish
  const COUNT = 100;
  const particles: Particle[] = [];

  for (let i = 0; i < COUNT; i++) {
    const [face, back] = FOIL_COLORS[Math.floor(Math.random() * FOIL_COLORS.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    const w = 10 + Math.random() * 14;
    const h = 8 + Math.random() * 12;
    const el = document.createElement("span");
    el.style.cssText = `
      position:absolute;left:0;top:0;
      width:${w}px;height:${h}px;
      border-radius:2px;
      backface-visibility:visible;
      will-change:transform;
      pointer-events:none;
      box-shadow:inset 0 0 3px rgba(255,255,255,0.5);
    `;
    container.appendChild(el);
    particles.push({
      el, x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed * (0.7 + Math.random() * 0.6) - 3,
      rotX: Math.random() * 360, rotY: Math.random() * 360, rotZ: Math.random() * 360,
      vRotX: -8 + Math.random() * 16,
      vRotY: -8 + Math.random() * 16,
      vRotZ: -4 + Math.random() * 8,
      w, h, face, back,
      opacity: 1,
      life: 0,
      maxLife: 120 + Math.random() * 80,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.05 + Math.random() * 0.08,
    });
  }

  let raf: number;
  const tick = () => {
    let alive = 0;
    for (const p of particles) {
      p.life++;
      if (p.life > p.maxLife) {
        if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
        continue;
      }
      alive++;
      // physics
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.vx += Math.sin(p.wobblePhase) * WOBBLE_AMP;
      p.wobblePhase += p.wobbleSpeed;
      p.x += p.vx;
      p.y += p.vy;
      p.rotX += p.vRotX;
      p.rotY += p.vRotY;
      p.rotZ += p.vRotZ;
      // fade out in last 30%
      const fadeStart = p.maxLife * 0.7;
      p.opacity = p.life > fadeStart ? 1 - (p.life - fadeStart) / (p.maxLife - fadeStart) : 1;
      // flip face/back based on rotY
      const showBack = (Math.abs(p.rotY % 360) > 90 && Math.abs(p.rotY % 360) < 270);
      p.el.style.background = showBack ? p.back : p.face;
      p.el.style.transform = `translate3d(${p.x}px,${p.y}px,0) rotateX(${p.rotX}deg) rotateY(${p.rotY}deg) rotate(${p.rotZ}deg)`;
      p.el.style.opacity = String(p.opacity);
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  // safety cleanup
  setTimeout(() => {
    cancelAnimationFrame(raf);
    container.innerHTML = "";
  }, 5000);
}

export default function OnbFirstWorkout({ onComplete, onBack }: Props) {
  const nav = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderValue, setReminderValue] = useState(REMINDER_OPTIONS[0]);
  const [reminderWidth, setReminderWidth] = useState<number | null>(null);
  const reminderRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLDivElement>(null);
  const suppressHapticsRef = useRef(true);
  const lastDateTickRef = useRef<number | null>(null);
  const lastHourTickRef = useRef<number | null>(null);
  const lastMinuteTickRef = useRef<number | null>(null);

  // Date picker state (scroll-snap centered, like OnbWeight)
  const dates = useMemo(() => buildDates(DATE_COUNT, DATE_PAST_DAYS), []);
  const defaultDateIdx = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowIso = toISODateLocal(tomorrow);
    const idx = dates.findIndex((item) => toISODateLocal(item.date) === tomorrowIso);
    if (idx >= 0) return idx;
    return Math.min(DATE_PAST_DAYS + 1, dates.length - 1);
  }, [dates]);
  const [activeIdx, setActiveIdx] = useState(defaultDateIdx);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollStopTimer = useRef<number | null>(null);

  const hours = useMemo(
    () => Array.from({ length: HOUR_BASE * HOUR_CYCLES }, (_, i) => i % HOUR_BASE),
    []
  );
  const minutes = useMemo(
    () => Array.from({ length: MIN_BASE * MIN_CYCLES }, (_, i) => i % MIN_BASE),
    []
  );
  const [activeHour, setActiveHour] = useState(9);
  const [activeMinute, setActiveMinute] = useState(0);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const hourRafRef = useRef<number | null>(null);
  const minuteRafRef = useRef<number | null>(null);
  const hourStopTimer = useRef<number | null>(null);
  const minuteStopTimer = useRef<number | null>(null);

  // ── Formatted date for success bubble ──
  const formattedDateTime = useMemo(() => {
    const d = dates[activeIdx]?.date;
    if (!d) return "";
    const h = String(activeHour).padStart(2, "0");
    const m = String(activeMinute).padStart(2, "0");
    const datePart = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    return `${datePart} в ${h}:${m}`;
  }, [dates, activeIdx, activeHour, activeMinute]);

  const persistScheduleCache = (isoDate: string, time: string) => {
    try {
      const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const currentDates =
        parsed && typeof parsed === "object" && parsed.scheduleDates && typeof parsed.scheduleDates === "object"
          ? parsed.scheduleDates
          : {};
      const next = {
        ...(parsed && typeof parsed === "object" ? parsed : {}),
        scheduleDates: {
          ...currentDates,
          [isoDate]: { time },
        },
        ts: Date.now(),
      };
      localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(next));
    } catch {
      // ignore cache write failures
    }
  };

  // ── Confirm handler ──
  const handleConfirm = async () => {
    if (phase !== "form" || isSaving) return;
    const selectedDate = dates[activeIdx]?.date;
    if (!selectedDate) return;

    const isoDate = toISODateLocal(selectedDate);
    const hhmm = toHHMM(activeHour, activeMinute);
    setSaveError(null);
    setIsSaving(true);
    try {
      const scheduledAt = new Date(`${isoDate}T${hhmm}`);
      if (!Number.isFinite(scheduledAt.getTime())) {
        throw new Error("invalid_datetime");
      }

      let overview = await getScheduleOverview();
      let targetWorkout = pickFirstWorkoutFromPlan(overview.plannedWorkouts || []);

      // На новых аккаунтах плана еще может не быть — генерируем неделю и берём первый день схемы.
      if (!targetWorkout) {
        await generatePlan({ force: true });
        overview = await getScheduleOverview();
        targetWorkout = pickFirstWorkoutFromPlan(overview.plannedWorkouts || []);
      }

      if (!targetWorkout?.id) {
        throw new Error("missing_first_workout");
      }

      const utcOffsetMinutes = scheduledAt.getTimezoneOffset();
      const dayUtcOffsetMinutes = new Date(`${isoDate}T00:00`).getTimezoneOffset();
      await reschedulePlannedWorkout(targetWorkout.id, {
        date: isoDate,
        time: hhmm,
        utcOffsetMinutes,
        dayUtcOffsetMinutes,
      });

      persistScheduleCache(isoDate, hhmm);
      try {
        window.dispatchEvent(new Event("schedule_updated"));
        window.dispatchEvent(new Event("planned_workouts_updated"));
      } catch {
        // ignore event dispatch failures
      }
    } catch (err: any) {
      console.error("OnbFirstWorkout handleConfirm error:", err, err?.status, err?.body);
      const detail = err?.body ? JSON.stringify(err.body) : (err?.message ?? String(err));
      setSaveError(`Ошибка: ${detail}`);
      setIsSaving(false);
      fireHapticImpact("light");
      return;
    }

    setPhase("leaving");
    fireHapticImpact("medium");

    setTimeout(() => {
      setPhase("success");
      fireHapticImpact("heavy");
      if (confettiRef.current) {
        confettiRef.current.innerHTML = "";
        spawnConfetti(confettiRef.current);
      }
    }, 400);

    setTimeout(() => {
      setIsSaving(false);
      onComplete();
    }, 3200);
  };

  // Lock scroll on this screen
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevOverflow = root?.style.overflowY;
    const prevOverscroll = root?.style.overscrollBehaviorY;
    const prevScrollBehavior = root?.style.scrollBehavior;
    if (root) {
      root.style.overflowY = "hidden";
      root.style.overscrollBehaviorY = "none";
      root.style.scrollBehavior = "auto";
      root.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    return () => {
      if (root) {
        root.style.overflowY = prevOverflow || "";
        root.style.overscrollBehaviorY = prevOverscroll || "";
        root.style.scrollBehavior = prevScrollBehavior || "";
      }
    };
  }, []);

  // Ensure initial scroll aligns to today's date
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: activeIdx * DATE_ITEM_W, behavior: "auto" });
    lastDateTickRef.current = activeIdx;
  }, []);

  // Ensure initial scroll aligns to current time
  useEffect(() => {
    hourRef.current?.scrollTo({
      top: (HOUR_BASE * HOUR_MID + activeHour) * TIME_ITEM_H,
      behavior: "auto",
    });
    minuteRef.current?.scrollTo({
      top: (MIN_BASE * MIN_MID + activeMinute) * TIME_ITEM_H,
      behavior: "auto",
    });
    lastHourTickRef.current = HOUR_BASE * HOUR_MID + activeHour;
    lastMinuteTickRef.current = MIN_BASE * MIN_MID + activeMinute;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      suppressHapticsRef.current = false;
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  // Sync scroll → activeIdx (live highlight) + snap on stop
  const handleDateScroll = () => {
    if (scrollRafRef.current == null) {
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const el = scrollRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
        const clamped = Math.max(0, Math.min(idx, dates.length - 1));
        if (lastDateTickRef.current !== clamped) {
          lastDateTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }
        if (clamped !== activeIdx) setActiveIdx(clamped);
      });
    }
    if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current);
    scrollStopTimer.current = window.setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
      const clamped = Math.max(0, Math.min(idx, dates.length - 1));
      if (clamped !== activeIdx) setActiveIdx(clamped);
      el.scrollTo({ left: clamped * DATE_ITEM_W, behavior: "smooth" });
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  };

  const handleHourScroll = () => {
    if (hourRafRef.current == null) {
      hourRafRef.current = window.requestAnimationFrame(() => {
        hourRafRef.current = null;
        const el = hourRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / TIME_ITEM_H);
        const clamped = Math.max(0, Math.min(idx, hours.length - 1));
        if (lastHourTickRef.current !== clamped) {
          lastHourTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }
        const value = ((clamped % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
        if (value !== activeHour) setActiveHour(value);
      });
    }
    if (hourStopTimer.current) window.clearTimeout(hourStopTimer.current);
    hourStopTimer.current = window.setTimeout(() => {
      const el = hourRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, hours.length - 1));
      const value = ((clamped % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
      if (value !== activeHour) setActiveHour(value);
      const targetIdx = HOUR_BASE * HOUR_MID + value;
      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  };

  const handleMinuteScroll = () => {
    if (minuteRafRef.current == null) {
      minuteRafRef.current = window.requestAnimationFrame(() => {
        minuteRafRef.current = null;
        const el = minuteRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / TIME_ITEM_H);
        const clamped = Math.max(0, Math.min(idx, minutes.length - 1));
        if (lastMinuteTickRef.current !== clamped) {
          lastMinuteTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }
        const value = ((clamped % MIN_BASE) + MIN_BASE) % MIN_BASE;
        if (value !== activeMinute) setActiveMinute(value);
      });
    }
    if (minuteStopTimer.current) window.clearTimeout(minuteStopTimer.current);
    minuteStopTimer.current = window.setTimeout(() => {
      const el = minuteRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, minutes.length - 1));
      const value = ((clamped % MIN_BASE) + MIN_BASE) % MIN_BASE;
      if (value !== activeMinute) setActiveMinute(value);
      const targetIdx = MIN_BASE * MIN_MID + value;
      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  };

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
      if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current);
      if (hourRafRef.current) window.cancelAnimationFrame(hourRafRef.current);
      if (minuteRafRef.current) window.cancelAnimationFrame(minuteRafRef.current);
      if (hourStopTimer.current) window.clearTimeout(hourStopTimer.current);
      if (minuteStopTimer.current) window.clearTimeout(minuteStopTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!reminderOpen) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      if (!reminderRef.current) return;
      if (!reminderRef.current.contains(e.target as Node)) setReminderOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("touchstart", onClick);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("touchstart", onClick);
    };
  }, [reminderOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const measurer = document.createElement("div");
    measurer.style.position = "absolute";
    measurer.style.visibility = "hidden";
    measurer.style.pointerEvents = "none";
    measurer.style.whiteSpace = "nowrap";
    measurer.style.fontSize = "16px";
    measurer.style.fontWeight = "500";
    measurer.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    measurer.style.padding = "12px 16px";
    document.body.appendChild(measurer);
    let max = 0;
    for (const opt of REMINDER_OPTIONS) {
      measurer.textContent = opt;
      max = Math.max(max, measurer.offsetWidth);
    }
    document.body.removeChild(measurer);
    const viewportMax = typeof window !== "undefined" ? Math.max(0, window.innerWidth - 48) : max;
    setReminderWidth(Math.min(max, viewportMax));
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setShowContent(true);
      return;
    }
    const t = window.setTimeout(() => setShowContent(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  const isLeaving = phase === "leaving";
  const isSuccess = phase === "success";
  const formBubbleTyped = useTypewriterText(isSuccess ? "" : FORM_BUBBLE_TARGET, {
    charIntervalMs: 30,
    startDelayMs: 120,
  });
  const successBubbleTarget = `${SUCCESS_BUBBLE_PREFIX}${formattedDateTime}`;
  const successBubbleTyped = useTypewriterText(isSuccess ? successBubbleTarget : "", {
    charIntervalMs: 30,
    startDelayMs: 120,
  });

  const renderSuccessBubbleText = () => {
    const typed = successBubbleTyped || "\u00A0";
    if (typed.length <= SUCCESS_BUBBLE_PREFIX.length) return <>{typed}</>;
    return (
      <>
        {SUCCESS_BUBBLE_PREFIX}
        <strong style={s.successDateBold}>
          {typed.slice(SUCCESS_BUBBLE_PREFIX.length)}
        </strong>
      </>
    );
  };

  return (
    <div style={s.page}>
      <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes onbFadeDown {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(12px); pointer-events: none; }
        }
        @keyframes successPopIn {
          0% { opacity: 0; transform: scale(0.85) translateY(24px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .onb-fade-target { opacity: 0; }
        .onb-fade { animation: onbFadeUp 520ms ease-out both; }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 240ms; }
        .onb-leave { animation: onbFadeDown 380ms ease-in both; }
        .onb-success-in { animation: successPopIn 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
        .onb-success-in-delay { animation-delay: 120ms; }
        .date-track::-webkit-scrollbar { display: none; }
        .date-item {
          appearance: none; outline: none; border: none; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: pan-x;
        }
        .time-track::-webkit-scrollbar { display: none; }
        .time-item {
          appearance: none; outline: none; border: none; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: pan-y;
        }
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
        .speech-bubble-bottom:before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -10px;
          top: auto;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-top: 10px solid rgba(255,255,255,0.9);
          filter: drop-shadow(0 1px 0 rgba(15, 23, 42, 0.08));
        }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade, .onb-leave, .onb-success-in { animation: none !important; }
          .onb-fade-target { opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* ── CONFETTI LAYER ── */}
      <div
        ref={confettiRef}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 60,
        }}
      />

      {/* ── FORM PHASE: mascot + schedule + actions ── */}
      {!isSuccess && (
        <>
          <div
            style={s.mascotRow}
            className={isLeaving ? "onb-leave" : "onb-fade onb-fade-delay-2"}
          >
            <img src={smotrchasImg} alt="" style={s.mascotImg} />
            <div style={s.bubble} className="speech-bubble">
              <span style={s.bubbleText}>
                {formBubbleTyped || "\u00A0"}
              </span>
            </div>
          </div>

          <div
            style={s.scheduleCard}
            className={
              isLeaving
                ? "onb-leave"
                : `onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`
            }
          >
            <div style={s.dateScroller}>
              <div style={s.dateIndicator} />
              <div style={s.dateFadeL} />
              <div style={s.dateFadeR} />
              <div
                ref={scrollRef}
                style={s.dateTrack}
                className="date-track"
                onScroll={handleDateScroll}
              >
                {dates.map((d, idx) => {
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="date-item"
                      style={{ ...s.dateItem, scrollSnapAlign: "center" }}
                      onClick={() => {
                        fireHapticImpact("light");
                        setActiveIdx(idx);
                        scrollRef.current?.scrollTo({ left: idx * DATE_ITEM_W, behavior: "smooth" });
                      }}
                    >
                      <span
                        style={{
                          ...s.dateDow,
                          ...(active ? s.dateDowActive : undefined),
                        }}
                      >
                        {d.dow}
                      </span>
                      <span
                        style={{
                          ...s.dateNum,
                          ...(active ? s.dateNumActive : undefined),
                        }}
                      >
                        {d.day}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={s.timeWrap}>
              <div style={s.timeColonOverlay}>:</div>
              <div style={s.timeInner}>
                <div style={s.timeColWrap}>
                  <div
                    ref={hourRef}
                    style={s.timeList}
                    className="time-track"
                    onScroll={handleHourScroll}
                  >
                    <div style={{ height: 0 }} />
                    {hours.map((h, idx) => (
                      <button
                        key={`${h}-${idx}`}
                        type="button"
                        className="time-item"
                        style={{ ...s.timeItem, ...(h === activeHour ? s.timeItemActive : {}) }}
                        onClick={() => {
                          const next = (activeHour + 1) % HOUR_BASE;
                          const el = hourRef.current;
                          if (!el) return;
                          const curIdx = Math.round(el.scrollTop / TIME_ITEM_H);
                          const curVal = ((curIdx % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
                          let targetIdx = curIdx - curVal + next;
                          if (next <= curVal) targetIdx += HOUR_BASE;
                          setActiveHour(next);
                          el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
                          fireHapticImpact("light");
                        }}
                      >
                        {String(h).padStart(2, "0")}
                      </button>
                    ))}
                    <div style={{ height: 0 }} />
                  </div>
                </div>

                <div style={s.timeColWrap}>
                  <div
                    ref={minuteRef}
                    style={s.timeList}
                    className="time-track"
                    onScroll={handleMinuteScroll}
                  >
                    <div style={{ height: 0 }} />
                    {minutes.map((m, idx) => (
                      <button
                        key={`${m}-${idx}`}
                        type="button"
                        className="time-item"
                        style={{ ...s.timeItem, ...(m === activeMinute ? s.timeItemActive : {}) }}
                        onClick={() => {
                          const next = (activeMinute + 1) % MIN_BASE;
                          const el = minuteRef.current;
                          if (!el) return;
                          const curIdx = Math.round(el.scrollTop / TIME_ITEM_H);
                          const curVal = ((curIdx % MIN_BASE) + MIN_BASE) % MIN_BASE;
                          let targetIdx = curIdx - curVal + next;
                          if (next <= curVal) targetIdx += MIN_BASE;
                          setActiveMinute(next);
                          el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
                          fireHapticImpact("light");
                        }}
                      >
                        {String(m).padStart(2, "0")}
                      </button>
                    ))}
                    <div style={{ height: 0 }} />
                  </div>
                </div>
              </div>
            </div>

            <div ref={reminderRef} style={s.reminderWrap}>
              <div style={s.reminderCard}>
                <button
                  type="button"
                  style={s.reminderRow}
                  onClick={() => {
                    fireHapticImpact("light");
                    setReminderOpen((v) => !v);
                  }}
                >
                  <span style={s.reminderLabel}>🔔 Напомнить</span>
                  <span style={s.reminderValue}>
                    <span>{reminderValue}</span>
                    <span style={s.reminderChevrons}>
                      <span>▴</span>
                      <span>▾</span>
                    </span>
                  </span>
                </button>
              </div>
              {reminderOpen && (
                <div
                  style={{
                    ...s.reminderList,
                    ...(reminderWidth ? { width: reminderWidth } : null),
                  }}
                >
                  {REMINDER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      style={{
                        ...s.reminderOption,
                        ...(opt === reminderValue ? s.reminderOptionActive : null),
                      }}
                      onClick={() => {
                        setReminderValue(opt);
                        setReminderOpen(false);
                        fireHapticImpact("light");
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div
            style={s.actions}
            className={
              isLeaving
                ? "onb-leave"
                : `onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`
            }
          >
            {saveError ? <div style={s.saveErrorText}>{saveError}</div> : null}
            <button
              type="button"
              style={{ ...s.primaryBtn, ...(isSaving ? s.primaryBtnDisabled : null) }}
              className="intro-primary-btn"
              onClick={handleConfirm}
              disabled={isSaving}
            >
              {isSaving ? "Сохраняем..." : "Запланировать"}
            </button>
            <button
              type="button"
              style={{ ...s.backBtn, ...(isSaving ? s.backBtnDisabled : null) }}
              onClick={() => {
                if (isSaving) return;
                onBack ? onBack() : nav(-1);
              }}
              disabled={isSaving}
            >
              Назад
            </button>
          </div>
        </>
      )}

      {/* ── SUCCESS PHASE ── */}
      {isSuccess && (
        <div style={s.successWrap}>
          <div style={s.successBubbleWrap} className="onb-success-in">
            <div style={s.successBubble} className="speech-bubble-bottom">
              <span style={s.successBubbleText}>{renderSuccessBubbleText()}</span>
            </div>
          </div>

          <div style={s.successMascotWrap} className="onb-success-in onb-success-in-delay">
            <img src={morobotImg} alt="" style={s.successMascotImg} />
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 120px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
    position: "relative",
  },
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: 140,
    height: "auto",
    objectFit: "contain",
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    color: "#1e1f22",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#1e1f22",
    whiteSpace: "pre-line",
  },
  actions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 10,
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
    zIndex: 10,
  },
  saveErrorText: {
    fontSize: 13,
    fontWeight: 500,
    color: "#b91c1c",
    textAlign: "center",
    lineHeight: 1.35,
  },
  primaryBtn: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  primaryBtnDisabled: {
    opacity: 0.72,
    cursor: "default",
    boxShadow: "0 4px 8px rgba(0,0,0,0.14)",
  },
  backBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 16,
    fontWeight: 600,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
  },
  backBtnDisabled: {
    opacity: 0.5,
    cursor: "default",
  },

  // ── Reminder dropdown ──────────────────────────────────
  reminderWrap: {
    width: "100%",
    alignSelf: "stretch",
    position: "relative",
    overflow: "visible",
    display: "grid",
    gap: 8,
    marginTop: 6,
    marginBottom: 0,
  },
  reminderCard: {
    borderRadius: 0,
    border: "none",
    background: "transparent",
    boxShadow: "none",
    padding: 0,
  },
  reminderRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    padding: "16px 18px",
  },
  reminderLabel: {
    fontSize: 18,
    fontWeight: 600,
    color: "#1e1f22",
  },
  reminderValue: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 18,
    fontWeight: 500,
    color: "rgba(30,31,34,0.75)",
  },
  reminderChevrons: {
    display: "grid",
    fontSize: 12,
    lineHeight: 0.8,
    color: "rgba(30,31,34,0.55)",
    textAlign: "center",
  },
  reminderList: {
    position: "absolute",
    right: 0,
    left: "auto",
    transform: "none",
    bottom: "calc(100% + 4px)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.65)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(245,245,250,0.4) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow:
      "0 20px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.35)",
    overflow: "hidden",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: "auto",
    maxWidth: "calc(100vw - 48px)",
  },
  reminderOption: {
    width: "100%",
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    fontSize: 16,
    fontWeight: 500,
    color: "#1e1f22",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  reminderOptionActive: {
    background: "rgba(30,31,34,0.06)",
    fontWeight: 600,
  },

  // ── Schedule block (date + time + reminder) ─────────────
  scheduleCard: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "visible",
    alignSelf: "stretch",
    width: "100%",
    padding: "16px 14px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    marginBottom: 20,
  },
  dateScroller: {
    position: "relative",
    overflow: "visible",
    width: "100%",
  },
  dateIndicator: {
    position: "absolute",
    left: "50%",
    top: 8,
    width: 64,
    height: 64,
    transform: "translateX(-50%)",
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow:
      "0 12px 26px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    pointerEvents: "none",
    zIndex: 1,
  },
  dateFadeL: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DATE_ITEM_W * 1.2,
    background: "linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 3,
  },
  dateFadeR: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: DATE_ITEM_W * 1.2,
    background: "linear-gradient(270deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 3,
  },
  dateTrack: {
    overflowX: "auto",
    overflowY: "hidden",
    whiteSpace: "nowrap",
    scrollSnapType: "x proximity",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    padding: "18px 0 16px",
    paddingLeft: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    paddingRight: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    position: "relative",
    zIndex: 2,
    display: "flex",
  },
  dateItem: {
    width: DATE_ITEM_W,
    minWidth: DATE_ITEM_W,
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 0,
    background: "transparent",
    cursor: "pointer",
  },
  dateDow: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(30,31,34,0.35)",
    lineHeight: 1,
    letterSpacing: 0.3,
  },
  dateDowActive: {
    color: "#1e1f22",
    fontWeight: 600,
  },
  dateNum: {
    fontSize: 24,
    fontWeight: 500,
    color: "rgba(30,31,34,0.3)",
    lineHeight: 1.3,
  },
  dateNumActive: {
    color: "#111",
    fontWeight: 700,
    fontSize: 26,
  },

  // ── Time picker (vertical wheels) ───────────────────────
  timeWrap: {
    borderRadius: 0,
    border: "none",
    background: "transparent",
    position: "relative",
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
    height: TIME_ITEM_H * TIME_VISIBLE,
  },
  timeInner: {
    position: "relative",
    zIndex: 2,
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: TIME_COL_GAP,
    padding: "0 8px",
  },
  timeIndicatorLeft: {},
  timeIndicatorRight: {},
  timeColonOverlay: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 64,
    fontWeight: 800,
    color: "#1e1f22",
    lineHeight: 1,
    zIndex: 4,
    pointerEvents: "none",
  },
  timeColWrap: {
    position: "relative",
    height: "100%",
    overflow: "hidden",
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  timeFadeTop: {},
  timeFadeBottom: {},
  timeList: {
    maxHeight: "100%",
    width: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
    position: "relative",
    zIndex: 0,
    touchAction: "pan-y",
  },
  timeItem: {
    width: "100%",
    height: TIME_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 88,
    fontWeight: 800,
    color: "#1e1f22",
    lineHeight: 1,
    scrollSnapAlign: "center",
    background: "transparent",
    boxShadow: "none",
    border: "none",
    padding: 0,
  },
  timeItemActive: {
    color: "#1e1f22",
    fontWeight: 900,
    fontSize: 92,
    lineHeight: 1,
    background: "transparent",
    boxShadow: "none",
  },

  // ── Success view ──────────────────────────────────────
  successWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    minHeight: "60vh",
  },
  successBubbleWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },
  successBubble: {
    position: "relative",
    padding: "20px 24px",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,245,250,0.75) 100%)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    textAlign: "center",
    maxWidth: 340,
  },
  successBubbleText: {
    fontSize: 20,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "#1e1f22",
    whiteSpace: "pre-line",
  },
  successDateBold: {
    fontWeight: 800,
    fontSize: 22,
    color: "#1e1f22",
  },
  successMascotWrap: {
    display: "flex",
    justifyContent: "center",
    marginTop: -4,
  },
  successMascotImg: {
    width: 220,
    height: "auto",
    objectFit: "contain",
  },
};
