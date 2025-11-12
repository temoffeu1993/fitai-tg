// webapp/src/screens/onb/OnbDiet.tsx
import { useMemo, useState } from "react";

export type Budget = "low" | "medium" | "high";

const RESTRICTIONS = ["Лактоза", "Глютен", "Орехи", "Свинина", "Другое"] as const;
const STYLES = ["Всеядный", "Вегетарианец", "Веган", "Халяль", "Кошер", "Другое"] as const;

export type OnbDietData = {
  health: { hasLimits: boolean; limitsText: string };
  preferences: { dislike: string[] };
  dietPrefs: {
    restrictions: string[];
    restrictionOther?: string;
    styles: string[];
    styleOther?: string;
    budgetLevel: Budget;
  };
};

type Props = {
  initial?: Partial<OnbDietData>;
  loading?: boolean;
  onSubmit: (patch: OnbDietData) => void;
  onBack?: () => void;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

export default function OnbDiet({ initial, loading, onSubmit, onBack }: Props) {
  const [hasLimits, setHasLimits] = useState<boolean>(!!initial?.health?.hasLimits);
  const [limitsText, setLimitsText] = useState<string>(initial?.health?.limitsText ?? "");

  const [restrictions, setRestrictions] = useState<string[]>(
    initial?.dietPrefs?.restrictions ?? initial?.preferences?.dislike ?? []
  );
  const [restrictionOther, setRestrictionOther] = useState<string>(initial?.dietPrefs?.restrictionOther ?? "");

  const [stylesSel, setStylesSel] = useState<string[]>(initial?.dietPrefs?.styles ?? []);
  const [styleOther, setStyleOther] = useState<string>(initial?.dietPrefs?.styleOther ?? "");

  const [budget, setBudget] = useState<Budget>(initial?.dietPrefs?.budgetLevel ?? "medium");

  const canNext = useMemo(() => {
    if (hasLimits && !limitsText.trim()) return false;
    if (restrictions.includes("Другое") && !restrictionOther.trim()) return false;
    if (stylesSel.includes("Другое") && !styleOther.trim()) return false;
    return true;
  }, [hasLimits, limitsText, restrictions, restrictionOther, stylesSel, styleOther]);

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }
  function clearRestrictions() {
    setRestrictions([]);
    setRestrictionOther("");
  }

  function handleNext() {
    if (!canNext || loading) return;

    const outRestrictions: string[] = (() => {
      const base = restrictions.filter((r) => r !== "Другое");
      if (restrictions.includes("Другое") && restrictionOther.trim()) base.push(restrictionOther.trim());
      return Array.from(new Set(base));
    })();

    const outStyles: string[] = (() => {
      const base = stylesSel.filter((s) => s !== "Другое");
      if (stylesSel.includes("Другое") && styleOther.trim()) base.push(styleOther.trim());
      return Array.from(new Set(base));
    })();

    onSubmit({
      health: { hasLimits, limitsText: hasLimits ? limitsText.trim() : "" },
      preferences: { dislike: outRestrictions },
      dietPrefs: {
        restrictions: outRestrictions,
        restrictionOther: restrictionOther.trim(),
        styles: outStyles,
        styleOther: styleOther.trim(),
        budgetLevel: budget,
      },
    });
  }

  return (
    <div style={st.page}>
      {/* HERO — чёрный, как на других онбординг-экранах */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 4 из 6</span>
          <span style={st.pill}>Анкета</span>
        </div>

        <div style={st.heroKicker}>Питание</div>
        <div style={st.heroTitle}>Здоровье и питание 🥗</div>
        <div style={st.heroSubtitle}>Учту ограничения и предпочтения. План будет комфортным.</div>
      </section>

      {/* Ряд 1: Ограничения + Бюджет */}
      <section style={st.grid2Cols}>
        <div style={st.cardGlass}>
          <div style={st.blockTitle}>🩺 Есть ли травмы или мед. ограничения?</div>
          <div style={st.row2Equal}>
            <Chip label="Нет"  active={!hasLimits} onClick={() => setHasLimits(false)} />
            <Chip label="Есть" active={hasLimits}  onClick={() => setHasLimits(true)} />
          </div>

          {hasLimits && (
            <textarea
              value={limitsText}
              onChange={(e) => setLimitsText(e.target.value)}
              placeholder="Уточни: колени, спина, давление…"
              style={{ ...st.inputGlass, marginTop: 12, minHeight: 88, resize: "vertical" as const }}
            />
          )}
        </div>

        <div style={st.cardGlass}>
          <div style={st.blockTitle}>💸 Ваш бюджет на продукты</div>
          <div style={st.row3Equal}>
            <Chip label="Низкий"  active={budget === "low"}    onClick={() => setBudget("low")} />
            <Chip label="Средний" active={budget === "medium"} onClick={() => setBudget("medium")} />
            <Chip label="Высокий" active={budget === "high"}   onClick={() => setBudget("high")} />
          </div>
        </div>
      </section>

      {/* Ряд 2: Непереносимости + Стиль питания */}
      <section style={st.grid2Cols}>
        <div style={st.cardGlass}>
          <div style={st.blockTitle}>🚫 Что нельзя или не любишь?</div>
          <div style={st.wrapGridEven}>
            {RESTRICTIONS.map((r) => (
              <ChipSm
                key={r}
                label={r}
                active={restrictions.includes(r)}
                onClick={() => toggle(restrictions, r, setRestrictions)}
              />
            ))}
            <ChipSm label="Нет" active={restrictions.length === 0} onClick={clearRestrictions} />
          </div>

          {restrictions.includes("Другое") && (
            <input
              value={restrictionOther}
              onChange={(e) => setRestrictionOther(e.target.value)}
              placeholder="Например: морепродукты"
              style={{ ...st.inputGlass, marginTop: 12 }}
            />
          )}
        </div>

        <div style={st.cardGlass}>
          <div style={st.blockTitle}>🍽️ Выбери свой стиль питания</div>
          <div style={st.wrapGridEven}>
            {STYLES.map((s) => (
              <ChipSm
                key={s}
                label={s}
                active={stylesSel.includes(s)}
                onClick={() => toggle(stylesSel, s, setStylesSel)}
              />
            ))}
          </div>

          {stylesSel.includes("Другое") && (
            <input
              value={styleOther}
              onChange={(e) => setStyleOther(e.target.value)}
              placeholder="Уточни свой вариант"
              style={{ ...st.inputGlass, marginTop: 12 }}
            />
          )}
        </div>
      </section>

      {/* CTA — стили «как пункты меню»: без тени */}
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

function ChipSm({
  label,
  active,
  onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...st.chipSm, ...(active ? st.chipSmActive : {}) }}>
      <span style={{ ...st.chipSmText, ...(active ? st.chipSmTextActive : {}) }}>{label}</span>
    </button>
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

  /* Карточки — белое стекло */
  cardGlass: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
    backdropFilter: "blur(10px)",
  },

  blockTitle: { fontSize: 15, fontWeight: 800, color: "#0B1220", marginBottom: 10 },

  grid2Cols: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
    alignItems: "stretch",
    marginTop: 12,
  },
  row2Equal: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 },
  row3Equal: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 8,
    marginTop: 12,
  },
  wrapGridEven: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: 8,
    marginTop: 12,
  },

  /* Чипы */
  chip: {
    padding: "10px 12px",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    fontWeight: 800,
    width: "100%",
    textAlign: "center",
    transition: "transform .06s ease",
  },
  /* Активные пункты: без бордюра и без тени */
  chipActive: {
    background: GRAD,
    color: "#000",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.3 },
  chipTextActive: { color: "#000" },

  chipSm: {
    padding: "10px 12px",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
    fontWeight: 800,
  },
  /* Активные Sm: без бордюра и без тени */
  chipSmActive: {
    background: GRAD,
    color: "#000",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  chipSmText: { fontSize: 12, color: "#111827", fontWeight: 800 },
  chipSmTextActive: { color: "#000" },

  /* Поля ввода — стекло */
  inputGlass: {
    width: "100%",
    maxWidth: "100%",
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "12px",
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    fontSize: 16,
    color: "#111",
  },

  /* CTA как пункты меню: без тени и бордюра */
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
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
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
