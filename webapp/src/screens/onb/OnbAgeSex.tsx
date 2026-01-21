// webapp/src/screens/onb/OnbAgeSex.tsx
import { useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  const [sex, setSex] = useState<Sex | null>((initial?.ageSex?.sex as Sex) ?? null);

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

  const handleSelect = (value: Sex) => {
    if (loading) return;
    setSex(value);
    const patch: OnbAgeSexData = {
      profile: { name: initial?.profile?.name || "Спортсмен" },
      ageSex: {
        sex: value,
        ...(initial?.ageSex?.age != null ? { age: initial.ageSex.age } : {}),
      },
      ...(initial?.body ? { body: initial.body } : {}),
    };
    onSubmit(patch);
  };

  return (
    <div style={s.page}>
      <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .onb-fade {
          animation: onbFadeUp 520ms ease-out both;
        }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 240ms; }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade,
          .onb-fade-delay-1,
          .onb-fade-delay-2,
          .onb-fade-delay-3 { animation: none !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Укажите ваш пол</h1>
        <p style={s.subtitle}>Это поможет точнее подобрать рекомендации</p>
      </div>

      <div style={s.buttons} className="onb-fade onb-fade-delay-3">
        <button
          type="button"
          style={{ ...s.optionBtn, ...(sex === "male" ? s.optionBtnActive : {}) }}
          onClick={() => handleSelect("male")}
        >
          Мужской
        </button>
        <button
          type="button"
          style={{ ...s.optionBtn, ...(sex === "female" ? s.optionBtnActive : {}) }}
          onClick={() => handleSelect("female")}
        >
          Женский
        </button>
      </div>

      {onBack ? (
        <button
          style={s.backBtn}
          className="onb-fade onb-fade-delay-3"
          onClick={() => navigate("/")}
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
    width: "20%",
    background: "#1e1f22",
    borderRadius: 999,
  },
  header: {
    display: "grid",
    gap: 8,
    textAlign: "center",
    alignItems: "center",
    marginTop: 8,
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
    marginTop: 14,
  },
  optionBtn: {
    width: "100%",
    padding: "20px 18px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    background: "rgba(255,255,255,0.5)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
    color: "#1e1f22",
    fontSize: 18,
    fontWeight: 500,
    textAlign: "center",
    cursor: "pointer",
  },
  optionBtnActive: {
    background: "#1e1f22",
    border: "1px solid #1e1f22",
    color: "#fff",
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
