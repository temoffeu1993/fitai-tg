import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";
import { formatClock } from "./utils";
import healthRobotImg from "@/assets/heals.webp";

type Props = {
  secondsLeft: number | null;
  onSkip: () => void;
  onAdd15: () => void;
};

export default function RestOverlay(props: Props) {
  const { secondsLeft, onSkip, onAdd15 } = props;
  if (secondsLeft == null) return null;

  return (
    <div style={s.overlay}>
      <style>{`
        .ws-rest-in {
          animation: wsRestFadeIn 300ms ease-out both;
        }
        .ws-rest-aura {
          animation: wsRestAuraPulse 2800ms ease-in-out infinite;
        }
        .ws-rest-mascot {
          animation: wsRestFloat 3600ms ease-in-out infinite;
        }
        @keyframes wsRestFadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes wsRestAuraPulse {
          0% { opacity: 0.56; transform: scale(0.95); }
          50% { opacity: 0.86; transform: scale(1.02); }
          100% { opacity: 0.62; transform: scale(0.95); }
        }
        @keyframes wsRestFloat {
          0% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
          100% { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ws-rest-in,
          .ws-rest-aura,
          .ws-rest-mascot {
            animation: none !important;
          }
        }
      `}</style>
      <div style={s.inner} className="ws-rest-in">
        <div style={s.kicker}>Отдыхаем</div>
        <div style={s.orbWrap} aria-hidden>
          <span style={s.aura} className="ws-rest-aura" />
          <img src={healthRobotImg} alt="" style={s.mascot} className="ws-rest-mascot" />
        </div>
        <div style={s.clock}>{formatClock(secondsLeft)}</div>
        <div style={s.actions}>
          <button type="button" style={s.actionSoft} onClick={onAdd15}>
            +15 сек
          </button>
          <button type="button" style={s.actionSoft} onClick={onSkip}>
            Пропустить
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "grid",
    placeItems: "center",
    padding: "calc(env(safe-area-inset-top, 0px) + 18px) 18px calc(env(safe-area-inset-bottom, 0px) + 20px)",
    background:
      "radial-gradient(120% 70% at 50% 14%, rgba(118,235,215,0.1) 0%, rgba(0,0,0,0) 56%), #000",
  },
  inner: {
    width: "min(100%, 520px)",
    margin: "0 auto",
    display: "grid",
    gap: 14,
    textAlign: "center",
    placeItems: "center",
  },
  kicker: {
    fontSize: 14,
    lineHeight: 1.45,
    color: "rgba(248,250,252,0.62)",
    fontWeight: 400,
  },
  orbWrap: {
    position: "relative",
    width: 244,
    height: 214,
    display: "grid",
    placeItems: "center",
    marginTop: -4,
  },
  aura: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(120,255,230,0.3) 0%, rgba(120,255,230,0.14) 44%, rgba(120,255,230,0) 74%)",
    filter: "blur(22px)",
    transform: "translateY(12px)",
  },
  mascot: {
    width: 182,
    height: "auto",
    filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.58))",
    zIndex: 2,
  },
  clock: {
    marginTop: -12,
    fontSize: 88,
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: -1.8,
    fontVariantNumeric: "tabular-nums",
    color: "rgba(248,250,252,0.96)",
    textShadow: "0 12px 24px rgba(0,0,0,0.42)",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    width: "min(100%, 520px)",
    marginTop: 6,
  },
  actionSoft: {
    minHeight: 56,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow:
      workoutTheme.pillShadow,
    color: "rgba(15,23,42,0.62)",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
  },
};
