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
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void; // добавили для таббара
};

export default function OnbDiet({ initial, loading, onSubmit, onBack, onTabChange }: Props) {
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
      {/* HERO */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 4 из 6</span>
          <span style={st.credits}>Анкета</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Питание</div>
        <div style={st.heroTitle}>Здоровье и питание 🥗</div>
        <div style={st.heroSubtitle}>Учту ограничения и предпочтения. План будет комфортным.</div>
      </section>

      {/* Ряд 1: Ограничения + Бюджет */}
      <section style={st.grid2Cols}>
        {/* Медицинские ограничения */}
        <div style={st.card}>
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
              style={{ ...st.input, marginTop: 12, minHeight: 88, resize: "vertical" as const }}
            />
          )}
        </div>

        {/* Бюджет */}
        <div style={st.card}>
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
        {/* Непереносимости */}
        <div style={st.card}>
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
              style={{ ...st.input, marginTop: 12 }}
            />
          )}
        </div>

        {/* Стиль питания */}
        <div style={st.card}>
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
              style={{ ...st.input, marginTop: 12 }}
            />
          )}
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

/* ---- UI ---- */
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

function TabBtn({
  emoji,
  label,
  active,
  onClick,
}: { emoji: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...st.tabBtn, ...(active ? st.tabBtnActive : {}) }}>
      <div style={{ fontSize: 18 }}>{emoji}</div>
      <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
    </button>
  );
}

/* ---- Styles ---- */
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
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
  },
  blockTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 12 },

  grid2Cols: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
    alignItems: "stretch",
    marginTop: 12,
  },

  row2Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    alignItems: "stretch",
    justifyItems: "stretch",
    marginTop: 12,
  },
  row3Equal: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 8,
    alignItems: "stretch",
    justifyItems: "stretch",
    marginTop: 12,
  },

  wrapGridEven: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: 8,
    marginTop: 12,
    alignItems: "stretch",
    justifyItems: "stretch",
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

  chipSm: {
    padding: "10px 12px",
    background: "#f6f7fb",
    borderRadius: 10,
    border: "none",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
    cursor: "pointer",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  chipSmActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
  },
  chipSmText: { fontSize: 12, color: "#111827", fontWeight: 700 },
  chipSmTextActive: { color: "#fff", fontWeight: 800 },

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

  // таббар как в OnbAgeSex
  tabbar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
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
    padding: "8px",
    background: "#f6f7fb",
    display: "grid",
    placeItems: "center",
    gap: 4,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  tabBtnActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
  },
};
