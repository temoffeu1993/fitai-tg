// webapp/src/screens/onb/OnbFirstWorkout.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSelectedScheme, type WorkoutScheme } from "@/api/schemes";
import smotrchasImg from "@/assets/smotrchas.webp";
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

function normalizeLabel(raw?: string): string {
  if (!raw) return "";
  return raw.toLowerCase();
}

function formatDateLabel(value: string): string {
  if (!value) return "Выбрать";
  const dt = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatTimeLabel(value: string): string {
  if (!value) return "Выбрать";
  return value;
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
  const nav = useNavigate();
  const [scheme, setScheme] = useState<WorkoutScheme | null>(null);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>("");
  const [reminder, setReminder] = useState(REMINDER_OPTIONS[3]);
  const [mascotReady, setMascotReady] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastHapticRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const selected = await getSelectedScheme();
        if (mounted) setScheme(selected);
      } catch {
        if (mounted) setScheme(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = smotrchasImg;
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

  const firstTitle = getFirstWorkoutTitle(scheme || undefined);

  const canConfirm = Boolean(date && time) && !confirmed;

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

      {/* Mascot + Bubble */}
      <div style={s.mascotRow} className="onb-fade onb-fade-delay-2">
        <img
          src={smotrchasImg}
          alt=""
          style={{ ...s.mascotImg, ...(mascotReady ? undefined : s.mascotHidden) }}
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>
            План идеален. Но он не сработает без твоего решения. Когда стартуем?
          </span>
        </div>
      </div>

      {/* Main Card */}
      <div style={s.mainCard} className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}>
        <div style={s.mainCardTop}>
          <div style={s.mainCardHeader}>
            <span style={s.cardIcon}>🚀</span>
            <span style={s.cardLabel}>Первая тренировка</span>
          </div>
          <div style={s.strategyFocus}>{firstTitle}</div>
          <p style={s.strategyDesc}>
            Выбери удобное время, чтобы я напомнил, когда пора собираться.
          </p>
        </div>

        {/* Date + Time Grid */}
        <div style={s.gridRow}>
          <div style={s.smallCard}>
            <div style={s.smallCardHeader}>
              <span style={s.smallCardIcon}>📅</span>
              <span style={s.smallCardLabel}>Дата</span>
            </div>
            <div style={s.valueChip}>{formatDateLabel(date)}</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={s.cardInput}
            />
          </div>
          <div style={s.smallCard}>
            <div style={s.smallCardHeader}>
              <span style={s.smallCardIcon}>⏰</span>
              <span style={s.smallCardLabel}>Время</span>
            </div>
            <div style={s.valueChip}>{formatTimeLabel(time)}</div>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={s.cardInput}
            />
          </div>
        </div>

        {/* Notifications */}
        <div style={s.smallCardWide}>
          <div style={s.inlineRow}>
            <div style={s.smallCardHeader}>
              <span style={s.smallCardIcon}>🔔</span>
              <span style={s.smallCardLabel}>Уведомления</span>
            </div>
            <div style={s.valueChip}>{reminder}</div>
          </div>
          <select
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            style={s.cardInput}
          >
            {REMINDER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
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
            {confirmed ? "Записано! ✅" : "Далее"}
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
  mascotHidden: {
    opacity: 0,
    transform: "translateY(6px) scale(0.98)",
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
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  mainCardTop: {
    display: "flex",
    flexDirection: "column",
  },
  mainCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.6)",
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
  strategyDesc: {
    margin: "10px 0 0",
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(15, 23, 42, 0.6)",
  },
  gridRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  smallCard: {
    position: "relative",
    borderRadius: 16,
    padding: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    overflow: "hidden",
  },
  smallCardWide: {
    position: "relative",
    borderRadius: 16,
    padding: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    overflow: "hidden",
  },
  smallCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  smallCardIcon: {
    fontSize: 16,
  },
  smallCardLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  valueChip: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    fontSize: 16,
    fontWeight: 600,
    color: "#0f172a",
  },
  inlineRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardInput: {
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
};
