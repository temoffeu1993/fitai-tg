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

export default function OnbAge({ initial, loading, onSubmit, onBack }: Props) {
  const navigate = useNavigate();
  const [age, setAge] = useState<number>(
    typeof initial?.ageSex?.age === "number" ? initial.ageSex.age : 18
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

  const handleSelect = (value: number) => {
    if (loading || isLeaving) return;
    setAge(value);
    const patch: OnbAgeData = {
      profile: initial?.profile,
      ageSex: {
        sex: (initial?.ageSex?.sex as Sex) || "male",
        age: value,
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
        @media (prefers-reduced-motion: reduce) {
          .onb-fade,
          .onb-fade-delay-1,
          .onb-fade-delay-2,
          .onb-fade-delay-3 { animation: none !important; }
          .onb-leave { animation: none !important; }
          .age-card { transition: none !important; }
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

      <div style={s.ageList} className="onb-fade onb-fade-delay-3">
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
      </div>

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
  ageList: {
    marginTop: 18,
    padding: "10px 0",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.45)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.35) 100%)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
    display: "grid",
    gap: 6,
    maxHeight: 260,
    overflowY: "auto",
  },
  ageItem: {
    border: "none",
    background: "transparent",
    color: "rgba(15, 23, 42, 0.8)",
    fontSize: 18,
    fontWeight: 500,
    padding: "8px 0",
    cursor: "pointer",
  },
  ageItemActive: {
    color: "#1e1f22",
    fontWeight: 700,
  },
  backBtn: {
    marginTop: "auto",
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
