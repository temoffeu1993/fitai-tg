// webapp/src/screens/onb/OnbFirstWorkout.tsx
// Emotional commitment screen: user picks date/time for first workout
// Hold-to-confirm button + confetti celebration on success
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import maleRobotImg from "@/assets/robonew.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

// ============================================================================
// DATE HELPERS
// ============================================================================

const DAY_NAMES_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function buildDateOptions(): Array<{ date: Date; label: string; sub: string }> {
  const now = new Date();
  const result: Array<{ date: Date; label: string; sub: string }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    let label: string;
    if (i === 0) label = "Сегодня";
    else if (i === 1) label = "Завтра";
    else label = DAY_NAMES_SHORT[d.getDay()];
    result.push({ date: d, label, sub: String(d.getDate()) });
  }
  return result;
}

function defaultTime(): string {
  const h = new Date().getHours();
  return h < 14 ? "18:00" : "09:00";
}

const TIME_PRESETS = ["06:00", "09:00", "12:00", "18:00", "20:00"];
const REMINDER_OPTIONS = [
  { label: "За 15 мин", value: 15 },
  { label: "За 30 мин", value: 30 },
  { label: "За 1 час", value: 60 },
  { label: "Не напоминать", value: 0 },
];

// ============================================================================
// CONFETTI (pure CSS, no libraries)
// ============================================================================

const CONFETTI_COLORS = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96E6A1", "#DDA0DD", "#F7DC6F", "#BB8FCE"];
const CONFETTI_COUNT = 40;

function ConfettiOverlay({ onDone }: { onDone: () => void }) {
  const pieces = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.8 + Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotation: Math.random() * 360,
      size: 6 + Math.random() * 6,
      shape: Math.random() > 0.5 ? "square" : "circle",
    }));
  }, []);

  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={confettiStyles.overlay}>
      <style>{`
        @keyframes confettiFall {
          0% { opacity: 1; transform: translateY(-20vh) rotate(0deg) scale(1); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translateY(105vh) rotate(720deg) scale(0.3); }
        }
        @keyframes celebrateText {
          0% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.shape === "circle" ? p.size : p.size * 1.6,
            borderRadius: p.shape === "circle" ? "50%" : 2,
            background: p.color,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s both`,
            zIndex: 1,
          }}
        />
      ))}
      <div style={confettiStyles.textWrap}>
        <div style={confettiStyles.celebrateText}>Первый шаг сделан!</div>
        <div style={confettiStyles.celebrateEmoji}>🚀</div>
      </div>
    </div>
  );
}

const confettiStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    pointerEvents: "none",
    overflow: "hidden",
  },
  textWrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  celebrateText: {
    fontSize: 28,
    fontWeight: 800,
    color: "#1e1f22",
    animation: "celebrateText 600ms ease-out 200ms both",
    textAlign: "center",
  },
  celebrateEmoji: {
    fontSize: 48,
    marginTop: 12,
    animation: "celebrateText 600ms ease-out 400ms both",
  },
};

// ============================================================================
// HOLD-TO-CONFIRM BUTTON
// ============================================================================

const HOLD_DURATION = 1500; // ms

