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
      {/* HERO в стиле эталона */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 5 из 6</span>
          <span style={st.credits}>Анкета</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Образ жизни</div>
        <div style={st.heroTitle}>Повседневные привычки 🌿</div>
        <div style={st.heroSubtitle}>Учитываю режим дня, сон и стресс для точного плана.</div>
      </section>

      {/* Работа/активность */}
      <section style={st.card}>
        <div style={st.blockTitle}>🏢 Что больше относится к твоему дню?</div>
        <div style={st.wrapGridEven}>
          <Chip label="Мало движения" active={workStyle === "sedentary"} onClick={() => setWorkStyle("sedentary")} />
          <Chip label="Баланс" active={workStyle === "mixed"} onClick={() => setWorkStyle("mixed")} />
          <Chip label="Много движения" active={workStyle === "active"} onClick={() => setWorkStyle("active")} />
        </div>
      </section>

      {/* Сон */}
      <section style={st.card}>
        <div style={st.blockTitle}>😴 Сколько обычно спишь в сутки?</div>
        <div style={st.row4Equal}>
          <Chip label="<6 ч" active={sleep === "<6"} onClick={() => setSleep("<6")} />
          <Chip label="6–7 ч" active={sleep === "6-7"} onClick={() => setSleep("6-7")} />
          <Chip label="7–8 ч" active={sleep === "7-8"} onClick={() => setSleep("7-8")} />
          <Chip label="8+ ч" active={sleep === "8+"} onClick={() => setSleep("8+")} />
        </div>
      </section>

      {/* Стресс */}
      <section style={st.card}>
        <div style={st.blockTitle}>⚡ Уровень стресса</div>
        <div style={st.wrapGridEven}>
          <ChipDesc
            label="Низкий 🧘‍♂️"
            desc="спокойно, редко стресс"
            active={stress === "low"}
            onClick={() => setStress("low")}
          />
          <ChipDesc
            label="Средний 🤸‍♂️"
            desc="иногда дедлайны, справляюсь"
            active={stress === "medium"}
            onClick={() => setStress("medium")}
          />
          <ChipDesc
            label="Высокий 😡"
            desc="часто нервничаю и спешу"
            active={stress === "high"}
            onClick={() => setStress("high")}
          />
        </div>
      </section>

      {/* CTA */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canNext || !!loading}
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

/* --- Styles (как эталоны) --- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
    background: "#fff",
  },

  heroCard: {
    position: "relative",
    padding: 16,
    borderRadius: 20,
    boxShadow: cardShadow,
    background:
      "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    marginBottom: 14,
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
  },
  credits: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  heroSubtitle: { opacity: 0.92, marginTop: 2 },

  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    boxShadow: cardShadow,
  },
  blockTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 8 },

  wrapGridEven: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 8,
    alignItems: "stretch",
    justifyItems: "stretch",
    marginTop: 8,
  },
  row4Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gap: 8,
    alignItems: "stretch",
    marginTop: 8,
  },

  chip: {
    padding: "10px 12px",
    background: "#f6f7fb",
    borderRadius: 12,
    border: "none",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
    cursor: "pointer",
    fontWeight: 700,
    width: "100%",
    textAlign: "center",
  },
  chipActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
  },
  chipText: { color: "#111827", fontWeight: 700 },
  chipTextActive: { color: "#fff", fontWeight: 800 },

  chipDesc: {
    display: "grid",
    gap: 2,
    justifyItems: "start",
    padding: "12px",
    background: "#f6f7fb",
    borderRadius: 12,
    border: "none",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  chipDescActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
  },
  chipDescLabel: { fontSize: 13, fontWeight: 800, color: "#111827" },
  chipDescLabelActive: { color: "#fff" },
  chipDescSub: { fontSize: 11, color: "#6B7280" },
  chipDescSubActive: { color: "#E5E7EB" },

  primaryBtn: {
    marginTop: 14,
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
    cursor: "pointer",
  },

  backTextBtn: {
    marginTop: 10,
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#111827",
    fontSize: 15,
    fontWeight: 500,
    padding: "12px 16px",
    cursor: "pointer",
    textAlign: "center" as const,
  },
};