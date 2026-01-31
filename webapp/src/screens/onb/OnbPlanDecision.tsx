// webapp/src/screens/onb/OnbPlanDecision.tsx
import { useEffect, useRef, useState } from "react";
import smotrchasImg from "@/assets/smotrchas.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onChoose: () => void;
  onSkip: () => void;
};

export default function OnbPlanDecision({ onChoose, onSkip }: Props) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const leaveTimerRef = useRef<number | null>(null);
  const bubbleTarget =
    "План идеален. Но он не сработает без твоего решения. Когда стартуем?";

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = smotrchasImg;
    const done = () => { if (!cancelled) setReady(true); };
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
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setBubbleText(bubbleTarget);
      return;
    }
    let index = 0;
    setBubbleText("");
    const id = window.setInterval(() => {
      index += 1;
      setBubbleText(bubbleTarget.slice(0, index));
      if (index >= bubbleTarget.length) {
        window.clearInterval(id);
      }
    }, 14);
    return () => window.clearInterval(id);
  }, [bubbleTarget]);

  const runLeave = (next: () => void) => {
    if (isLeaving) return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      next();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(next, 220);
  };

  return (
    <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
      <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes onbFadeDown {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(12px); }
        }
        .onb-fade { animation: onbFadeUp 520ms ease-out both; }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-leave { animation: onbFadeDown 220ms ease-in both; }
        .speech-bubble--top:after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -8px;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 8px solid rgba(255,255,255,0.9);
          filter: drop-shadow(0 1px 0 rgba(15, 23, 42, 0.12));
        }
        .intro-primary-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .intro-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #141619 !important;
          box-shadow: 0 6px 12px rgba(0,0,0,0.14) !important;
          filter: brightness(0.99) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade, .onb-leave { animation: none !important; }
        }
      `}</style>

      <div style={s.center} className="onb-fade onb-fade-delay-1">
        <div style={s.bubble} className="speech-bubble--top">
          <span style={s.bubbleText}>
            {bubbleText || "\u00A0"}
          </span>
        </div>
        <img
          src={smotrchasImg}
          alt=""
          style={{ ...s.mascotImg, ...(ready ? undefined : s.mascotHidden) }}
        />
      </div>

      <div style={s.actions} className="onb-fade onb-fade-delay-2">
        <button
          type="button"
          style={s.primaryBtn}
          className="intro-primary-btn"
          onClick={() => {
            fireHapticImpact("light");
            runLeave(onChoose);
          }}
        >
          Выбрать время
        </button>
        <button
          type="button"
          style={s.backBtn}
          onClick={() => {
            fireHapticImpact("light");
            runLeave(onSkip);
          }}
        >
          Пропустить
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
    color: "#1e1f22",
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  center: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    textAlign: "center",
  },
  bubble: {
    position: "relative",
    padding: "14px 18px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    maxWidth: 320,
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#1e1f22",
    whiteSpace: "pre-line",
  },
  mascotImg: {
    width: 168,
    height: "auto",
    objectFit: "contain",
  },
  mascotHidden: {
    opacity: 0,
    transform: "translateY(6px) scale(0.98)",
  },
  actions: {
    marginTop: "auto",
    width: "100%",
    display: "grid",
    gap: 10,
    paddingBottom: 12,
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
