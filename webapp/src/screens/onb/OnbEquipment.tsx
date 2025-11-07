// webapp/src/screens/onb/OnbEquipment.tsx
import { useState } from "react";

export type Location = "gym" | "outdoor" | "home";

export type OnbEquipmentData = {
  environment: { location: Location; bodyweightOnly: boolean };
};

type Props = {
  initial?: Partial<OnbEquipmentData>;
  loading?: boolean;
  onSubmit: (patch: OnbEquipmentData) => void;
  onBack?: () => void;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

const locationHints: Record<Location, string> = {
  gym: "Полностью оборудованный зал: есть все основные тренажёры, свободные веса и кардио.",
  outdoor: "Уличная площадка: турники, брусья, петли TRX, лёгкие аксессуары.",
  home: "Домашние условия: коврик, стул/лавка, резинки, лёгкие гантели.",
};

export default function OnbEquipment({
  initial,
  loading,
  onSubmit,
  onBack,
}: Props) {
  const [location, setLocation] = useState<Location>(initial?.environment?.location ?? "gym");
  const [bodyweightOnly, setBodyweightOnly] = useState<boolean>(initial?.environment?.bodyweightOnly ?? false);

  function submit() {
    onSubmit({ environment: { location, bodyweightOnly } });
  }

  return (
    <div style={st.page}>
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 3 из 6</span>
          <span style={st.credits}>Анкета</span>
        </div>
        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Локация</div>
        <div style={st.heroTitle}>Где тренируемся?</div>
        <div style={st.heroSubtitle}>От этого зависит выбор упражнений и инвентаря.</div>
      </section>

      <section style={st.card}>
        <div style={st.blockTitle}>📍 Выбери локацию</div>
        <div style={st.row3Equal}>
          <Chip label="Зал" active={location === "gym"} onClick={() => setLocation("gym")} />
          <Chip label="Улица" active={location === "outdoor"} onClick={() => setLocation("outdoor")} />
          <Chip label="Дом" active={location === "home"} onClick={() => setLocation("home")} />
        </div>
        <div style={st.hint}>{locationHints[location]}</div>
      </section>

      <section style={st.card}>
        <div style={st.blockTitle}>🧱 Инвентарь</div>
        <div style={st.row2Equal}>
          <Chip
            label="Только вес тела"
            active={bodyweightOnly}
            onClick={() => setBodyweightOnly(true)}
          />
          <Chip
            label="Есть инвентарь"
            active={!bodyweightOnly}
            onClick={() => setBodyweightOnly(false)}
          />
        </div>
        <div style={st.hint}>
          {bodyweightOnly
            ? "Программы будут полностью на собственном весе, без оборудования."
            : "Используем весь стандартный инвентарь для выбранной локации."}
        </div>
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={!!loading}
        style={{ ...st.primaryBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer" }}
      >
        {loading ? "Сохранение…" : "Далее →"}
      </button>

      <button type="button" onClick={onBack} style={st.secondaryBtn}>
        ← Назад
      </button>
    </div>
  );
}

/* ----------------- UI primitives ----------------- */
function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...st.chip,
        background: active ? "linear-gradient(135deg,#6a8dff,#8a64ff)" : "#f3f4f7",
        color: active ? "#fff" : "#1b1b1b",
        boxShadow: active ? "0 10px 20px rgba(106,141,255,.35)" : "none",
      }}
    >
      {label}
    </button>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto", padding: "16px", fontFamily: "system-ui,-apple-system,'Inter','Roboto'" },
  heroCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
    background: "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    boxShadow: "0 12px 24px rgba(0,0,0,.12)",
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: { background: "rgba(255,255,255,.25)", padding: "4px 10px", borderRadius: 999, fontSize: 12 },
  credits: { background: "rgba(255,255,255,.25)", padding: "4px 10px", borderRadius: 999, fontSize: 12 },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  heroSubtitle: { opacity: 0.9, marginTop: 4 },
  card: {
    background: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
  },
  blockTitle: { fontWeight: 700, marginBottom: 12 },
  row3Equal: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 },
  row2Equal: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 },
  chip: {
    border: "none",
    borderRadius: 16,
    padding: "14px 12px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all .2s ease",
  },
  hint: { marginTop: 12, fontSize: 13, color: "#4b5563" },
  primaryBtn: {
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "14px",
    fontSize: 16,
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 10px 24px rgba(0,0,0,.15)",
  },
  secondaryBtn: {
    marginTop: 12,
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "12px",
    fontWeight: 700,
    background: "#f3f4f7",
    color: "#1b1b1b",
  },
};