function HoldButton({
  onConfirm,
  disabled,
}: {
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const hapticStages = useRef<Set<number>>(new Set());

  const animate = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(elapsed / HOLD_DURATION, 1);
    setProgress(p);

    // Haptic feedback at milestones
    if (p >= 0.25 && !hapticStages.current.has(25)) {
      hapticStages.current.add(25);
      fireHapticImpact("medium");
    }
    if (p >= 0.5 && !hapticStages.current.has(50)) {
      hapticStages.current.add(50);
      fireHapticImpact("medium");
    }
    if (p >= 0.75 && !hapticStages.current.has(75)) {
      hapticStages.current.add(75);
      fireHapticImpact("medium");
    }

    if (p >= 1) {
      setDone(true);
      fireHapticImpact("rigid");
      onConfirm();
      return;
    }
    rafRef.current = requestAnimationFrame(animate);
  }, [onConfirm]);

  const startHold = useCallback(() => {
    if (disabled || done) return;
    fireHapticImpact("light");
    setIsHolding(true);
    setProgress(0);
    startRef.current = Date.now();
    hapticStages.current.clear();
    rafRef.current = requestAnimationFrame(animate);
  }, [disabled, done, animate]);

  const cancelHold = useCallback(() => {
    if (done) return;
    setIsHolding(false);
    setProgress(0);
    cancelAnimationFrame(rafRef.current);
    hapticStages.current.clear();
  }, [done]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const label = done
    ? "Готово! 🎉"
    : isHolding
      ? "Удерживай..."
      : "Удерживай чтобы запланировать";

  return (
    <div
      style={{
        ...holdBtnStyles.wrap,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={e => e.preventDefault()}
      role="button"
      tabIndex={0}
    >
      {/* Progress fill */}
      <div
        style={{
          ...holdBtnStyles.fill,
          width: `${progress * 100}%`,
          opacity: isHolding || done ? 1 : 0,
        }}
      />
      {/* Label */}
      <span style={holdBtnStyles.label}>{label}</span>
    </div>
  );
}

const holdBtnStyles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "relative",
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
    overflow: "hidden",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    textAlign: "center",
  },
  fill: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(90deg, #4ECDC4 0%, #45B7D1 50%, #96E6A1 100%)",
    borderRadius: 16,
    transition: "opacity 120ms ease",
    zIndex: 0,
  },
  label: {
    position: "relative",
    zIndex: 1,
    pointerEvents: "none",
  },
};

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function OnbFirstWorkout({ onComplete, onBack }: Props) {
  const [mascotReady, setMascotReady] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  // Form state
  const dateOptions = useMemo(buildDateOptions, []);
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedTime, setSelectedTime] = useState(defaultTime);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [reminder, setReminder] = useState(30);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Preload mascot
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = maleRobotImg;
    const done = () => { if (!cancelled) setMascotReady(true); };
    const anyImg = img as any;
    if (typeof anyImg.decode === "function") {
      anyImg.decode().then(done).catch(() => { img.onload = done; img.onerror = done; });
    } else {
      img.onload = done;
      img.onerror = done;
    }
    return () => { cancelled = true; };
  }, []);

  // Reveal content immediately
  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Scroll to top
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const handleConfirmed = useCallback(() => {
    setShowConfetti(true);
  }, []);

  const handleConfettiDone = useCallback(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onComplete();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onComplete(), 300);
  }, [onComplete]);

  const handleBack = () => {
    if (isLeaving || showConfetti) return;
    if (!onBack) return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) { onBack(); return; }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onBack(), 220);
  };

  const handleTimeChip = (time: string) => {
    fireHapticImpact("light");
    setSelectedTime(time);
    setCustomTimeOpen(false);
  };

  const handleCustomTime = () => {
    fireHapticImpact("light");
    setCustomTimeOpen(true);
    // Focus native time input after render
    setTimeout(() => timeInputRef.current?.showPicker?.(), 50);
  };

  const handleDateChip = (idx: number) => {
    fireHapticImpact("light");
    setSelectedDateIdx(idx);
  };

  const handleReminderChip = (val: number) => {
    fireHapticImpact("light");
    setReminder(val);
  };

  const isTimePreset = TIME_PRESETS.includes(selectedTime);

  return (
    <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
      <ScreenStyles />

      {/* Confetti overlay */}
      {showConfetti && <ConfettiOverlay onDone={handleConfettiDone} />}

      {/* Mascot + Bubble */}
      <div style={s.mascotRow} className="onb-fade onb-fade-delay-1">
        <img
          src={maleRobotImg}
          alt=""
          style={{ ...s.mascotImg, ...(mascotReady ? undefined : s.mascotHidden) }}
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>
            План идеален. Но он не сработает без твоего решения.{"\n"}Когда стартуем?
          </span>
        </div>
      </div>

      {/* Main card */}
      <div
        style={s.card}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}
      >
        {/* Section: Date */}
        <div style={s.sectionHeader}>
          <span style={s.sectionIcon}>📅</span>
          <span style={s.sectionLabel}>Дата</span>
        </div>
        <div style={s.chipsScroller}>
          <div style={s.chipsRow}>
            {dateOptions.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                style={{
                  ...s.dateChip,
                  ...(idx === selectedDateIdx ? s.chipActive : s.chipInactive),
                }}
                className="chip-btn"
                onClick={() => handleDateChip(idx)}
              >
                <span style={s.dateChipLabel}>{opt.label}</span>
                <span style={{
                  ...s.dateChipSub,
                  color: idx === selectedDateIdx ? "rgba(255,255,255,0.7)" : "rgba(30,31,34,0.4)",
                }}>{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Section: Time */}
        <div style={{ ...s.sectionHeader, marginTop: 20 }}>
          <span style={s.sectionIcon}>🕐</span>
          <span style={s.sectionLabel}>Время</span>
        </div>
        <div style={s.chipsWrap}>
          {TIME_PRESETS.map(time => (
            <button
              key={time}
              type="button"
              style={{
                ...s.timeChip,
                ...(selectedTime === time && !customTimeOpen ? s.chipActive : s.chipInactive),
              }}
              className="chip-btn"
              onClick={() => handleTimeChip(time)}
            >
              {time}
            </button>
          ))}
          <button
            type="button"
            style={{
              ...s.timeChip,
              ...(customTimeOpen || (!isTimePreset && !customTimeOpen) ? s.chipActive : s.chipInactive),
            }}
            className="chip-btn"
            onClick={handleCustomTime}
          >
            {customTimeOpen || !isTimePreset ? selectedTime : "Другое"}
          </button>
          {/* Hidden native time input */}
          <input
            ref={timeInputRef}
            type="time"
            value={selectedTime}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedTime(e.target.value);
              }
            }}
            style={s.hiddenTimeInput}
            tabIndex={-1}
          />
        </div>

        {/* Section: Reminder */}
        <div style={{ ...s.sectionHeader, marginTop: 20 }}>
          <span style={s.sectionIcon}>🔔</span>
          <span style={s.sectionLabel}>Напоминание</span>
        </div>
        <div style={s.chipsWrap}>
          {REMINDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={{
                ...s.timeChip,
                ...(reminder === opt.value ? s.chipActive : s.chipInactive),
              }}
              className="chip-btn"
              onClick={() => handleReminderChip(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div
        style={s.actions}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
      >
        <HoldButton
          onConfirm={handleConfirmed}
          disabled={showConfetti || isLeaving}
        />
        {onBack && (
          <button type="button" style={s.backBtn} onClick={handleBack}>
            Назад
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN STYLES (animations)
// ============================================================================

function ScreenStyles() {
  return (
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
      .onb-fade-delay-2 { animation-delay: 200ms; }
      .onb-fade-delay-3 { animation-delay: 320ms; }
      .onb-leave { animation: onbFadeDown 220ms ease-in both; }
      .speech-bubble:before {
        content: ""; position: absolute;
        left: -8px; top: 18px; width: 0; height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid rgba(255,255,255,0.9);
        filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
      }
      .chip-btn {
        appearance: none; outline: none; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 120ms ease;
      }
      .chip-btn:active {
        transform: scale(0.95);
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .chip-btn { transition: none !important; }
      }
    `}</style>
  );
}

// ============================================================================
// INLINE STYLES
// ============================================================================

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 160px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
  },

  // Mascot
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
  mascotHidden: { opacity: 0 },
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

  // Card
  card: {
    borderRadius: 20,
    padding: "20px 18px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  },

  // Section headers
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionIcon: { fontSize: 18 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1e1f22",
  },

  // Date chips (horizontal scroll)
  chipsScroller: {
    overflowX: "auto",
    overflowY: "hidden",
    marginLeft: -18,
    marginRight: -18,
    paddingLeft: 18,
    paddingRight: 18,
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  chipsRow: {
    display: "flex",
    gap: 8,
    paddingBottom: 2,
    width: "max-content",
  },
  dateChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "8px 14px",
    borderRadius: 12,
    border: "1px solid transparent",
    minWidth: 56,
    fontSize: 13,
    fontWeight: 600,
  },
  dateChipLabel: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  dateChipSub: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
  },

  // Time + reminder chips (wrap)
  chipsWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    position: "relative",
  },
  timeChip: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid transparent",
    fontSize: 14,
    fontWeight: 600,
  },

  // Chip states
  chipActive: {
    background: "#1e1f22",
    color: "#fff",
    border: "1px solid #1e1f22",
  },
  chipInactive: {
    background: "rgba(30,31,34,0.06)",
    color: "#1e1f22",
    border: "1px solid rgba(30,31,34,0.08)",
  },

  // Hidden time input (positioned behind "Другое" chip)
  hiddenTimeInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
    pointerEvents: "none",
  },

  // Actions
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
};
