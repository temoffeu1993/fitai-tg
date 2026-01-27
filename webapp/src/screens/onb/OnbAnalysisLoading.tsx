// webapp/src/screens/onb/OnbAnalysisLoading.tsx
import { useEffect, useLayoutEffect, useState } from "react";
import healthRobotImg from "@/assets/heals.webp";

type Props = {
  onDone: () => void;
};

const LINES = [
  "Считаем метаболизм",
  "Анализируем активность",
  "Подбираем макронутриенты",
  "Готово!",
];

export default function OnbAnalysisLoading({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevOverflow = root?.style.overflowY;
    const prevOverscroll = root?.style.overscrollBehaviorY;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    if (root) {
      root.style.overflowY = "hidden";
      root.style.overscrollBehaviorY = "none";
      root.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    document.body.style.backgroundColor = "#000";
    document.documentElement.style.backgroundColor = "#000";
    return () => {
      if (root) {
        root.style.overflowY = prevOverflow || "";
        root.style.overscrollBehaviorY = prevOverscroll || "";
      }
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setStep(LINES.length - 1);
      const t = window.setTimeout(() => onDone(), 250);
      return () => window.clearTimeout(t);
    }

    const stepDuration = 1200;
    const doneDuration = 1200;
    const exitDuration = 260;
    const timers: number[] = [];

    for (let i = 1; i < LINES.length; i += 1) {
      timers.push(window.setTimeout(() => setStep(i), stepDuration * i));
    }

    const doneAt = stepDuration * (LINES.length - 1) + doneDuration;
    timers.push(window.setTimeout(() => setIsLeaving(true), doneAt));
    timers.push(window.setTimeout(() => onDone(), doneAt + exitDuration));

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [onDone]);

  const text = LINES[Math.min(step, LINES.length - 1)];
  const isDone = step === LINES.length - 1;

  return (
    <div
      style={s.page}
      className={`analysis-loader${ready ? " onb-in" : ""}${isLeaving ? " onb-out" : ""}`}
    >
      <style>{`
        .analysis-loader {
          --ring-size: 270px;
          --mascot-size: 176px;
          --text-size: 20px;
          opacity: 0;
        }
        .analysis-loader.onb-in {
          animation: screenIn 360ms ease-out forwards;
        }
        .analysis-loader.onb-out .loader-content {
          animation: screenOut 260ms ease-in forwards;
        }
        .aura {
          position: absolute;
          width: var(--ring-size);
          height: var(--ring-size);
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(120, 255, 230, 0.4) 0%,
            rgba(120, 255, 230, 0.18) 45%,
            rgba(120, 255, 230, 0) 70%
          );
          filter: blur(18px);
          opacity: 0.75;
          animation: auraPulse 2.8s ease-in-out infinite;
        }
        .aura.aura--fade {
          animation: auraOut 700ms ease-out forwards;
        }
        .mascot {
          width: var(--mascot-size);
          height: auto;
          z-index: 2;
          filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55));
          transition: transform 220ms ease, opacity 220ms ease;
          animation: mascotFloat 3.6s ease-in-out infinite;
        }
        .mascot.mascot--ascend {
          animation: mascotAscend 920ms ease-in-out forwards;
        }
        .status-text {
          font-size: var(--text-size);
          font-weight: 600;
          letter-spacing: 0.2px;
          color: #f8fafc;
          text-shadow: 0 0 10px rgba(88, 255, 255, 0.18);
          animation: textSwap 360ms ease-out both;
        }
        .status-text.done {
          animation: textDone 1200ms ease-in-out both;
        }
        @keyframes mascotFloat {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.01); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes auraPulse {
          0% { opacity: 0.55; transform: scale(0.96); }
          50% { opacity: 0.85; transform: scale(1.02); }
          100% { opacity: 0.6; transform: scale(0.96); }
        }
        @keyframes auraOut {
          0% { opacity: 0.75; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        @keyframes mascotAscend {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-32px) scale(1.28); }
        }
        @keyframes textSwap {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes textDone {
          0% { opacity: 0; transform: scale(1.6); }
          25% { opacity: 1; transform: scale(1); }
          55% { opacity: 1; transform: scale(0.92); }
          80% { opacity: 1; transform: scale(1.9); }
          100% { opacity: 0; transform: scale(2.2); }
        }
        @keyframes screenIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes screenOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 380px) {
          .analysis-loader {
            --ring-size: 230px;
            --mascot-size: 156px;
            --text-size: 18px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .analysis-loader.onb-in,
          .analysis-loader.onb-out .loader-content,
          .aura,
          .status-text,
          .status-text.done,
          .mascot,
          .mascot.mascot--ascend {
            animation: none !important;
          }
        }
      `}</style>

      <div style={s.content} className="loader-content">
        <div style={s.orbWrap}>
          <div className={`aura${isDone ? " aura--fade" : ""}`} />
          <img
            src={healthRobotImg}
            alt="Moro"
            decoding="async"
            className={`mascot${isDone ? " mascot--ascend" : ""}`}
          />
        </div>

        <div style={s.textWrap}>
          {[text].map((value) => (
            <div key={value} className={`status-text${isDone ? " done" : ""}`}>
              {value}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    height: "var(--app-height, 100vh)",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
    background: "#000",
    color: "#fff",
    textAlign: "center",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  content: {
    display: "grid",
    gap: 22,
    placeItems: "center",
  },
  orbWrap: {
    position: "relative",
    width: "var(--ring-size)",
    height: "var(--ring-size)",
    display: "grid",
    placeItems: "center",
  },
  textWrap: {
    minHeight: 32,
    display: "grid",
    placeItems: "center",
    paddingBottom: 8,
  },
};
