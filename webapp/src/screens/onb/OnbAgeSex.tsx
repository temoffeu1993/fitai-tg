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
  const [name, setName] = useState<string>(initial?.profile?.name ?? "");
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
    name.trim().length > 1 &&
    ["male", "female"].includes(sex) &&
    Number.isFinite(num(age)) &&
    Number.isFinite(h) &&
    Number.isFinite(w);

  function handleNext() {
    if (!canNext || loading) return;
    onSubmit({
      profile: { name: name.trim() },
      ageSex: { sex, age: Number(num(age)) },
      body: { height: h, weight: w },
    });
  }

  return (
    <div style={s.page}>
      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Шаг 1 из 6</span>
          <span style={s.credits}>Анкета</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Профиль</div>
        <div style={s.heroTitle}>Основные данные 📋</div>
        <div style={s.heroSubtitle}>Укажи базу. План станет точнее.</div>
      </section>

      {/* Ряд 1: Имя / Возраст / Пол */}
      <section style={s.grid3Equal}>
        {/* Имя */}
        <div style={s.cardMini}>
          <div style={s.cardMiniTitle}>🙂 Имя</div>
          <div style={s.center}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Тёма"
              style={s.inputMini}
            />
          </div>
        </div>

        {/* Возраст */}
        <div style={s.cardMini}>
          <div style={s.cardMiniTitle}>🎂 Возраст</div>
          <div style={s.center}>
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="лет"
              inputMode="numeric"
              style={s.inputMini}
            />
          </div>
        </div>

        {/* Пол */}
        <div style={s.cardMini}>
          <div style={s.cardMiniTitle}>🚻 Пол</div>
          <div style={s.sexRow}>
            {(["male", "female"] as Sex[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSex(v)}
                style={{ ...s.chip, ...(sex === v ? s.chipActive : {}) }}
              >
                <span style={{ ...(sex === v ? s.chipTextActive : s.chipText) }}>
                  {v === "male" ? "МУЖ" : "ЖЕН"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Рост/Вес/ИМТ + Ориентир */}
      <section style={s.block}>
        <div style={s.row3Equal}>
          <div style={s.centerCol}>
            <div style={s.colTitle}>📏 Рост</div>
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="см"
              inputMode="decimal"
              style={s.inputMini}
            />
          </div>
          <div style={s.centerCol}>
            <div style={s.colTitle}>⚖️ Вес</div>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="кг"
              inputMode="decimal"
              style={s.inputMini}
            />
          </div>
          <div style={s.centerCol}>
            <div style={s.colTitle}>📊 ИМТ</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: cat.tone, lineHeight: 1 }}>
              {Number.isFinite(bmi) ? bmi.toFixed(1) : "—"}
            </div>
            <div style={{ fontSize: 12, color: cat.tone }}>{cat.label}</div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
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
        style={{
          ...s.primaryBtn,
          opacity: !canNext || loading ? 0.6 : 1,
          cursor: !canNext || loading ? "default" : "pointer",
        }}
      >
        {loading ? "Сохранение…" : "Далее →"}
      </button>

      <div style={{ height: 76 }} />
    </div>
  );
}

/* Styles */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
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

  block: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },
  bmiTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 },
  bmiHint: { fontSize: 14, color: "#374151" },

  grid3Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginTop: 10,
    alignItems: "stretch",
  },

  cardMini: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: cardShadow,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  // отступ между заголовком и полем
  cardMiniTitle: { fontSize: 14, fontWeight: 800, textAlign: "center", marginBottom: 8 },

  sexRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" },

  center: { display: "flex", justifyContent: "center" },
  centerCol: { display: "grid", justifyItems: "center", gap: 6 },

  row3Equal: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
  },
  colTitle: { fontSize: 13, fontWeight: 800, textAlign: "center" },

  inputMini: {
    width: "100%",
    maxWidth: 120,
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "10px",
    fontSize: 16,
    textAlign: "center",
  },

  chip: {
    padding: "8px 10px",
    background: "#f6f7fb",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
  },
  chipActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
  },
  chipText: { color: "#111827", fontWeight: 700 },
  chipTextActive: { color: "#fff", fontWeight: 800 },

  primaryBtn: {
    marginTop: 14,
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "14px",
    fontSize: 16,
    fontWeight: 700,
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
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