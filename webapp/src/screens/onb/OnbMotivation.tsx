// webapp/src/screens/onb/OnbMotivation.tsx
import { useMemo, useState } from "react";

export type Goal = "fat_loss" | "muscle_gain" | "maintenance" | "event_prep" | "custom";
const MOTIVES = [
  { key: "health", label: "Здоровье" },
  { key: "energy", label: "Энергия" },
  { key: "confidence", label: "Уверенность" },
  { key: "sport", label: "Спорт-результаты" },
] as const;

export type OnbMotivationData = {
  motivation: {
    motives: string[];
    motiveOther?: string;
    goal: Goal;
    goalCustom?: string;
  };
  goals: Array<Goal | string>;
};

type Props = {
  initial?: Partial<OnbMotivationData>;
  loading?: boolean;
  onSubmit: (patch: OnbMotivationData) => void;
  onBack?: () => void;
};

export default function OnbMotivation({ initial, loading, onSubmit, onBack }: Props) {
  // 1) Зачем
  const [motives, setMotives] = useState<string[]>(
    (initial?.motivation?.motives as string[]) ?? []
  );
  const [motiveOtherEnabled, setMotiveOtherEnabled] = useState<boolean>(
    Boolean(initial?.motivation?.motiveOther && initial?.motivation?.motiveOther.trim())
  );
  const [motiveOther, setMotiveOther] = useState<string>(initial?.motivation?.motiveOther ?? "");

  // 2) Цель
  const [goal, setGoal] = useState<Goal>(initial?.motivation?.goal ?? "fat_loss");
  const [goalCustom, setGoalCustom] = useState<string>(initial?.motivation?.goalCustom ?? "");

  const canNext = useMemo(() => {
    if (motiveOtherEnabled && !motiveOther.trim()) return false;
    if (goal === "custom" && !goalCustom.trim()) return false;
    return true;
  }, [motiveOtherEnabled, motiveOther, goal, goalCustom]);

  function toggle(arr: string[], v: string, set: (x: string[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function handleNext() {
    if (!canNext || loading) return;

    const motivesOut = (() => {
      const base = [...motives];
      if (motiveOtherEnabled && motiveOther.trim()) base.push(motiveOther.trim());
      return Array.from(new Set(base));
    })();

    const goalOut = goal === "custom" ? goalCustom.trim() : goal;

    onSubmit({
      motivation: {
        motives: motivesOut,
        motiveOther: motiveOtherEnabled ? motiveOther.trim() : "",
        goal,
        goalCustom: goal === "custom" ? goalCustom.trim() : "",
      },
      goals: [goalOut],
    });
  }

  return (
    <div style={st.page}>
      {/* HERO в стиле эталона */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 6 из 6</span>
          <span style={st.credits}>Анкета</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Мотивация</div>
        <div style={st.heroTitle}>Мотивация и цель 🎯</div>
        <div style={st.heroSubtitle}>Понимание целей поможет точнее настроить план.</div>
      </section>

      {/* Зачем тренировки */}
      <section style={st.card}>
        <div style={st.blockTitle}>Зачем тебе тренировки?</div>
        <div style={st.wrapGridEven}>
          {MOTIVES.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              active={motives.includes(m.key)}
              onClick={() => toggle(motives, m.key, setMotives)}
            />
          ))}
          <Chip
            label="Другое"
            active={motiveOtherEnabled}
            onClick={() => setMotiveOtherEnabled((v) => !v)}
          />
        </div>

        {motiveOtherEnabled && (
          <input
            value={motiveOther}
            onChange={(e) => setMotiveOther(e.target.value)}
            placeholder="Например: подготовка к нормам ГТО"
            style={{ ...st.input, marginTop: 12 }}
          />
        )}
      </section>

      {/* Цель */}
      <section style={st.card}>
        <div style={st.blockTitle}>Какая у тебя цель?</div>
        <div style={st.wrapGridEven}>
          <Chip label="🏃 Сбросить вес" active={goal === "fat_loss"} onClick={() => setGoal("fat_loss")} />
          <Chip label="💪 Набрать мышцы" active={goal === "muscle_gain"} onClick={() => setGoal("muscle_gain")} />
          <Chip label="⚖️ Поддерживать форму" active={goal === "maintenance"} onClick={() => setGoal("maintenance")} />
          <Chip label="🎯 Подготовиться к событию" active={goal === "event_prep"} onClick={() => setGoal("event_prep")} />
          <Chip label="Другое" active={goal === "custom"} onClick={() => setGoal("custom")} />
        </div>

        {goal === "custom" && (
          <input
            value={goalCustom}
            onChange={(e) => setGoalCustom(e.target.value)}
            placeholder="Например: подтянуться 10 раз, пробежать 5 км"
            style={{ ...st.input, marginTop: 12 }}
          />
        )}
      </section>

      {/* CTA и Назад снизу */}
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

/* --- Styles (как эталоны OnbAgeSex/Experience/Diet/Lifestyle) --- */
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
  blockTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 12 },

  wrapGridEven: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 8,
    alignItems: "stretch",
    justifyItems: "stretch",
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

  input: {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "12px 12px",
    background: "#fff",
    fontSize: 16,
    color: "#111827",
    display: "block",
  },
  hintSmall: { marginTop: 6, fontSize: 12, color: "#6B7280" },

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
