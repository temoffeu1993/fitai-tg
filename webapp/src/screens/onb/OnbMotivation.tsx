// webapp/src/screens/onb/OnbMotivation.tsx
import { useMemo, useState } from "react";

export type Goal =
  | "weight_loss"
  | "muscle_gain"
  | "glutes_legs"
  | "energy_tone"
  | "health_improvement"
  | "endurance_functional"
  | "custom";
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
  goals: {
    primary: Goal;
    customText?: string;
  };
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
  const [goal, setGoal] = useState<Goal>(initial?.motivation?.goal ?? "weight_loss");
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

    // === МГНОВЕННЫЙ ФЛАГ И ОПОВЕЩЕНИЕ ДЛЯ НАВБАРА ===
    try { localStorage.setItem("onb_complete", "1"); } catch {}
    try { new BroadcastChannel("onb").postMessage("onb_complete"); } catch {}
    try { window.dispatchEvent(new Event("onb_updated")); } catch {}

    onSubmit({
      motivation: {
        motives: motivesOut,
        motiveOther: motiveOtherEnabled ? motiveOther.trim() : "",
        goal,
        goalCustom: goal === "custom" ? goalCustom.trim() : "",
      },
      goals: {
        primary: goal,
        customText: goal === "custom" ? goalCustom.trim() : undefined,
      },
    });
  }

  return (
    <div style={st.page}>
      <SoftGlowStyles />

      {/* HERO — чёрный, как на остальных онбординг-экранах */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 6 из 6</span>
        <span style={st.pill}>Анкета</span>
        </div>

        <div style={st.heroKicker}>Мотивация</div>
        <div style={st.heroTitle}>Мотивация и цель 🎯</div>
        <div style={st.heroSubtitle}>Понимание целей поможет точнее настроить план.</div>
      </section>

      {/* Зачем тренировки — стеклянная карточка */}
      <section style={st.cardGlass}>
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
            style={{ ...st.inputGlass, marginTop: 12 }}
          />
        )}
      </section>

      {/* Цель — стеклянная карточка */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>Какая у тебя цель?</div>
        <div style={st.wrapGridEven}>
          <Chip label="🏃 Сбросить вес" active={goal === "weight_loss"} onClick={() => setGoal("weight_loss")} />
          <Chip label="💪 Набрать мышцы" active={goal === "muscle_gain"} onClick={() => setGoal("muscle_gain")} />
          <Chip label="🍑 Ягодицы и ноги" active={goal === "glutes_legs"} onClick={() => setGoal("glutes_legs")} />
          <Chip label="⚡️ Тонус и энергия" active={goal === "energy_tone"} onClick={() => setGoal("energy_tone")} />
          <Chip label="🩺 Здоровье и осанка" active={goal === "health_improvement"} onClick={() => setGoal("health_improvement")} />
          <Chip label="🏋️‍♂️ Функциональность/выносливость" active={goal === "endurance_functional"} onClick={() => setGoal("endurance_functional")} />
          <Chip label="Другое" active={goal === "custom"} onClick={() => setGoal("custom")} />
        </div>

        {goal === "custom" && (
          <input
            value={goalCustom}
            onChange={(e) => setGoalCustom(e.target.value)}
            placeholder="Например: подтянуться 10 раз, пробежать 5 км"
            style={{ ...st.inputGlass, marginTop: 12 }}
          />
        )}
      </section>

      {/* CTA — увеличенный размер как просили */}
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
        {loading ? "Сохранение…" : "Завершить →"}
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
    background: GRAD,
    color: "#000",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.3, fontSize: 13 },
  chipTextActive: { color: "#000", fontSize: 13, fontWeight: 900 },

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
    color: "#000",
    background: GRAD,
    boxShadow: "0 2px 6px rgba(0,0,0,.12)",
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
};
