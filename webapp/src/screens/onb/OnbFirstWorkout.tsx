// webapp/src/screens/onb/OnbFirstWorkout.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import smotrchasImg from "@/assets/smotrchas.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

const HOLD_DURATION_MS = 1800;

// ── Date picker (scroll-snap like OnbWeight) ──────────────────
const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DATE_ITEM_W = 64; // px width of each date slot
const DATE_COUNT = 37;
const DATE_PAST_DAYS = 7;
const DATE_VISIBLE = 5;
const TIME_ITEM_H = 44;
const TIME_VISIBLE = 5;
const TIME_FADE_H = TIME_ITEM_H * 2;
const TIME_COL_W = DATE_ITEM_W;
const TIME_COL_GAP = 14;
const TIME_INDICATOR_OFFSET = TIME_COL_W / 2 + TIME_COL_GAP / 2;

type DateItem = { date: Date; dow: string; day: number; idx: number };

const REMINDER_OPTIONS = [
  "Не напоминать",
  "В момент события",
  "За 5 минут",
  "За 15 минут",
  "За 30 минут",
  "За 1 час",
  "За 1 день",
];

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

export default function OnbFirstWorkout({ onComplete, onBack }: Props) {
  const nav = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderValue, setReminderValue] = useState(REMINDER_OPTIONS[3]);
  const reminderRef = useRef<HTMLDivElement>(null);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastHapticRef = useRef<number>(0);

  // Date picker state (scroll-snap centered, like OnbWeight)
  const dates = useMemo(() => buildDates(DATE_COUNT, DATE_PAST_DAYS), []);
  const [activeIdx, setActiveIdx] = useState(DATE_PAST_DAYS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollStopTimer = useRef<number | null>(null);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const [activeHour, setActiveHour] = useState(() => new Date().getHours());
  const [activeMinute, setActiveMinute] = useState(() => new Date().getMinutes());
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const hourRafRef = useRef<number | null>(null);
  const minuteRafRef = useRef<number | null>(null);
  const hourStopTimer = useRef<number | null>(null);
  const minuteStopTimer = useRef<number | null>(null);

  // Ensure initial scroll aligns to today's date
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: activeIdx * DATE_ITEM_W, behavior: "auto" });
  }, []);

  // Ensure initial scroll aligns to current time
  useEffect(() => {
    hourRef.current?.scrollTo({ top: activeHour * TIME_ITEM_H, behavior: "auto" });
    minuteRef.current?.scrollTo({ top: activeMinute * TIME_ITEM_H, behavior: "auto" });
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
      fireHapticImpact("light");
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
        if (clamped !== activeHour) setActiveHour(clamped);
      });
    }
    if (hourStopTimer.current) window.clearTimeout(hourStopTimer.current);
    hourStopTimer.current = window.setTimeout(() => {
      const el = hourRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, hours.length - 1));
      if (clamped !== activeHour) setActiveHour(clamped);
      el.scrollTo({ top: clamped * TIME_ITEM_H, behavior: "smooth" });
      fireHapticImpact("light");
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
        if (clamped !== activeMinute) setActiveMinute(clamped);
      });
    }
    if (minuteStopTimer.current) window.clearTimeout(minuteStopTimer.current);
    minuteStopTimer.current = window.setTimeout(() => {
      const el = minuteRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, minutes.length - 1));
      if (clamped !== activeMinute) setActiveMinute(clamped);
      el.scrollTo({ top: clamped * TIME_ITEM_H, behavior: "smooth" });
      fireHapticImpact("light");
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
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
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

  const canConfirm = !confirmed;

  const startHold = () => {
    if (!canConfirm || isHolding) return;
    setIsHolding(true);
    holdStartRef.current = performance.now();
    lastHapticRef.current = 0;

    const tick = () => {
      const now = performance.now();
      const start = holdStartRef.current || now;
      const progress = Math.min((now - start) / HOLD_DURATION_MS, 1);
      setHoldProgress(progress);
      const freq = Math.max(60, 220 - progress * 150);
      if (now - lastHapticRef.current >= freq) {
        lastHapticRef.current = now;
        if (progress < 0.4) fireHapticImpact("light");
        else if (progress < 0.75) fireHapticImpact("medium");
        else fireHapticImpact("heavy");
      }
      if (progress >= 1) {
        setIsHolding(false);
        setConfirmed(true);
        setShowConfetti(true);
        fireHapticImpact("heavy");
        window.setTimeout(() => setShowConfetti(false), 1200);
        window.setTimeout(() => onComplete(), 900);
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
  };

  const stopHold = () => {
    if (!isHolding || confirmed) return;
    setIsHolding(false);
    setHoldProgress(0);
    lastHapticRef.current = 0;
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
  };

  const progressDeg = Math.round(holdProgress * 360);
  const ringStyle: React.CSSProperties = {
    opacity: holdProgress > 0 ? 1 : 0,
    background: `conic-gradient(from -90deg, #22d3ee 0deg, #22d3ee ${progressDeg}deg, rgba(30,31,34,0.12) ${progressDeg}deg 360deg)`,
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
          100% { opacity: 0; transform: translateY(12px); }
        }
        .onb-fade-target { opacity: 0; }
        .onb-fade { animation: onbFadeUp 520ms ease-out both; }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 240ms; }
        .onb-leave { animation: onbFadeDown 220ms ease-in both; }
        .date-track::-webkit-scrollbar { display: none; }
        .date-item {
          appearance: none; outline: none; border: none; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .time-track::-webkit-scrollbar { display: none; }
        .time-item {
          appearance: none; outline: none; border: none; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
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
        @media (prefers-reduced-motion: reduce) {
          .onb-fade, .onb-leave { animation: none !important; }
          .onb-fade-target { opacity: 1 !important; transform: none !important; }
        }
        @keyframes confettiPop {
          0% { opacity: 0; transform: translateY(12px) scale(0.9); }
          20% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-80px) rotate(10deg); }
        }
        .confetti {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 60;
        }
        .confetti span {
          position: absolute;
          width: 8px;
          height: 14px;
          border-radius: 3px;
          opacity: 0;
          animation: confettiPop 900ms ease-out forwards;
        }
      `}</style>

      <div style={s.mascotRow} className="onb-fade onb-fade-delay-2">
        <img src={smotrchasImg} alt="" style={s.mascotImg} />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>
            План идеален! Давай запланируем первую тренировку.
          </span>
        </div>
      </div>

      <div
        style={s.pickerBlock}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}
      >
        <div style={s.segmentRow}>
          <button
            type="button"
            style={{
              ...s.segmentBtn,
              ...(pickerMode === "date" ? s.segmentBtnActive : undefined),
            }}
            onClick={() => {
              fireHapticImpact("light");
              setPickerMode("date");
            }}
          >
            Дата
          </button>
          <button
            type="button"
            style={{
              ...s.segmentBtn,
              ...(pickerMode === "time" ? s.segmentBtnActive : undefined),
            }}
            onClick={() => {
              fireHapticImpact("light");
              setPickerMode("time");
            }}
          >
            Время
          </button>
        </div>

        {pickerMode === "date" ? (
          <div style={s.datePane}>
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
        ) : (
          <div style={s.timePane}>
            <div style={s.timeIndicatorLeft} />
            <div style={s.timeIndicatorRight} />
            <div style={s.timeColonOverlay}>:</div>
            <div style={s.timeFadeTop} />
            <div style={s.timeFadeBottom} />
            <div style={s.timeInner}>
              <div style={s.timeColWrap}>
                <div
                  ref={hourRef}
                  style={s.timeList}
                  className="time-track"
                  onScroll={handleHourScroll}
                >
                  <div style={{ height: TIME_ITEM_H * 2 }} />
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="time-item"
                      style={{ ...s.timeItem, ...(h === activeHour ? s.timeItemActive : {}) }}
                      onClick={() => {
                        setActiveHour(h);
                        hourRef.current?.scrollTo({ top: h * TIME_ITEM_H, behavior: "smooth" });
                        fireHapticImpact("light");
                      }}
                    >
                      {String(h).padStart(2, "0")}
                    </button>
                  ))}
                  <div style={{ height: TIME_ITEM_H * 2 }} />
                </div>
              </div>

              <div style={s.timeColWrap}>
                <div
                  ref={minuteRef}
                  style={s.timeList}
                  className="time-track"
                  onScroll={handleMinuteScroll}
                >
                  <div style={{ height: TIME_ITEM_H * 2 }} />
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="time-item"
                      style={{ ...s.timeItem, ...(m === activeMinute ? s.timeItemActive : {}) }}
                      onClick={() => {
                        setActiveMinute(m);
                        minuteRef.current?.scrollTo({ top: m * TIME_ITEM_H, behavior: "smooth" });
                        fireHapticImpact("light");
                      }}
                    >
                      {String(m).padStart(2, "0")}
                    </button>
                  ))}
                  <div style={{ height: TIME_ITEM_H * 2 }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={reminderRef}
        style={s.reminderWrap}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
      >
        <div style={s.reminderCard}>
          <button
            type="button"
            style={s.reminderRow}
            onClick={() => {
              fireHapticImpact("light");
              setReminderOpen((v) => !v);
            }}
          >
            <span style={s.reminderLabel}>🔔 Уведомления</span>
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
          <div style={s.reminderList}>
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

      {/* Actions */}
      <div style={s.actions} className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}>
        <div style={s.holdWrap}>
          <div style={{ ...s.holdRing, ...ringStyle }} />
          <button
            type="button"
            style={s.primaryBtn}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            disabled={!canConfirm}
          >
            {confirmed ? "Записано! ✅" : "Запланировать"}
          </button>
        </div>
        <button
          type="button"
          style={s.backBtn}
          onClick={() => (onBack ? onBack() : nav(-1))}
        >
          Назад
        </button>
      </div>

      {showConfetti && (
        <div className="confetti" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              style={{
                left: `${8 + (i * 5)}%`,
                top: `${50 + (i % 4) * 8}%`,
                background: ["#1e1f22", "#f97316", "#10b981", "#3b82f6", "#ec4899"][i % 5],
                animationDelay: `${i * 0.02}s`,
              }}
            />
          ))}
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
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#1e1f22",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
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
  holdWrap: {
    position: "relative",
    width: "100%",
    display: "grid",
    placeItems: "center",
  },
  holdRing: {
    position: "absolute",
    inset: -4,
    borderRadius: 20,
    padding: 2,
    pointerEvents: "none",
    filter: "drop-shadow(0 0 6px rgba(34,211,238,0.65))",
    transition: "opacity 120ms ease",
    WebkitMask:
      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    maskComposite: "exclude",
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

  // ── Reminder dropdown ──────────────────────────────────
  reminderWrap: {
    width: DATE_ITEM_W * DATE_VISIBLE,
    alignSelf: "center",
    position: "relative",
    overflow: "visible",
    display: "grid",
    gap: 8,
  },
  reminderCard: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
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
    left: 0,
    right: 0,
    bottom: "calc(100% + 10px)",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.98)",
    boxShadow: "0 18px 36px rgba(0,0,0,0.18)",
    overflow: "hidden",
    zIndex: 5,
  },
  reminderOption: {
    width: "100%",
    padding: "12px 14px",
    border: "none",
    background: "transparent",
    fontSize: 16,
    fontWeight: 500,
    color: "#1e1f22",
    textAlign: "left",
    cursor: "pointer",
  },
  reminderOptionActive: {
    background: "rgba(30,31,34,0.06)",
    fontWeight: 600,
  },

  // ── Picker block (date/time) ────────────────────────────
  pickerBlock: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "hidden",
    alignSelf: "center",
    width: DATE_ITEM_W * DATE_VISIBLE,
    padding: "12px 12px 14px",
    display: "grid",
    gap: 10,
  },
  segmentRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    padding: 4,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.7)",
    background: "rgba(255,255,255,0.55)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  segmentBtn: {
    borderRadius: 12,
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 15,
    fontWeight: 600,
    padding: "8px 0",
    cursor: "pointer",
  },
  segmentBtnActive: {
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 6px 12px rgba(0,0,0,0.12)",
  },
  datePane: {
    position: "relative",
    width: "100%",
    height: TIME_ITEM_H * TIME_VISIBLE,
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
  },
  dateIndicator: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 64,
    height: 64,
    transform: "translate(-50%, -50%)",
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
  timePane: {
    position: "relative",
    width: "100%",
    height: TIME_ITEM_H * TIME_VISIBLE,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  timeInner: {
    position: "relative",
    zIndex: 2,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: TIME_COL_GAP,
    padding: "0 10px",
  },
  timeIndicatorLeft: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 56,
    height: 56,
    transform: `translate(-50%, -50%) translateX(-${TIME_INDICATOR_OFFSET}px)`,
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
  timeIndicatorRight: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 56,
    height: 56,
    transform: `translate(-50%, -50%) translateX(${TIME_INDICATOR_OFFSET}px)`,
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
  timeColonOverlay: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 28,
    fontWeight: 700,
    color: "#1e1f22",
    zIndex: 4,
    pointerEvents: "none",
  },
  timeColWrap: {
    position: "relative",
    height: "100%",
    overflow: "hidden",
    width: TIME_COL_W,
  },
  timeFadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: TIME_FADE_H,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 3,
  },
  timeFadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: TIME_FADE_H,
    background: "linear-gradient(0deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 3,
  },
  timeList: {
    maxHeight: "100%",
    width: "100%",
    overflowY: "auto",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
    position: "relative",
    zIndex: 0,
  },
  timeItem: {
    width: "100%",
    height: TIME_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    fontWeight: 500,
    color: "rgba(30,31,34,0.35)",
    scrollSnapAlign: "center",
    background: "transparent",
    border: "none",
    padding: 0,
  },
  timeItemActive: {
    color: "#111",
    fontWeight: 700,
    fontSize: 26,
  },
};
