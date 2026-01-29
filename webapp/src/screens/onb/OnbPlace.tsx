// webapp/src/screens/onb/OnbPlace.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fireHapticImpact } from "@/utils/haptics";

export type TrainingPlace = "gym" | "home_no_equipment" | "home_with_gear";

export type OnbPlaceData = {
  trainingPlace?: { place: TrainingPlace };
};

type Props = {
  initial?: Partial<OnbPlaceData>;
  loading?: boolean;
  onSubmit: (patch: OnbPlaceData) => void;
  onBack?: () => void;
};

const OPTIONS: Array<{ value: TrainingPlace; label: string }> = [
  { value: "gym", label: "🏋️‍♂️ В тренажерном зале" },
  { value: "home_no_equipment", label: "🏠 Дома, без инвентаря" },
  { value: "home_with_gear", label: "💪 Дома, с резинками и гантелями" },
];

export default function OnbPlace({ initial, loading, onSubmit, onBack }: Props) {
  const navigate = useNavigate();
  const [place, setPlace] = useState<TrainingPlace | null>(
    initial?.trainingPlace?.place ?? null
  );
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

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

  const handleNext = () => {
    if (loading || isLeaving || !place) return;
    fireHapticImpact("light");
    const patch: OnbPlaceData = { trainingPlace: { place } };
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onSubmit(patch);
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      onSubmit(patch);
    }, 220);
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
        .onb-fade {
          animation: onbFadeUp 520ms ease-out both;
        }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 240ms; }
        .onb-leave {
          animation: onbFadeDown 220ms ease-in both;
        }
        .place-card {
          appearance: none;
          outline: none;
          -webkit-tap-highlight-color: transparent;
          transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
          will-change: transform, background, border-color;
        }
        .place-card:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
          background: var(--tile-bg) !important;
          border-color: var(--tile-border) !important;
          color: var(--tile-color) !important;
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
        .intro-primary-btn:disabled {
          background-color: #1e1f22 !important;
          border-color: #1e1f22 !important;
          color: #fff !important;
          box-shadow: 0 6px 10px rgba(0,0,0,0.24) !important;
          filter: none !important;
        }
        @media (hover: hover) {
          .intro-primary-btn:hover:not(:disabled) {
            filter: brightness(1.03);
          }
        }
        .intro-primary-btn:focus-visible {
          outline: 3px solid rgba(15, 23, 42, 0.18);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade,
          .onb-fade-delay-1,
          .onb-fade-delay-2,
          .onb-fade-delay-3 { animation: none !important; }
          .onb-leave { animation: none !important; }
          .place-card { transition: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 7 из 12</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Где планируете тренироваться?</h1>
        <p style={s.subtitle}>Нужно, чтобы адаптировать программу под ваши условия</p>
      </div>

      <div style={s.tiles} className="onb-fade onb-fade-delay-3">
        {OPTIONS.map((item) => {
          const isActive = place === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className="place-card"
              style={{
                ...s.tile,
                ["--tile-bg" as never]:
                  isActive
                    ? "#1e1f22"
                    : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                ["--tile-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                ["--tile-color" as never]: isActive ? "#fff" : "#1e1f22",
                ...(isActive ? s.tileActive : {}),
              }}
              onClick={() => setPlace(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: place == null || loading ? 0.5 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={place == null || loading || isLeaving}
        >
          Далее
        </button>
        {onBack ? (
          <button
            style={s.backBtn}
            className="onb-fade onb-fade-delay-3"
            onClick={() => {
              if (isLeaving) return;
              const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
              if (prefersReduced) {
                onBack();
                return;
              }
              setIsLeaving(true);
              leaveTimerRef.current = window.setTimeout(() => {
                onBack();
              }, 220);
            }}
            type="button"
          >
            Назад
          </button>
        ) : null}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#0f172a",
    overflow: "hidden",
  },
  progressWrap: {
    display: "grid",
    gap: 8,
    marginTop: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "58.3%",
    background: "#1e1f22",
    borderRadius: 999,
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
  },
  header: {
    display: "grid",
    gap: 8,
    textAlign: "center",
    alignItems: "center",
    marginTop: 16,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.1,
    fontWeight: 700,
    letterSpacing: -0.8,
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.7)",
  },
  tiles: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    width: "100%",
  },
  tile: {
    borderRadius: 18,
    border: "1px solid var(--tile-border)",
    background: "var(--tile-bg)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "var(--tile-color)",
    fontSize: 18,
    fontWeight: 500,
    padding: "18px 16px",
    textAlign: "left",
    cursor: "pointer",
  },
  tileActive: {
    background: "#1e1f22",
    border: "1px solid #1e1f22",
    color: "#fff",
  },
  primaryBtn: {
    marginTop: 18,
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
  actions: {
    marginTop: "auto",
    paddingTop: 18,
    display: "grid",
    gap: 10,
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
