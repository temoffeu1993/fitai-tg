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
          --ring-size: 230px;
          --mascot-size: 148px;
          --text-size: 20px;
          opacity: 0;
        }
        .analysis-loader.onb-in {
          animation: screenIn 360ms ease-out forwards;
        }
        .analysis-loader.onb-out .loader-content {
          animation: screenOut 260ms ease-in forwards;
        }
        .ring {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 2px solid rgba(88, 255, 255, 0.65);
          background: conic-gradient(
            from 0deg,
            rgba(88, 255, 255, 0.95),
            rgba(136, 102, 255, 0.85),
            rgba(88, 255, 255, 0.95)
          );
          -webkit-mask: radial-gradient(closest-side, transparent calc(100% - 6px), #000 calc(100% - 5px));
          mask: radial-gradient(closest-side, transparent calc(100% - 6px), #000 calc(100% - 5px));
          box-shadow:
            0 0 18px rgba(88, 255, 255, 0.55),
            0 0 40px rgba(136, 102, 255, 0.4);
          animation: ringSpin 3.4s linear infinite, ringPulse 1.7s ease-in-out infinite;
        }
        .ring.ring--hide {
          animation: ringDisappear 420ms ease-out forwards;
        }
        .mascot {
          width: var(--mascot-size);
          height: auto;
          z-index: 2;
          filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55));
          transition: transform 220ms ease, opacity 220ms ease;
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
        @keyframes ringSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ringPulse {
          0% { opacity: 0.7; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1.02); }
          100% { opacity: 0.75; transform: scale(0.98); }
        }
        @keyframes ringDisappear {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.7); }
        }
        @keyframes mascotAscend {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-26px) scale(1.18); }
        }
        @keyframes textSwap {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes textDone {
          0% { opacity: 0; transform: scale(1.35); }
          25% { opacity: 1; transform: scale(1); }
          55% { opacity: 1; transform: scale(0.82); }
          80% { opacity: 1; transform: scale(1.18); }
          100% { opacity: 0; transform: scale(1.18); }
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
            --ring-size: 200px;
            --mascot-size: 132px;
            --text-size: 18px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .analysis-loader.onb-in,
          .analysis-loader.onb-out .loader-content,
          .ring,
          .status-text,
          .status-text.done,
          .mascot.mascot--ascend {
            animation: none !important;
          }
        }
      `}</style>

      <div style={s.content} className="loader-content">
        <div style={s.orbWrap}>
          <div className={`ring${isDone ? " ring--hide" : ""}`} />
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
