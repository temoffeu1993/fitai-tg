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
const DATE_COUNT = 30;
const DATE_VISIBLE = 5;

type DateItem = { date: Date; dow: string; day: number; idx: number };

function buildDates(count: number): DateItem[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
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
  const [mascotReady, setMascotReady] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastHapticRef = useRef<number>(0);

  // Date picker state (scroll-snap centered, like OnbWeight)
  const dates = useMemo(() => buildDates(DATE_COUNT), []);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollStopTimer = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
      if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current);
    };
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
        .date-track::-webkit-scrollbar { display: none; }
        .date-item {
          appearance: none; outline: none; border: none; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
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
            выбери дату и время первой тренировки
          </span>
        </div>
      </div>

      {/* Date picker — scroll-snap scroller like OnbWeight */}
      <div
        style={s.dateWrap}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}
      >
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
                <span style={{
                  ...s.dateDow,
                  ...(active ? s.dateDowActive : undefined),
                }}>{d.dow}</span>
            <span style={{
              ...s.dateNum,
              ...(active ? s.dateNumActive : undefined),
            }}>{d.day}</span>
              </button>
            );
          })}
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

  // ── Date picker (scroll-snap centered) ───────────────────
  dateWrap: {
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
  },
  dateIndicator: {
    position: "absolute",
    left: "50%",
    top: 10,
    width: 60,
    height: 60,
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
};
