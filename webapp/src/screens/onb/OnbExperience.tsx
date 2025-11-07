// webapp/src/screens/onb/OnbExperience.tsx
import { useState } from "react";

export type Experience = "beginner" | "intermediate" | "advanced";

export type OnbExperienceData = {
  experience: "beginner" | "intermediate" | "advanced",
  schedule: { daysPerWeek: number; minutesPerSession: number }
};

type Props = {
  initial?: Partial<OnbExperienceData>;
  loading?: boolean;
  onSubmit: (patch: OnbExperienceData) => void;
  onBack?: () => void; // назад к предыдущему экрану
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void; // нижнее меню
};

export default function OnbExperience({ initial, loading, onSubmit, onBack, onTabChange }: Props) {
  const [experience, setExperience] = useState<Experience>(
    (initial?.experience as Experience) ?? "beginner"
  );
  const [daysPerWeek, setDaysPerWeek] = useState<number>(initial?.schedule?.daysPerWeek ?? 3);
  const [minutesPerSession, setMinutesPerSession] = useState<number>(
    initial?.schedule?.minutesPerSession ?? 60
  );

  const canNext = Boolean(experience && daysPerWeek && minutesPerSession);

  function handleNext() {
    if (!canNext || loading) return;
    onSubmit({ experience, schedule: { daysPerWeek, minutesPerSession } });
  }

  return (
    <div style={st.page}>
      {/* HERO (как в AgeSex) */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 2 из 6</span>
          <span style={st.credits}>Анкета</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Режим</div>
        <div style={st.heroTitle}>Опыт и время ⏱️</div>
        <div style={st.heroSubtitle}>Выбери уровень, частоту и длительность.</div>
      </section>

      {/* Опыт — по горизонтали, широкие элементы с подписями */}
      <section style={st.card}>
        <div style={st.blockTitle}>🎓 Опыт тренировок</div>
        <div style={st.row3Equal}>
          <ChipWithSub
            label="Новичок"
            sub="< 6 мес"
            active={experience === "beginner"}
            onClick={() => setExperience("beginner")}
          />
          <ChipWithSub
            label="Средний"
            sub="6–24 мес"
            active={experience === "intermediate"}
            onClick={() => setExperience("intermediate")}
          />
          <ChipWithSub
            label="Профи"
            sub="2+ года"
            active={experience === "advanced"}
            onClick={() => setExperience("advanced")}
          />
        </div>
      </section>

      {/* Два равных блока в один ряд: Кол-во раз и Время на тренировку */}
      <section style={st.grid2Equal}>
        {/* Кол-во раз в неделю */}
        <div style={st.cardMini}>
          <div style={st.cardMiniTitle}>📅 Сколько раз в неделю?</div>
          <div style={st.rowCenter}>
            {[2, 3, 4, 5].map((d) => (
              <Chip key={d} label={`${d}`} active={daysPerWeek === d} onClick={() => setDaysPerWeek(d)} />
            ))}
            <Chip label="6+" active={daysPerWeek >= 6} onClick={() => setDaysPerWeek(6)} />
          </div>
        </div>

        {/* Время на тренировку */}
        <div style={st.cardMini}>
          <div style={st.cardMiniTitle}>⌛ Сколько минут на тренировку?</div>
          <div style={st.rowCenter}>
            <Chip label="30 мин" active={minutesPerSession === 30} onClick={() => setMinutesPerSession(30)} />
            <Chip label="60 мин" active={minutesPerSession === 60} onClick={() => setMinutesPerSession(60)} />
            <Chip label="90+ мин" active={minutesPerSession >= 90} onClick={() => setMinutesPerSession(90)} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <button
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...st.chip, ...(active ? st.chipActive : {}) }}>
      <span style={{ ...st.chipText, ...(active ? st.chipTextActive : {}) }}>{label}</span>
    </button>
  );
}

function ChipWithSub({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...st.chipWide, ...(active ? st.chipWideActive : {}) }}
    >
      <div style={{ ...st.chipWideLabel, ...(active ? st.chipWideLabelActive : {}) }}>{label}</div>
      <div style={{ ...st.chipWideSub, ...(active ? st.chipWideSubActive : {}) }}>{sub}</div>
    </button>
  );
}

function TabBtn({
  emoji,
  label,
  onClick,
}: { emoji: string; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={st.tabBtn}>
      <div style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</div>
      <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
    </button>
  );
}

/* --- Styles (совпадает по визу с OnbAgeSex) --- */
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

  // Карточки без внешней обводки
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    boxShadow: cardShadow,
  },
  blockTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 8 },

  grid2Equal: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 12,
    alignItems: "stretch",
  },

  // Мини-карточки без обводки
  cardMini: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: cardShadow,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
  },
  cardMiniTitle: { fontSize: 14, fontWeight: 800, color: "#0B1220", textAlign: "center" },

  rowCenter: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
    gap: 8,
    width: "100%",
  },

  // Три равных широких варианта опыта
  row3Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
    alignItems: "stretch",
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
  },
  chipActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
  },
  chipText: { color: "#111827", fontWeight: 700 },
  chipTextActive: { color: "#fff", fontWeight: 800 },

  // Широкая версия чипа с подписью
  chipWide: {
    display: "grid",
    justifyItems: "center",
    padding: "10px 12px",
    background: "#f6f7fb",
    borderRadius: 12,
    border: "none",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
    cursor: "pointer",
    minHeight: 64,
  },
  chipWideActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
  },
  chipWideLabel: { fontSize: 13, fontWeight: 800, color: "#111827" },
  chipWideLabelActive: { color: "#fff" },
  chipWideSub: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  chipWideSubActive: { color: "#E5E7EB" },

  // Кнопки одинакового размера
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

  // Текстовая кнопка "Назад" без фона
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

  tabbar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    background: "#fff",
    boxShadow: "0 -6px 18px rgba(0,0,0,.08)",
    borderTop: "1px solid rgba(0,0,0,.06)",
    padding: "8px 12px",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    maxWidth: 720,
    margin: "0 auto",
  },
  
  tabBtn: {
    border: "none",
    borderRadius: 12,
    padding: "8px 6px",
    background: "#f6f7fb",
    display: "grid",
    placeItems: "center",
    gap: 4,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
};
