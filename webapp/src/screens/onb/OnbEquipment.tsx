// webapp/src/screens/onb/OnbEquipment.tsx
import { useMemo, useRef, useState } from "react";

export type Location = "gym" | "outdoor" | "home";

const COMMON_EQUIPMENT = [
  "гантели","штанга","лавка/скамья","турник","блины","станция Смита","блочная рама",
  "кроссовер","жим ногами","гребной тренажёр","беговая дорожка","велотренажёр",
  "эллипсоид","гиря","петли TRX","эспандеры","коврик","ролик для пресса",
];

export type OnbEquipmentData = {
  environment: { location: "gym"|"home"|"outdoor", bodyweightOnly: boolean };
  equipmentItems: string[]
};

type Props = {
  initial?: Partial<OnbEquipmentData>;
  loading?: boolean;
  onSubmit: (patch: OnbEquipmentData) => void;
  onBack?: () => void;
  analyzeUrl?: string;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

export default function OnbEquipment({
  initial,
  loading,
  onSubmit,
  onBack,
  analyzeUrl = "/equipment/analyze",
  onTabChange,
}: Props) {
  const [location, setLocation] = useState<Location>(initial?.environment?.location ?? "gym");
  const [bodyweightOnly, setBodyweightOnly] = useState<boolean>(initial?.environment?.bodyweightOnly ?? false);

  const [manualItems, setManualItems] = useState<string[]>(
    Array.isArray(initial?.equipmentItems) ? initial!.equipmentItems! : []
  );
  const [aiItems, setAiItems] = useState<string[]>([]);
  const allItems = useMemo(() => Array.from(new Set([...manualItems, ...aiItems])), [manualItems, aiItems]);

  const [search, setSearch] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const analyzedRefs = useRef<Set<string>>(new Set());

  const filteredList = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = COMMON_EQUIPMENT.filter((e) => !allItems.includes(e));
    if (!s) return base;
    return base.filter((e) => e.toLowerCase().includes(s));
  }, [search, allItems]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  async function analyze() {
    if (!photoFile || !previewUrl) return;
    if (analyzedRefs.current.has(previewUrl)) return;

    setLoadingAnalyze(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const fd = new FormData();
      fd.append("image", photoFile);

      const resp = await fetch(analyzeUrl, { method: "POST", body: fd, signal: controller.signal });
      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);

      const json = JSON.parse(text);
      const found: string[] = Array.isArray(json?.items) ? json.items : [];

      const cleaned = Array.from(new Set(found.map((x) => x.trim()).filter(Boolean)));
      setAiItems((prev) => Array.from(new Set([...prev, ...cleaned])));

      analyzedRefs.current.add(previewUrl);
    } catch (e: any) {
      alert(e?.name === "AbortError" ? "Таймаут. Проверь соединение/сервер." : (e?.message || "Ошибка распознавания."));
    } finally {
      clearTimeout(timer);
      setLoadingAnalyze(false);
    }
  }

  function addItem(name: string) {
    const n = name.trim();
    if (!n || allItems.includes(n)) return;
    setManualItems((p) => [...p, n]);
    setSearch("");
  }

  function removeItem(name: string) {
    setManualItems((p) => p.filter((i) => i !== name));
    setAiItems((p) => p.filter((i) => i !== name));
  }

  function submit() {
    const patch: OnbEquipmentData = {
      environment: { location, bodyweightOnly },
      equipmentItems: bodyweightOnly ? [] : allItems,
    };
    onSubmit(patch);
  }

  return (
    <div style={st.page}>
      {/* HERO */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 3 из 6</span>
          <span style={st.credits}>Анкета</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Инвентарь</div>
        <div style={st.heroTitle}>Локация и оборудование 💪🏻</div>
        <div style={st.heroSubtitle}>Где тренируешься и что у тебя есть — подстрою план.</div>
      </section>

      {/* Где будешь тренироваться? */}
      <section style={st.card}>
        <div style={st.blockTitle}>📍 Где будешь тренироваться?</div>
        <div style={st.row3Equal}>
          <Chip label="В зале"   active={location === "gym"}     onClick={() => setLocation("gym")} />
          <Chip label="На улице" active={location === "outdoor"} onClick={() => setLocation("outdoor")} />
          <Chip label="Дома"     active={location === "home"}    onClick={() => setLocation("home")} />
        </div>
      </section>

      {/* Что есть для тренировок? */}
      <section style={st.card}>
        <div style={st.blockTitle}>🧱 Что есть для тренировок?</div>
        <div style={st.row2Equal}>
          <Chip label="Только вес тела" active={bodyweightOnly} onClick={() => setBodyweightOnly(true)} />
          <Chip label="Есть инвентарь"  active={!bodyweightOnly} onClick={() => setBodyweightOnly(false)} />
        </div>

        {!bodyweightOnly && (
          <>
            {/* Фото зоны */}
            <div style={{ marginTop: 12 }}>
              {previewUrl ? (
                <img src={previewUrl} alt="zone" style={st.photo} />
              ) : (
                <div style={st.photoPh}>
                  <div style={st.camEmoji}>📷</div>
                  <div>Загрузи фото зоны с тренажёрами</div>
                  <div style={st.photoHint}>Совет: снимай подальше, чтобы было видно сразу несколько тренажёров.</div>
                </div>
              )}
              <div style={st.row2Equal}>
                <label style={st.btnPrimary as any}>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFile}
                    style={{ display: "none" }}
                  />
                  <span style={st.btnPrimaryText}>Выбрать фото</span>
                </label>

                <button
                  type="button"
                  onClick={analyze}
                  disabled={!previewUrl || loadingAnalyze}
                  style={{
                    ...st.btnPrimary,
                    opacity: !previewUrl || loadingAnalyze ? 0.6 : 1,
                    cursor: !previewUrl || loadingAnalyze ? "default" : "pointer",
                  }}
                >
                  <span style={st.btnPrimaryText}>{loadingAnalyze ? "Распознаю…" : "Распознать"}</span>
                </button>
              </div>
            </div>

            {/* Выбранное */}
            <div style={{ height: 16 }} />
            <div style={st.selectedCard}>
              <div style={st.selectedTitle}>Выбранное</div>
              <div style={st.selectedWrap}>
                {allItems.length === 0 ? (
                  <div style={{ color: "#98A2B3" }}>Пока пусто</div>
                ) : (
                  allItems.map((name) => (
                    <div key={name} style={st.selectedChip}>
                      <span style={st.selectedChipText}>{name}</span>
                      <button type="button" onClick={() => removeItem(name)} style={st.closeBtn}>✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Добавить вручную */}
            <div style={st.smallTitle}>Добавить вручную</div>
            <div style={st.addRow}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Например: гиперэкстензия"
                style={st.input}
              />
              <button type="button" onClick={() => addItem(search)} style={st.btnPrimary}>
                <span style={st.btnPrimaryText}>Добавить</span>
              </button>
            </div>

            {/* Частые варианты */}
            <div style={st.smallTitle}>Частые варианты</div>
            <div style={st.commonWrap}>
              {filteredList.map((name) => (
                <button key={name} type="button" onClick={() => addItem(name)} style={st.commonChip}>
                  <span style={st.commonChipText}>+ {name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Управление */}
      <button
        type="button"
        onClick={submit}
        disabled={!!loading}
        style={{ ...st.primaryBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer" }}
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
    <button
      type="button"
      onClick={onClick}
      style={{ ...st.chip, ...(active ? st.chipActive : {}) }}
    >
      <span style={{ ...st.chipText, ...(active ? st.chipTextActive : {}) }}>{label}</span>
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

/* --- Styles --- */
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
  pill: { background: "rgba(255,255,255,.2)", padding: "6px 10px", borderRadius: 999, fontSize: 12 },
  credits: { background: "rgba(255,255,255,.2)", padding: "6px 10px", borderRadius: 999, fontSize: 12 },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  heroSubtitle: { opacity: 0.92, marginTop: 2 },

  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    boxShadow: cardShadow,
  },
  blockTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 8 },

  row3Equal: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "stretch" },
  row2Equal: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "stretch" },

  chip: {
    padding: "10px 12px",
    background: "#f6f7fb",
    borderRadius: 12,
    border: "none",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
    cursor: "pointer",
    fontWeight: 700,
  },
  chipActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
  },
  chipText: { color: "#111827", fontWeight: 700 },
  chipTextActive: { color: "#fff", fontWeight: 800 },

  photo: {
    width: "100%",
    aspectRatio: "16/9",
    borderRadius: 16,
    marginTop: 10,
    marginBottom: 10,
    objectFit: "cover",
    boxShadow: cardShadow,
  },
  photoPh: {
    height: 180,
    borderRadius: 16,
    background: "#EEF2F6",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 10,
    fontWeight: 700,
    color: "#0B1220",
    padding: "0 10px",
  },
  camEmoji: { fontSize: 44, lineHeight: 1 },

  photoHint: { fontSize: 12, fontWeight: 500, color: "#667085" },

  // Малые кнопки в цвет «Далее»
  btnPrimary: {
    display: "inline-grid",
    placeItems: "center",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
    cursor: "pointer",
  },
  btnPrimaryText: { color: "#1b1b1b", fontWeight: 800, fontSize: 14 },

  selectedCard: {
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    border: "1px solid #E5E7EB",
    marginTop: 16,
    marginBottom: 10,
  },
  selectedTitle: { fontWeight: 900, fontSize: 16, color: "#0B1220", marginBottom: 10 },
  selectedWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  selectedChip: {
    display: "inline-flex",
    alignItems: "center",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    borderRadius: 999,
    padding: "6px 10px",
    gap: 6,
  },
  selectedChipText: { color: "#ffffff", fontWeight: 600, fontSize: 12 },

  closeBtn: { border: "none", background: "transparent", cursor: "pointer", color: "#E5E7EB", padding: 0 },

  smallTitle: { fontSize: 14, fontWeight: 900, color: "#0B1220", marginTop: 4, marginBottom: 8 },

  // Сетка ввода: не «уезжает» за кнопку
  addRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    gap: 8,
    alignItems: "stretch",
    marginBottom: 20,
  },
  input: {
    width: "92%",
    minWidth: 0,
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "12px 12px",
    background: "#fff",
    fontSize: 16,
    color: "#111827",
  },

  commonWrap: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  commonChip: { background: "#F2F4F7", borderRadius: 999, padding: "6px 10px", border: "none", cursor: "pointer" },
  commonChipText: { color: "#0B1220", fontWeight: 600, fontSize: 12 },

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