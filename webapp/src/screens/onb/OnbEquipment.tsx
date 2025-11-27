// webapp/src/screens/onb/OnbEquipment.tsx
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

export default function OnbEquipment({ loading, onSubmit, onBack }: Props) {
  // Локацию фиксируем на «зал» с полным набором оборудования.
  function submit() {
    onSubmit({ environment: { location: "gym", bodyweightOnly: false } });
  }

  return (
    <div style={st.page}>
      <SoftGlowStyles />

      {/* HERO — чёрный как на остальных онбординг-экранах */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 3 из 6</span>
          <span style={st.pill}>Анкета</span>
        </div>
        <div style={st.heroKicker}>Локация</div>
        <div style={st.heroTitle}>Тренируемся в зале</div>
        <div style={st.heroSubtitle}>Полностью оборудованный тренажёрный зал, весь инвентарь доступен.</div>
      </section>

      {/* Информация об инвентаре — без выбора */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>📍 Локация зафиксирована</div>
        <div style={st.hint}>
          Тренировки будут строиться под полностью оборудованный тренажёрный зал: свободные веса, машины Смита,
          блочные тренажёры, кроссоверы, тренажёры для ног и кардиооборудование.
        </div>
      </section>

      {/* CTA */}
      <button
        type="button"
        onClick={submit}
        disabled={!!loading}
        className="soft-glow"
        style={{ ...st.primaryBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer" }}
      >
        {loading ? "Сохранение…" : "Далее →"}
      </button>

      {onBack ? (
        <button type="button" onClick={onBack} style={st.backTextBtn}>
          ← Назад
        </button>
      ) : null}

      <div style={{ height: 76 }} />
    </div>
  );
}

/* ---------- UI primitives в фирменном стиле ---------- */
function Chip({
  label,
  active,
  onClick,
}: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...st.chip, ...(active ? st.chipActive : {}) }}
    >
      <span style={{ ...st.chipText, ...(active ? st.chipTextActive : {}) }}>{label}</span>
    </button>
  );
}

function ChipWide({
  label,
  active,
  onClick,
}: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...st.chipWide, ...(active ? st.chipWideActive : {}) }}
    >
      <div style={{ ...st.chipWideLabel, ...(active ? st.chipWideLabelActive : {}) }}>{label}</div>
    </button>
  );
}

/* ---------- Shared soft glow for CTA ---------- */
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

/* ---------- Styles ---------- */
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

  /* HERO черный */
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

  row3Equal: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "stretch" },
  row2Equal: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "stretch" },

  hint: { marginTop: 10, fontSize: 13.5, color: "#374151" },

  /* Чипы компактные */
  chip: {
    padding: "10px 12px",
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
    border: "0px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.3 },
  chipTextActive: { color: "#000" },

  /* Широкие чипы для локации */
  chipWide: {
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    minHeight: 64,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    transition: "transform .06s ease",
  },
  chipWideActive: {
    background: GRAD,
    color: "#000",
    border: "0px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  chipWideLabel: { fontSize: 13.5, fontWeight: 850, color: "#111827" },
  chipWideLabelActive: { color: "#000" },

  /* Кнопки */
  primaryBtn: {
    marginTop: 16,
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 800,
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
    textAlign: "center",
  },
};
