// webapp/src/screens/onb/OnbFirstWorkout.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSelectedScheme, type WorkoutScheme } from "@/api/schemes";
import { useOnboarding } from "@/app/OnboardingProvider";
import maleRobotImg from "@/assets/robonew.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

const HOLD_DURATION_MS = 1800;

const REMINDER_OPTIONS = [
  "Без напоминания",
  "За 15 минут",
  "За 30 минут",
  "За 1 час",
  "За 2 часа",
  "За 1 день",
];

function formatRange(minutes?: number): string {
  if (!minutes || Number.isNaN(minutes)) return "≈ 70–90 мин";
  const min = Math.max(20, Math.round((minutes - 10) / 5) * 5);
  const max = Math.max(min + 10, Math.round((minutes + 10) / 5) * 5);
  return `≈ ${min}–${max} мин`;
}

function normalizeLabel(raw?: string): string {
  if (!raw) return "";
  return raw.toLowerCase();
}

function getFirstWorkoutTitle(scheme?: WorkoutScheme): string {
  if (!scheme) return "Первая тренировка";
  const raw = scheme.dayLabels?.[0]?.label || scheme.dayLabels?.[0]?.focus || scheme.name || "";
  const t = normalizeLabel(raw);
  if (/push|жим/.test(t)) return "Грудь, плечи, трицепс";
  if (/pull|тяга/.test(t)) return "Спина, бицепс";
  if (/legs|ног/.test(t)) return "Ноги, ягодицы";
  if (/upper|верх/.test(t)) return "Верх тела";
  if (/lower|низ/.test(t)) return "Низ тела";
  if (/full|всё тело|все тело/.test(t)) return "Всё тело";
  if (/glute|ягод/.test(t)) return "Ягодицы";
  if (/chest|груд/.test(t)) return "Грудь";
  if (/back|спин/.test(t)) return "Спина";
  if (/shoulder|плеч/.test(t)) return "Плечи";
  if (/arms|рук/.test(t)) return "Руки";
  if (/core|кор|пресс/.test(t)) return "Кор";
  return raw || "Первая тренировка";
}

export default function OnbFirstWorkout({ onComplete, onBack }: Props) {
  const { draft } = useOnboarding();
  const nav = useNavigate();
  const [scheme, setScheme] = useState<WorkoutScheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>("");
  const [reminder, setReminder] = useState(REMINDER_OPTIONS[3]);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hapticTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const selected = await getSelectedScheme();
        if (mounted) setScheme(selected);
      } catch {
        if (mounted) setScheme(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (hapticTimerRef.current) window.clearInterval(hapticTimerRef.current);
    };
  }, []);

  const minutesPerSession = draft?.schedule?.minutesPerSession;
  const durationText = formatRange(minutesPerSession);
  const firstTitle = getFirstWorkoutTitle(scheme || undefined);

  const canConfirm = Boolean(date && time) && !confirmed;

  const startHold = () => {
    if (!canConfirm || isHolding) return;
    setIsHolding(true);
    holdStartRef.current = performance.now();

    if (hapticTimerRef.current) window.clearInterval(hapticTimerRef.current);
    hapticTimerRef.current = window.setInterval(() => {
      const now = performance.now();
      const start = holdStartRef.current || now;
      const progress = Math.min((now - start) / HOLD_DURATION_MS, 1);
      if (progress < 0.4) fireHapticImpact("light");
      else if (progress < 0.75) fireHapticImpact("medium");
      else fireHapticImpact("heavy");
    }, 120);

    const tick = () => {
      const now = performance.now();
      const start = holdStartRef.current || now;
      const progress = Math.min((now - start) / HOLD_DURATION_MS, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        setIsHolding(false);
        setConfirmed(true);
        setShowConfetti(true);
        fireHapticImpact("heavy");
        if (hapticTimerRef.current) window.clearInterval(hapticTimerRef.current);
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
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    if (hapticTimerRef.current) window.clearInterval(hapticTimerRef.current);
  };

  const ringStyle: React.CSSProperties = {
    background: `conic-gradient(#1e1f22 ${Math.round(holdProgress * 360)}deg, rgba(30,31,34,0.12) 0deg)`,
  };

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.mascotRow}>
          <img src={maleRobotImg} alt="" style={s.mascotImg} />
          <div style={s.bubble} className="speech-bubble">
            <span style={s.bubbleText}>Готовим план...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{`
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

      {/* Mascot + Bubble */}
      <div style={s.mascotRow}>
        <img src={maleRobotImg} alt="" style={s.mascotImg} />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>
            План идеален. Но он не сработает без твоего решения. Когда стартуем?
          </span>
        </div>
      </div>

      {/* Main Card */}
      <div style={s.mainCard}>
        <div style={s.mainCardHeader}>
          <span style={s.cardIcon}>🚀</span>
          <span style={s.cardLabel}>Первая тренировка</span>
        </div>
        <div style={s.strategyFocus}>{firstTitle}</div>
        <div style={s.strategyTempoRow}>
          <span style={s.strategyIntensityLabel}>Длительность</span>
          <span style={s.durationValue}>{durationText}</span>
        </div>
        <p style={s.strategyDesc}>Выбери дату и время</p>

        <div style={s.pickerStack}>
          <div style={s.pickerRow}>
            <span style={s.pickerLabel}>Дата</span>
            <span style={s.pickerValue}>{date || "Выбрать"}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={s.pickerInput}
            />
          </div>
          <div style={s.pickerRow}>
            <span style={s.pickerLabel}>Время</span>
            <span style={s.pickerValue}>{time || "Выбрать"}</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={s.pickerInput}
            />
          </div>
          <div style={s.pickerRow}>
            <span style={s.pickerLabel}>Напоминание</span>
            <span style={s.pickerValue}>{reminder}</span>
            <select
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              style={s.pickerInput}
            >
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <div style={s.holdWrap}>
          <div style={{ ...s.holdRing, ...(confirmed ? s.holdRingDone : {}), ...ringStyle }} />
          <button
            type="button"
            style={{ ...s.primaryBtn, ...(confirmed ? s.primaryBtnDone : {}) }}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            disabled={!canConfirm}
          >
            {confirmed ? "Записано! ✅" : "Готово!"}
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
  mainCard: {
    borderRadius: 18,
    padding: "18px 18px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.75) 100%)",
    border: "1px solid rgba(255,255,255,0.55)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  },
  mainCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardIcon: {
    fontSize: 18,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(30,31,34,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  strategyFocus: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: -0.5,
    color: "#1e1f22",
    marginBottom: 6,
  },
  strategyTempoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  strategyIntensityLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(30,31,34,0.5)",
  },
  durationValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1e1f22",
  },
  strategyDesc: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(30,31,34,0.6)",
  },
  pickerStack: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  pickerRow: {
    position: "relative",
    borderRadius: 14,
    padding: "14px 14px",
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(15,23,42,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1e1f22",
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(30,31,34,0.6)",
  },
  pickerInput: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    width: "100%",
    height: "100%",
    cursor: "pointer",
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
    width: "100%",
    height: 56,
    borderRadius: 999,
    padding: 3,
  },
  holdRingDone: {
    background: "conic-gradient(#10b981 360deg, #10b981 0deg)",
  },
  primaryBtn: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    height: 56,
    borderRadius: 999,
    border: "none",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryBtnDone: {
    background: "#10b981",
  },
  backBtn: {
    width: "100%",
    height: 52,
    borderRadius: 999,
    border: "1px solid rgba(30,31,34,0.15)",
    background: "#fff",
    color: "#1e1f22",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
