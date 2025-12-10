// webapp/src/screens/onb/OnbExperience.tsx
import { useState } from "react";

export type Experience =
  | "never_trained"
  | "long_break"
  | "training_regularly"
  | "training_experienced";

export type OnbExperienceData = {
  experience: Experience;
  schedule: { daysPerWeek: number; minutesPerSession: number };
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
    (initial?.experience as Experience) ?? "never_trained"
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
    <div style={s.page}>
      {/* HERO — чёрный, как в OnbAgeSex/Dashboard */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Шаг 2 из 5</span>
          <span style={s.pill}>Анкета</span>
        </div>

        <div style={s.heroKicker}>Режим</div>
        <div style={s.heroTitle}>Опыт и частота ⏱️</div>
        <div style={s.heroSubtitle}>Выбери свой опыт и сколько раз в неделю тренироваться.</div>
      </section>

      {/* Опыт — широкие стеклянные чипы с подзаголовком */}
      <section style={s.block}>
        <div style={s.blockTitle}>🎓 Твой опыт тренировок</div>
        <div style={ux.row3Equal}>
          <ChipWide
            label="Новичок"
            sub="0-6 месяцев опыта или перерыв"
            active={experience === "beginner"}
            onClick={() => setExperience("beginner")}
          />
          <ChipWide
            label="Средний уровень"
            sub="6 месяцев - 2 года регулярных тренировок"
            active={experience === "intermediate"}
            onClick={() => setExperience("intermediate")}
          />
          <ChipWide
            label="Продвинутый"
            sub="2+ года, знаю технику и принципы"
            active={experience === "advanced"}
            onClick={() => setExperience("advanced")}
          />
        </div>
      </section>

      {/* Частота и длительность тренировок */}
      <section style={ux.grid2Equal}>
        <div style={ux.cardMini}>
          <div style={ux.cardMiniTitle}>📅 Сколько раз в неделю?</div>
          <div style={ux.rowChips}>
            {[2, 3, 4, 5].map((d) => (
              <Chip key={d} label={`${d}`} active={daysPerWeek === d} onClick={() => setDaysPerWeek(d)} />
            ))}
            <Chip label="6+" active={daysPerWeek >= 6} onClick={() => setDaysPerWeek(6)} />
          </div>
        </div>

        <div style={ux.cardMini}>
          <div style={ux.cardMiniTitle}>⏱️ Длительность тренировки</div>
          <div style={ux.rowChips}>
            {[30, 45, 60, 75, 90].map((m) => (
              <Chip
                key={m}
                label={`${m}`}
                active={minutesPerSession === m}
                onClick={() => setMinutesPerSession(m)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA — градиент как в приложении, тень как у чипов пола */}
      <button
        onClick={handleNext}
        disabled={!canNext || !!loading}
        style={{
          ...s.primaryBtn,
          opacity: !canNext || loading ? 0.6 : 1,
          cursor: !canNext || loading ? "default" : "pointer",
        }}
      >
        {loading ? "Сохранение…" : "Далее →"}
      </button>

      {onBack && (
        <button type="button" onClick={onBack} style={s.backTextBtn}>
          Назад
        </button>
      )}

      {/* Нижнее меню при необходимости: onTabChange?.("home" | ...) */}
      {/* Можно оставить здесь-хук, визуально меню управляется общим NavBar. */}

      <div style={{ height: 76 }} />
    </div>
  );
}

/* ---------- primitives, в стиле OnbAgeSex ---------- */
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
    <button
      type="button"
      onClick={onClick}
      style={{ ...ux.chip, ...(active ? ux.chipActive : {}) }}
    >
      <span style={{ ...(active ? ux.chipTextActive : ux.chipText) }}>{label}</span>
    </button>
  );
}

function ChipWide({
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
      style={{ ...ux.chipWide, ...(active ? ux.chipWideActive : {}) }}
    >
      <div style={{ ...(active ? ux.chipWideLabelActive : ux.chipWideLabel) }}>{label}</div>
      <div style={{ ...(active ? ux.chipWideSubActive : ux.chipWideSub) }}>{sub}</div>
    </button>
  );
}

/* ---------- styles ---------- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const GRAD = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },

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

  block: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
    backdropFilter: "blur(10px)",
  },
  blockTitle: { fontSize: 15, fontWeight: 800, color: "#0B1220", marginBottom: 10 },

  primaryBtn: {
    marginTop: 16,
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
    background: "#0f172a",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
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

const ux: Record<string, React.CSSProperties> = {
  row3Equal: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    alignItems: "stretch",
  },

  grid2Equal: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 12,
    alignItems: "stretch",
  },

  cardMini: {
    background: "rgba(255,255,255,0.6)",
    borderRadius: 16,
    boxShadow: cardShadow,
    border: "1px solid rgba(0,0,0,.06)",
    backdropFilter: "blur(10px)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
  },
  cardMiniTitle: { fontSize: 13.5, fontWeight: 800, color: "#0B1220", textAlign: "center" },

  rowChips: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
    gap: 8,
    width: "100%",
  },

  chip: {
    padding: "10px 12px",
    background: "#f6f7fb",
    borderRadius: 12,
    border: "0px solid rgba(0,0,0,.06)",
    cursor: "pointer",
    fontWeight: 800,
    width: "100%",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    transition: "transform .06s ease",
  },
  chipActive: {
    background: "#0f172a",
    color: "#fff",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.4 },
  chipTextActive: { color: "#fff", letterSpacing: 0.4 },

  chipWide: {
    display: "grid",
    justifyItems: "center",
    padding: "12px",
    minHeight: 72,
    background: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.06)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    gap: 2,
  },
  chipWideActive: {
    background: "#0f172a",
    color: "#fff",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  chipWideLabel: { fontSize: 14, fontWeight: 850, color: "#111827" },
  chipWideLabelActive: { fontSize: 14, fontWeight: 900, color: "#fff" },
  chipWideSub: { fontSize: 11.5, color: "#6B7280" },
  chipWideSubActive: { fontSize: 11.5, color: "rgba(255,255,255,0.8)" },
};
