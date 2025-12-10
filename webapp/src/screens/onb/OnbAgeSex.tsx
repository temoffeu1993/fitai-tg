// webapp/src/screens/onb/OnbAgeSex.tsx
import { useMemo, useState } from "react";

export type Sex = "male" | "female";
export type OnbAgeSexData = {
  profile: { name: string };
  ageSex: { sex: Sex; age: number };
  body: { height: number; weight: number };
};

type Props = {
  initial?: Partial<OnbAgeSexData>;
  loading?: boolean;
  onSubmit: (patch: OnbAgeSexData) => void;
  onBack?: () => void;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

export default function OnbAgeSex({ initial, loading, onSubmit, onBack }: Props) {
  // Имя берётся из Telegram автоматически, не спрашиваем пользователя
  const [sex, setSex] = useState<Sex>((initial?.ageSex?.sex as Sex) ?? "male");
  const [age, setAge] = useState<string>((initial?.ageSex?.age ?? "").toString());
  const [height, setHeight] = useState<string>((initial?.body?.height ?? "").toString());
  const [weight, setWeight] = useState<string>((initial?.body?.weight ?? "").toString());

  const num = (s: string) => {
    const n = parseFloat((s || "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const h = num(height);
  const w = num(weight);

  const bmi = useMemo(() => {
    if (!h || !w) return NaN;
    const m = h / 100;
    return w / (m * m);
  }, [h, w]);

  function bmiCategory(v: number) {
    if (!Number.isFinite(v)) return { label: "—", tone: "#555" };
    if (v < 18.5) return { label: "ниже нормы", tone: "#2563EB" };
    if (v < 25) return { label: "в норме", tone: "#059669" };
    if (v < 30) return { label: "чуть выше нормы", tone: "#CA8A04" };
    return { label: "существенно выше нормы", tone: "#DC2626" };
  }
  const cat = bmiCategory(bmi);

  const canNext =
    ["male", "female"].includes(sex) &&
    Number.isFinite(num(age)) &&
    Number.isFinite(h) &&
    Number.isFinite(w);

  function handleNext() {
    if (!canNext || loading) return;
    onSubmit({
      profile: { name: initial?.profile?.name || "Спортсмен" }, // Имя из Telegram или дефолт
      ageSex: { sex, age: Number(num(age)) },
      body: { height: h, weight: w },
    });
  }

  return (
    <div style={s.page}>
      <SoftGlowStyles />

      {/* HERO в фирменном стиле */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Шаг 1 из 5</span>
          <span style={s.pill}>Анкета</span>
        </div>

        <div style={s.heroKicker}>Профиль</div>
        <div style={s.heroTitle}>Основные данные 📋</div>
        <div style={s.heroSubtitle}>Укажи базу. План станет точнее.</div>
      </section>

      {/* Ряд 1: Возраст / Пол — стеклянные карточки */}
      <section style={s.grid2Equal}>
        <div style={ux.cardMini}>
          <div style={ux.cardMiniTitle}>🎂 Возраст</div>
          <div style={ux.center}>
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="лет"
              inputMode="numeric"
              style={ux.inputGlass}
            />
          </div>
        </div>

        <div style={ux.cardMini}>
          <div style={ux.cardMiniTitle}>🚻 Пол</div>
          <div style={ux.sexRow}>
            {(["male", "female"] as Sex[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSex(v)}
                style={{ ...ux.chip, ...(sex === v ? ux.chipActive : {}) }}
              >
                <span style={{ ...(sex === v ? ux.chipTextActive : ux.chipText) }}>
                  {v === "male" ? "МУЖ" : "ЖЕН"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Рост / Вес / ИМТ */}
      <section style={s.block}>
        <div style={ux.row3Equal}>
          <div style={ux.centerCol}>
            <div style={ux.colTitle}>📏 Рост</div>
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="см"
              inputMode="decimal"
              style={ux.inputGlass}
            />
          </div>
          <div style={ux.centerCol}>
            <div style={ux.colTitle}>⚖️ Вес</div>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="кг"
              inputMode="decimal"
              style={ux.inputGlass}
            />
          </div>
          <div style={ux.centerCol}>
            <div style={ux.colTitle}>📊 ИМТ</div>
            <div style={{ fontSize: 22, fontWeight: 850, color: cat.tone, lineHeight: 1 }}>
              {Number.isFinite(bmi) ? bmi.toFixed(1) : "—"}
            </div>
            <div style={{ fontSize: 12, color: cat.tone }}>{cat.label}</div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={s.bmiTitle}>Ориентир</div>
          <div style={s.bmiHint}>
            {Number.isFinite(bmi) && h && w
              ? (() => {
                  const minW = Math.round(18.5 * (h / 100) * (h / 100));
                  const maxW = Math.round(24.9 * (h / 100) * (h / 100));
                  return `При росте ${h} см ориентир по массе: ~${minW}–${maxW} кг — учтём при составлении плана.`;
                })()
              : "Введи рост и вес — покажу ориентир."}
          </div>
        </div>
      </section>

      {/* CTA */}
      <button
        onClick={handleNext}
        disabled={!canNext || !!loading}
        className="soft-glow"
        style={{
          ...s.primaryBtn,
          opacity: !canNext || loading ? 0.6 : 1,
          cursor: !canNext || loading ? "default" : "pointer",
        }}
      >
        {loading ? "Сохранение…" : "Далее →"}
      </button>

      {onBack ? (
        <button style={s.backTextBtn} onClick={onBack} type="button">
          Назад
        </button>
      ) : null}

      <div style={{ height: 76 }} />
    </div>
  );
}

/* ===== shared micro-styles (анимация мягкого свечения CTA) ===== */
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

/* ===================== VISUAL ===================== */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const GRAD = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },

  /* HERO чёрный как на Dashboard/Nutrition */
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

  /* Белые стеклянные блоки как на NutritionToday */
  block: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
    backdropFilter: "blur(10px)",
  },

  bmiTitle: { fontSize: 15, fontWeight: 800, color: "#0B1220", marginBottom: 6 },
  bmiHint: { fontSize: 13.5, color: "#374151" },

  grid2Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 10,
    alignItems: "stretch",
  },

  grid3Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginTop: 10,
    alignItems: "stretch",
  },

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

/* Подкарточки и поля в едином стиле с приложением */
const ux: Record<string, React.CSSProperties> = {
  cardMini: {
    background: "rgba(255,255,255,0.75)",
    borderRadius: 16,
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
    border: "1px solid rgba(0,0,0,.06)",
    backdropFilter: "blur(10px)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  cardMiniTitle: { fontSize: 13.5, fontWeight: 800, textAlign: "center", marginBottom: 8, color: "#0B1220" },

  center: { display: "flex", justifyContent: "center" },
  centerCol: { display: "grid", justifyItems: "center", gap: 8 },

  row3Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
  },
  colTitle: { fontSize: 12.5, fontWeight: 800, textAlign: "center", color: "#0B1220" },

  inputGlass: {
    width: "100%",
    maxWidth: 140,
    border: "1px solid rgba(0,0,0,.08)",
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    borderRadius: 12,
    padding: "10px",
    fontSize: 16,
    textAlign: "center",
    color: "#111",
  },

  sexRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" },
  chip: {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(255,255,255,0.6)",          // полупрозрачный фон
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",      // мягкая тень
  backdropFilter: "blur(8px)",                  // добавлен блюр
  WebkitBackdropFilter: "blur(8px)",
  cursor: "pointer",
  transition: "all .15s ease",
},
chipActive: {
  background: "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
  border: "1px solid rgba(0,0,0,0.04)",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  color: "#000",
},
  chipText: { color: "#111827", fontWeight: 800, letterSpacing: 0.4 },
  chipTextActive: { color: "#000", fontWeight: 900, letterSpacing: 0.4 },
};
