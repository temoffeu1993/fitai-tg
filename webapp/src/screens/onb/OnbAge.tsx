// webapp/src/screens/onb/OnbAge.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Sex } from "./OnbAgeSex";

export type OnbAgeData = {
  profile?: { name: string };
  ageSex: { sex: Sex; age: number };
  body?: { height?: number; weight?: number };
};

type Props = {
  initial?: Partial<OnbAgeData>;
  loading?: boolean;
  onSubmit: (patch: OnbAgeData) => void;
  onBack?: () => void;
};

const AGE_MIN = 10;
const AGE_MAX = 80;
const ITEM_HEIGHT = 56;

export default function OnbAge({ initial, loading, onSubmit, onBack }: Props) {
  const navigate = useNavigate();
  const [age, setAge] = useState<number | null>(
    typeof initial?.ageSex?.age === "number" ? initial.ageSex.age : 30
  );
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollStopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      if (scrollStopTimerRef.current) {
        window.clearTimeout(scrollStopTimerRef.current);
        scrollStopTimerRef.current = null;
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

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (age == null) {
      list.scrollTop = 0;
      return;
    }
    const index = age - AGE_MIN;
    list.scrollTop = index * ITEM_HEIGHT;
  }, [age]);

  const handleListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    if (scrollStopTimerRef.current) {
      window.clearTimeout(scrollStopTimerRef.current);
    }
    scrollStopTimerRef.current = window.setTimeout(() => {
      const index = Math.round(list.scrollTop / ITEM_HEIGHT);
      const nextAge = AGE_MIN + index;
      if (nextAge >= AGE_MIN && nextAge <= AGE_MAX) {
        setAge(nextAge);
      }
    }, 60);
  };

  const handleSelect = (value: number) => {
    if (loading || isLeaving) return;
    setAge(value);
  };

  const handleNext = () => {
    if (loading || isLeaving || age == null) return;
    const patch: OnbAgeData = {
      profile: initial?.profile,
      ageSex: {
        sex: (initial?.ageSex?.sex as Sex) || "male",
        age,
      },
      ...(initial?.body ? { body: initial.body } : {}),
    };
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

  const ages = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => AGE_MIN + i);

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
        .age-card {
          transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
        }
        .age-card:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
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
          .age-card { transition: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 2 из 5</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Сколько вам лет?</h1>
        <p style={s.subtitle}>Возраст нужен, чтобы точнее подобрать рекомендации</p>
      </div>

      <div style={s.ageWrap} className="onb-fade onb-fade-delay-3">
        <div style={s.ageLineTop} />
        <div style={s.ageLineBottom} />
        <div style={s.ageFadeTop} />
        <div style={s.ageFadeBottom} />
        <div
          ref={listRef}
          style={s.ageList}
          onScroll={handleListScroll}
        >
          <div style={{ height: ITEM_HEIGHT * 2 }} />
          {ages.map((value) => (
            <button
              key={value}
              type="button"
              className="age-card"
              style={{ ...s.ageItem, ...(age === value ? s.ageItemActive : {}) }}
              onClick={() => handleSelect(value)}
            >
              {value}
            </button>
          ))}
          <div style={{ height: ITEM_HEIGHT * 2 }} />
        </div>
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: age == null || loading ? 0.5 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={age == null || loading || isLeaving}
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
                navigate("/onb/age-sex");
                return;
              }
              setIsLeaving(true);
              leaveTimerRef.current = window.setTimeout(() => {
                navigate("/onb/age-sex");
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
    width: "40%",
    background: "#1e1f22",
    borderRadius: 999,
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
  ageWrap: {
    marginTop: 18,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "hidden",
    width: "min(100px, 30vw)",
    height: ITEM_HEIGHT * 5,
    alignSelf: "center",
  },
  ageList: {
    maxHeight: "100%",
    overflowY: "auto",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
  },
  ageLineTop: {
    position: "absolute",
    left: 12,
    right: 12,
    top: "50%",
    height: 1,
    transform: `translateY(-${ITEM_HEIGHT / 2}px)`,
    background: "rgba(15, 23, 42, 0.18)",
    pointerEvents: "none",
  },
  ageLineBottom: {
    position: "absolute",
    left: 12,
    right: 12,
    top: "50%",
    height: 1,
    transform: `translateY(${ITEM_HEIGHT / 2}px)`,
    background: "rgba(15, 23, 42, 0.18)",
    pointerEvents: "none",
  },
  ageFadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_HEIGHT * 2,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 1,
  },
  ageFadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_HEIGHT * 2,
    background: "linear-gradient(0deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 1,
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
    marginTop: 18,
    display: "grid",
    gap: 10,
  },
  ageItem: {
    border: "none",
    background: "transparent",
    color: "rgba(15, 23, 42, 0.5)",
    fontSize: 24,
    fontWeight: 500,
    height: ITEM_HEIGHT,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    scrollSnapAlign: "center",
    cursor: "pointer",
  },
  ageItemActive: {
    color: "#111",
    fontWeight: 700,
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
