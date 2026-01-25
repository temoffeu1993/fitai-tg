// webapp/src/screens/onb/OnbMotivation.tsx
import { useState } from "react";

export type Goal =
  | "lose_weight"
  | "build_muscle"
  | "athletic_body"
  | "lower_body_focus"
  | "strength"
  | "health_wellness";
const MOTIVES = [
  { key: "health", label: "Здоровье" },
  { key: "energy", label: "Энергия" },
  { key: "confidence", label: "Уверенность" },
  { key: "sport", label: "Спорт-результаты" },
] as const;

export type OnbMotivationData = {
  motivation: {
    goal: Goal;
  };
  goals: {
    primary: Goal;
  };
};

type Props = {
  initial?: Partial<OnbMotivationData>;
  loading?: boolean;
  onSubmit: (patch: OnbMotivationData) => void;
  onBack?: () => void;
};

export default function OnbMotivation({ initial, loading, onSubmit, onBack }: Props) {
  // Цель
  const [goal, setGoal] = useState<Goal | null>(initial?.motivation?.goal ?? null);
  const canNext = Boolean(goal);
  
  const goalInfo: Record<Goal, string[]> = {
    lose_weight: ["похудеть и улучшить композицию тела", "сбросить лишний вес, подтянуть фигуру"],
    build_muscle: ["набрать мышечную массу всего тела", "увеличить объём мышц равномерно"],
    athletic_body: ["спортивное подтянутое тело", "улучшить рельеф и тонус мышц"],
    lower_body_focus: [
      "акцент на развитие ног и ягодиц",
      "сильная и красивая нижняя часть тела в составе сбалансированных тренировок",
    ],
    strength: ["стать сильнее и выносливее", "повысить силовые показатели и функциональность"],
    health_wellness: ["улучшить здоровье и самочувствие", "больше энергии, здоровые суставы и спина"],
  };

  function handleNext() {
    if (!canNext || loading || !goal) return;

    onSubmit({
      motivation: {
        goal,
      },
      goals: {
        primary: goal,
      },
    });
  }

  return (
    <div style={st.page}>
      <SoftGlowStyles />

      {/* HERO — чёрный, как на остальных онбординг-экранах */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 4 из 5</span>
        <span style={st.pill}>Анкета</span>
        </div>

        <div style={st.heroKicker}>Мотивация</div>
        <div style={st.heroTitle}>Мотивация и цель 🎯</div>
        <div style={st.heroSubtitle}>Понимание целей поможет точнее настроить план.</div>
      </section>

      {/* Цель — стеклянная карточка */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>Какая у тебя цель?</div>
        <div style={st.wrapGridEven}>
          <Chip label="🏃 Похудеть" active={goal === "lose_weight"} onClick={() => setGoal("lose_weight")} />
          <Chip label="💪 Набрать массу" active={goal === "build_muscle"} onClick={() => setGoal("build_muscle")} />
          <Chip label="⚡️ Спортивное тело (рельеф)" active={goal === "athletic_body"} onClick={() => setGoal("athletic_body")} />
          <Chip label="🍑 Ноги и ягодицы" active={goal === "lower_body_focus"} onClick={() => setGoal("lower_body_focus")} />
          <Chip label="🏋️‍♂️ Стать сильнее" active={goal === "strength"} onClick={() => setGoal("strength")} />
          <Chip label="🩺 Здоровье и самочувствие" active={goal === "health_wellness"} onClick={() => setGoal("health_wellness")} />
        </div>

        {goal ? (
          <div style={st.goalInfo}>
            <div style={st.goalInfoTitle}>Что это значит</div>
            <div style={st.goalInfoList}>
              {goalInfo[goal].map((t) => (
                <div key={t} style={st.goalInfoItem}>
                  {t}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* CTA — увеличенный размер как просили */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!!loading || !canNext}
        className="soft-glow tap-primary"
        style={{
          ...st.primaryBtn,
          opacity: loading || !canNext ? 0.6 : 1,
          cursor: loading || !canNext ? "default" : "pointer",
        }}
      >
        {loading ? "Сохранение…" : "Далее →"}
      </button>

      {onBack && (
        <button type="button" onClick={onBack} style={st.backTextBtn}>
          Назад
        </button>
      )}

      <div style={{ height: 76 }} />
    </div>
  );
}

/* --- UI primitives --- */
function Chip({
  label,
  active,
  onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...st.chip, ...(active ? st.chipActive : {}) }}>
      <span style={{ ...st.chipText, ...(active ? st.chipTextActive : {}) }}>{label}</span>
    </button>
  );
}

/* --- Shared soft glow for CTA --- */
function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow{background:linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);background-size:300% 300%;
      animation:glowShift 6s ease-in-out infinite,pulseSoft 3s ease-in-out infinite;transition:background .3s}
      @keyframes glowShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @keyframes pulseSoft{0%,100%{filter:brightness(1) saturate(1);transform:scale(1)}50%{filter:brightness(1.08) saturate(1.05);transform:scale(1.005)}}
    `}</style>
  );
}

/* --- Styles (единый фирменный стиль + увеличенные кнопки) --- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const GRAD = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },

  /* HERO чёрный */
  heroCard: {
    position: "relative",
    padding: 22,
    borderRadius: 28,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
    marginBottom: 14,
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
  },
  heroKicker: { marginTop: 8, opacity: 0.9, fontSize: 13, color: "rgba(255,255,255,.9)" },
  heroTitle: { fontSize: 26, fontWeight: 850, marginTop: 6, color: "#fff" },
  heroSubtitle: { opacity: 0.92, marginTop: 4, color: "rgba(255,255,255,.85)" },

  /* Стеклянные карточки */
  cardGlass: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
    backdropFilter: "blur(10px)",
  },

  blockTitle: { fontSize: 15, fontWeight: 800, color: "#0B1220", marginBottom: 10 },

  wrapGridEven: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 8,
    alignItems: "stretch",
    justifyItems: "stretch",
    marginTop: 8,
  },

  /* Чипы: увеличенные как просили */
  chip: {
    padding: "14px 14px",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    fontWeight: 800,
    textAlign: "center" as const,
    transition: "transform .06s ease",
  },
  chipActive: {
    background: "#0f172a",
    color: "#fff",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.3, fontSize: 13 },
  chipTextActive: { color: "#fff", fontSize: 13, fontWeight: 900 },

  /* Поля ввода — стекло */
  inputGlass: {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "12px",
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    fontSize: 16,
    color: "#111",
    display: "block",
  },

  /* CTA — больше высота и шрифт */
  primaryBtn: {
    marginTop: 16,
    width: "100%",
    border: "none",
    borderRadius: 18,
    padding: "16px 20px",
    fontSize: 17,
    fontWeight: 850,
    color: "#fff",
    background: "#0f172a",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    cursor: "pointer",
  },

  backTextBtn: {
    marginTop: 10,
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#111827",
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 16px",
    cursor: "pointer",
    textAlign: "center" as const,
  },
  goalInfo: {
    marginTop: 12,
    padding: "12px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.8)",
    border: "1px solid rgba(0,0,0,0.05)",
    color: "#0B1220",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
  },
  goalInfoTitle: { fontSize: 13, fontWeight: 800, marginBottom: 6, opacity: 0.8 },
  goalInfoList: { margin: 0, padding: 0, lineHeight: 1.4, fontSize: 13 },
  goalInfoItem: { marginBottom: 4 },

  termsRow: {
    marginTop: 32,
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  termsText: {
    fontSize: 12.5,
    color: "#0B1220",
    lineHeight: 1.35,
    display: "block",
    width: "100%",
  },
  inlineLink: {
    border: "none",
    background: "transparent",
    color: "#0B1220",
    textDecoration: "underline",
    fontSize: 12.5,
    padding: 0,
    margin: 0,
    cursor: "pointer",
  },

  circleCheck: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "2px solid rgba(148,163,184,.5)",
    background: "rgba(255,255,255,.85)",
    color: "#6b7280",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
    transition: "all .15s ease",
  },
  circleCheckOn: {
    borderColor: "transparent",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#1b1b1b",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px 16px 56px",
    zIndex: 9999,
    overscrollBehavior: "contain" as const,
  },
  modalCard: {
    width: "100%",
    maxWidth: 780,
    maxHeight: "calc(100vh - 80px)",
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 12px 40px rgba(0,0,0,.2)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  modalHeader: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(0,0,0,.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220" },
  modalClose: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    color: "#111",
  },
  modalBody: {
    padding: "12px 16px 24px",
    overflowY: "auto" as const,
    lineHeight: 1.5,
    color: "#111",
    fontSize: 14,
    overscrollBehavior: "contain" as const,
  },
  termsSection: { marginBottom: 12 },
  termsSectionTitle: { fontWeight: 800, marginBottom: 6, fontSize: 14.5 },
  termsSectionList: { margin: 0, paddingLeft: 16 },
  termsSectionItem: { marginBottom: 4 },
};
