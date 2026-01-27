// webapp/src/screens/onb/OnbWorkday.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type WorkdayStyle =
  | "sedentary"
  | "balanced"
  | "on_feet"
  | "heavy_work";

export type OnbWorkdayData = {
  lifestyle?: { workStyle: WorkdayStyle };
};

type Props = {
  initial?: Partial<OnbWorkdayData>;
  loading?: boolean;
  onSubmit: (patch: OnbWorkdayData) => void;
  onBack?: () => void;
};

const OPTIONS: Array<{ value: WorkdayStyle; label: string }> = [
  { value: "sedentary", label: "Сижу за столом. Работаю головой, а не телом" },
  { value: "balanced", label: "Ищу баланс. Работа сидячая, но я стараюсь двигаться" },
  { value: "on_feet", label: "Весь день на ногах. Почти не присаживаюсь" },
  { value: "heavy_work", label: "Тяжёлый труд. Моя работа это уже тренировка" },
];

export default function OnbWorkday({ initial, loading, onSubmit, onBack }: Props) {
  const [workStyle, setWorkStyle] = useState<WorkdayStyle | null>(
    initial?.lifestyle?.workStyle ?? null
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
    if (loading || isLeaving || !workStyle) return;
    const patch: OnbWorkdayData = { lifestyle: { workStyle } };
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
        .workday-card {
          appearance: none;
          outline: none;
          -webkit-tap-highlight-color: transparent;
          transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
          will-change: transform, background, border-color;
        }
        .workday-card:active:not(:disabled) {
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
          .workday-card { transition: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 6 из 12</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Как проходит ваш обычный день?</h1>
        <p style={s.subtitle}>
          Это поможет нам настроить программу так, чтобы вам хватало сил и на работу, и на спорт.
        </p>
      </div>

      <div style={s.tiles} className="onb-fade onb-fade-delay-3">
        {OPTIONS.map((item) => {
          const isActive = workStyle === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className="workday-card"
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
              onClick={() => setWorkStyle(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: workStyle == null || loading ? 0.5 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={workStyle == null || loading || isLeaving}
        >
          Далее
        </button>
        {onBack ? (
          <button
            style={s.backBtn}
            type="button"
            onClick={onBack}
            className="onb-fade onb-fade-delay-3"
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
    padding: "16px 16px 28px",
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
    width: "50%",
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
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 600,
    letterSpacing: -0.6,
  },
  subtitle: {
    margin: 0,
    fontSize: 15,
    color: "rgba(15, 23, 42, 0.7)",
    lineHeight: 1.5,
  },
  tiles: {
    display: "grid",
    gap: 12,
    marginTop: 6,
  },
  tile: {
    width: "100%",
    borderRadius: 20,
    padding: "16px 18px",
    fontSize: 16,
    fontWeight: 500,
    border: "1px solid rgba(255,255,255,0.4)",
    color: "#1e1f22",
    textAlign: "left",
    boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    backdropFilter: "blur(10px)",
  },
  tileActive: {
    boxShadow: "0 14px 28px rgba(15,23,42,0.16)",
  },
  actions: {
    display: "grid",
    gap: 10,
    marginTop: 12,
  },
  primaryBtn: {
    borderRadius: 999,
    border: "none",
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 600,
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.18)",
  },
  backBtn: {
    border: "none",
    background: "none",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 500,
  },
};
