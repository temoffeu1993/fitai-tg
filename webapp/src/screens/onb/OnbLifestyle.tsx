// webapp/src/screens/onb/OnbLifestyle.tsx
import { useMemo, useState } from "react";

export type WorkStyle = "sedentary" | "mixed" | "active" | "physical" | "shift";
export type Sleep = "<6" | "6-7" | "7-8" | "8+";
export type Stress = "low" | "medium" | "high" | "very_high";

export type OnbLifestyleData = {
  lifestyle: {
    workStyle: WorkStyle;
    sleep: Sleep;
    stress: Stress;
  };
};

type Props = {
  initial?: Partial<OnbLifestyleData>;
  loading?: boolean;
  onSubmit: (patch: OnbLifestyleData) => void;
  onBack?: () => void;
};

export default function OnbLifestyle({ initial, loading, onSubmit, onBack }: Props) {
  const [workStyle, setWorkStyle] = useState<WorkStyle>(initial?.lifestyle?.workStyle ?? "sedentary");
  const [sleep, setSleep] = useState<Sleep>(initial?.lifestyle?.sleep ?? "7-8");
  const [stress, setStress] = useState<Stress>(initial?.lifestyle?.stress ?? "medium");

  const canNext = useMemo(() => Boolean(workStyle && sleep && stress), [workStyle, sleep, stress]);

  function handleNext() {
    if (!canNext || loading) return;
    onSubmit({ lifestyle: { workStyle, sleep, stress } });
  }

  return (
    <div style={st.page}>
      <SoftGlowStyles />

      {/* HERO — чёрный, как в других шагах */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 5 из 6</span>
          <span style={st.pill}>Анкета</span>
        </div>

        <div style={st.heroKicker}>Образ жизни</div>
        <div style={st.heroTitle}>Повседневные привычки 🌿</div>
        <div style={st.heroSubtitle}>Учту работу, сон и стресс для точного плана.</div>
      </section>

      {/* Работа/активность — оставить только 3 варианта, по одному в строке, на всю ширину */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>🏢 Что больше относится к твоему дню?</div>
        <div style={st.columnList}>
          <Chip label="Мало движения"  active={workStyle === "sedentary"} onClick={() => setWorkStyle("sedentary")} />
          <Chip label="Баланс"         active={workStyle === "mixed"}     onClick={() => setWorkStyle("mixed")} />
          <Chip label="Много движения" active={workStyle === "active"}    onClick={() => setWorkStyle("active")} />
        </div>
      </section>

      {/* Сон — стеклянная карточка */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>😴 Сколько обычно спишь?</div>
        <div style={st.row4Equal}>
          <Chip label="<6 ч"  active={sleep === "<6"}  onClick={() => setSleep("<6")} />
          <Chip label="6–7 ч" active={sleep === "6-7"} onClick={() => setSleep("6-7")} />
          <Chip label="7–8 ч" active={sleep === "7-8"} onClick={() => setSleep("7-8")} />
          <Chip label="8+ ч"  active={sleep === "8+"}  onClick={() => setSleep("8+")} />
        </div>
      </section>

      {/* Стресс — стеклянная карточка */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>⚡ Уровень стресса</div>
        <div style={st.wrapGridEven}>
          <ChipDesc
            label="Низкий 🧘‍♂️"
            desc="редко стресс"
            active={stress === "low"}
            onClick={() => setStress("low")}
          />
          <ChipDesc
            label="Средний 🤸‍♂️"
            desc="иногда дедлайны"
            active={stress === "medium"}
            onClick={() => setStress("medium")}
          />
          <ChipDesc
            label="Высокий 😡"
            desc="часто нервничаю"
            active={stress === "high"}
            onClick={() => setStress("high")}
          />
          <ChipDesc
            label="Очень высокий 🚨"
            desc="хронический стресс"
            active={stress === "very_high"}
            onClick={() => setStress("very_high")}
          />
        </div>
      </section>

      {/* CTA — как на других шагах */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canNext || !!loading}
        className="soft-glow"
        style={{
          ...st.primaryBtn,
          opacity: !canNext || loading ? 0.6 : 1,
          cursor: !canNext || loading ? "default" : "pointer",
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

/* ---- UI primitives ---- */
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

function ChipDesc({
  label,
  desc,
  active,
  onClick,
}: { label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...st.chipDesc, ...(active ? st.chipDescActive : {}) }}>
      <div style={{ ...st.chipDescLabel, ...(active ? st.chipDescLabelActive : {}) }}>{label}</div>
      <div style={{ ...st.chipDescSub, ...(active ? st.chipDescSubActive : {}) }}>{desc}</div>
    </button>
  );
}

/* ---- Shared soft glow for CTA ---- */
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

/* ---- Styles ---- */
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
    background: "#050505",
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
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 8,
    alignItems: "stretch",
    marginTop: 8,
  },
  row4Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gap: 8,
    alignItems: "stretch",
    marginTop: 8,
  },

  /* Столбец для полноширинных чипов */
  columnList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    width: "100%",
  },

  /* Чипы */
  chip: {
    padding: "14px 14px",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    fontWeight: 800,
    width: "100%",
    textAlign: "center" as const,
    transition: "transform .06s ease",
  },
  chipActive: {
    background: GRAD,
    color: "#000",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.3, fontSize: 13},
  chipTextActive: { color: "#000" },

  chipDesc: {
    display: "grid",
    gap: 2,
    justifyItems: "start",
    padding: "12px",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    textAlign: "left" as const,
    width: "100%",
  },
  chipDescActive: {
    background: GRAD,
    color: "#000",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  chipDescLabel: { fontSize: 13, fontWeight: 850, color: "#111827" },
  chipDescLabelActive: { color: "#000" },
  chipDescSub: { fontSize: 11, color: "#6B7280" },
  chipDescSubActive: { color: "#374151" },

  /* CTA */
  primaryBtn: {
    marginTop: 16,
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 850,
    color: "#000",
    background: GRAD,
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
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
};
