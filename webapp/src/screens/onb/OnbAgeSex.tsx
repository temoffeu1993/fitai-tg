// webapp/src/screens/onb/OnbAgeSex.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maleRobotImg from "@/assets/robonew.png";
import femaleRobotImg from "@/assets/zhennew.png";

export type Sex = "male" | "female";
export type OnbAgeSexData = {
  profile: { name: string };
  ageSex: { sex: Sex; age?: number };
  body?: { height?: number; weight?: number };
};

type Props = {
  initial?: Partial<OnbAgeSexData>;
  loading?: boolean;
  onSubmit: (patch: OnbAgeSexData) => void;
  onBack?: () => void;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

export default function OnbAgeSex({ initial, loading, onSubmit, onBack }: Props) {
  const navigate = useNavigate();
  const [sex, setSex] = useState<Sex | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const preload = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        const done = () => resolve();
        const anyImg = img as any;
        if (typeof anyImg.decode === "function") {
          anyImg.decode().then(done).catch(() => {
            img.onload = done;
            img.onerror = done;
          });
        } else {
          img.onload = done;
          img.onerror = done;
        }
      });

    Promise.all([preload(maleRobotImg), preload(femaleRobotImg)]).then(() => {
      if (!cancelled) setImagesReady(true);
    });
    return () => {
      cancelled = true;
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

  const buildPatch = (value: Sex): OnbAgeSexData => ({
    profile: { name: initial?.profile?.name || "Спортсмен" },
    ageSex: {
      sex: value,
      ...(initial?.ageSex?.age != null ? { age: initial.ageSex.age } : {}),
    },
    ...(initial?.body ? { body: initial.body } : {}),
  });

  const handleSelect = (value: Sex) => {
    if (loading || isLeaving) return;
    setSex(value);
  };

  const handleNext = () => {
    if (loading || isLeaving || !sex) return;
    const patch = buildPatch(sex);
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
        .onb-leave {
          animation: onbFadeDown 220ms ease-in both;
        }
          .onb-fade {
            animation: onbFadeUp 520ms ease-out both;
          }
          .onb-fade-delay-1 { animation-delay: 80ms; }
          .onb-fade-delay-2 { animation-delay: 160ms; }
          .onb-fade-delay-3 { animation-delay: 240ms; }
          .gender-card {
            appearance: none;
            outline: none;
            transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
            will-change: transform, background, border-color;
            -webkit-tap-highlight-color: transparent;
          }
          .gender-card:active:not(:disabled) {
            transform: translateY(1px) scale(0.99);
            background: var(--gender-bg) !important;
            border-color: var(--gender-border) !important;
            color: var(--gender-color) !important;
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
          filter: none !important;
        }
        .intro-primary-btn:disabled:active {
          transform: none !important;
          box-shadow: 0 6px 10px rgba(0,0,0,0.24) !important;
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
          .gender-card { transition: none !important; }
          .onb-leave { animation: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 1 из 10</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Укажите ваш пол</h1>
        <p style={s.subtitle}>Это поможет точнее подобрать тренировки</p>
      </div>

      <div
        style={{ ...s.buttons, ...(imagesReady ? undefined : s.buttonsHidden) }}
        className="onb-fade onb-fade-delay-3"
      >
        <button
          type="button"
          style={{
            ...s.optionCard,
            ["--gender-bg" as never]:
              sex === "male"
                ? "#1e1f22"
                : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            ["--gender-border" as never]: sex === "male" ? "#1e1f22" : "rgba(255,255,255,0.4)",
            ["--gender-color" as never]: sex === "male" ? "#fff" : "#1e1f22",
          }}
          className="gender-card"
          onClick={() => handleSelect("male")}
        >
          <img
            src={maleRobotImg}
            alt="Мужской"
            style={s.optionImage}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div style={s.optionLabel}>Мужской</div>
        </button>
        <button
          type="button"
          style={{
            ...s.optionCard,
            ["--gender-bg" as never]:
              sex === "female"
                ? "#1e1f22"
                : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            ["--gender-border" as never]: sex === "female" ? "#1e1f22" : "rgba(255,255,255,0.4)",
            ["--gender-color" as never]: sex === "female" ? "#fff" : "#1e1f22",
          }}
          className="gender-card"
          onClick={() => handleSelect("female")}
        >
          <img
            src={femaleRobotImg}
            alt="Женский"
            style={s.optionImage}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div style={s.optionLabel}>Женский</div>
        </button>
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: sex == null || loading ? 0.5 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={sex == null || loading}
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
                navigate("/");
                return;
              }
              setIsLeaving(true);
              leaveTimerRef.current = window.setTimeout(() => {
                navigate("/");
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
    width: "10%",
    background: "#1e1f22",
    borderRadius: 999,
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
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
  buttons: {
    display: "grid",
    gap: 12,
    marginTop: 22,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  buttonsHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  actions: {
    marginTop: "auto",
    paddingTop: 18,
    display: "grid",
    gap: 10,
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
    appearance: "none",
    WebkitAppearance: "none",
    outline: "none",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  optionCard: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 18,
    border: "1px solid var(--gender-border)",
    background: "var(--gender-bg)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "var(--gender-color)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    gap: 10,
  },
  optionImage: {
    width: "100%",
    maxWidth: 120,
    height: "auto",
    objectFit: "contain",
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.2,
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
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
