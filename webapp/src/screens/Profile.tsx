// webapp/src/screens/Profile.tsx
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetProfileRemote } from "@/api/profile";
import { NUTRITION_CACHE_KEY } from "@/hooks/useNutritionPlan";
import { excludeExercise, getExcludedExerciseDetails, includeExercise, searchExercises } from "@/api/exercises";
import { User, Dumbbell, UtensilsCrossed, Search, ChevronDown, ChevronUp, Pencil } from "lucide-react";

type Summary = any;

// ─── Visual constants (same as Progress/WorkoutResult) ──────────────────────
const GROOVE_BG = "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)";
const GROOVE_SHADOW = "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)";
const FILL_BG = "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)";
const FILL_SHADOW = "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)";

const LOCAL_RESET_KEYS = [
  "onb_summary", "onb_feedback", "onb_feedback_pending", "onb",
  "onboarding_done", "onb_complete", "onb_history",
  "plan_cache_v2", "history_sessions_v1", "current_plan",
  "session_draft", "planned_workout_id", "schedule_cache_v1",
  "last_workout_result_v1", "scheme_selected", "highlight_generate_btn",
  "co2_test_result", "profile",
];

// ─── Data helpers ───────────────────────────────────────────────────────────

function safeNum(x: any, suffix?: string) {
  if (x === null || x === undefined || x === "") return "—";
  const n = Number(x);
  if (Number.isFinite(n)) return suffix ? `${n} ${suffix}` : String(n);
  return suffix ? `${x} ${suffix}` : String(x);
}

function goalRus(g?: string) {
  if (!g) return "—";
  const map: Record<string, string> = {
    lose_weight: "Сбросить вес",
    build_muscle: "Набрать мышцы",
    athletic_body: "Спортивное тело",
    health_wellness: "Здоровье и самочувствие",
  };
  return map[g] || g;
}

function expRus(e: any) {
  const v = typeof e === "string" ? e : e?.level;
  const map: Record<string, string> = {
    beginner: "Новичок",
    intermediate: "Средний уровень",
    advanced: "Продвинутый",
    never_trained: "Новичок",
    long_break: "Новичок (после перерыва)",
    training_regularly: "Средний уровень",
    training_experienced: "Продвинутый",
  };
  return map[String(v || "")] || v || "—";
}

function placeRus(p?: string) {
  if (!p) return "—";
  const map: Record<string, string> = {
    gym: "Тренажёрный зал",
    home_no_equipment: "Дома, без инвентаря",
    home_with_gear: "Дома, с инвентарём",
  };
  return map[p] || p;
}

function workStyleRus(w?: string) {
  if (!w) return "—";
  const map: Record<string, string> = {
    sedentary: "Сидячая работа",
    balanced: "Сидячая + хожу пешком",
    on_feet: "Весь день на ногах",
    heavy_work: "Тяжёлый физический труд",
  };
  return map[w] || w;
}

function sexRus(s?: string) {
  if (s === "male") return "Муж";
  if (s === "female") return "Жен";
  return "—";
}

// ─── Card component (same as Progress) ─────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <div style={{ ...s.card, ...style }}>{children}</div>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{typeof value === "string" || typeof value === "number" ? value : value}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Profile() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tgProfile, setTgProfile] = useState<any>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Array<{ exerciseId: string; name: string }>>([]);
  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excludedError, setExcludedError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<Array<{ exerciseId: string; name: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const navigate = useNavigate();

  // ─── Data loading ───────────────────────────────────────────────────────

  function readAll() {
    try {
      const raw = localStorage.getItem("onb_summary");
      if (raw) setSummary(JSON.parse(raw));
      else setSummary(null);
    } catch { setSummary(null); }

    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        setTgProfile({
          id: tg.initDataUnsafe.user.id,
          first_name: tg.initDataUnsafe.user.first_name,
          last_name: tg.initDataUnsafe.user.last_name,
          username: tg.initDataUnsafe.user.username,
          photo_url: tg.initDataUnsafe.user.photo_url,
        });
      } else setTgProfile(null);
    } catch { setTgProfile(null); }
  }

  useEffect(() => {
    readAll();
    setLoaded(true);
    const onFocus = () => readAll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ─── Excluded exercises logic ───────────────────────────────────────────

  const loadExcluded = async () => {
    setExcludedLoading(true);
    setExcludedError(null);
    try {
      const list = await getExcludedExerciseDetails();
      setExcluded(Array.isArray(list) ? list : []);
    } catch {
      setExcludedError("Не удалось загрузить исключённые упражнения.");
    } finally {
      setExcludedLoading(false);
    }
  };

  useEffect(() => { void loadExcluded(); }, []);

  const runSearch = async (q: string) => {
    const t = String(q || "").trim();
    setSearchQ(q);
    if (t.length < 2) { setSearchRes([]); return; }
    setSearchLoading(true);
    try {
      const out = await searchExercises({ q: t, limit: 20 });
      setSearchRes(Array.isArray(out?.items) ? out.items : []);
    } catch { setSearchRes([]); }
    finally { setSearchLoading(false); }
  };

  const addExcluded = async (exerciseId: string) => {
    try {
      await excludeExercise({ exerciseId, reason: "profile_blacklist", source: "user" });
      await loadExcluded();
    } catch { setExcludedError("Не удалось исключить упражнение."); }
  };

  const removeExcluded = async (exerciseId: string) => {
    try {
      await includeExercise({ exerciseId });
      await loadExcluded();
    } catch { setExcludedError("Не удалось вернуть упражнение."); }
  };

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleResetProfile = async () => {
    if (resetting) return;
    const confirmed = window.confirm(
      "Сбросить профиль? Мы удалим анкету, расписание, планы тренировок и питания, а также историю."
    );
    if (!confirmed) return;
    try {
      setResetting(true);
      setResetError(null);
      await resetProfileRemote();
      [...LOCAL_RESET_KEYS, NUTRITION_CACHE_KEY].forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
      setSummary(null);
      window.location.replace("/");
    } catch {
      setResetError("Не удалось сбросить профиль. Попробуй ещё раз.");
    } finally {
      setResetting(false);
    }
  };

  // ─── Derived data ───────────────────────────────────────────────────────

  const onb = summary || {};
  const avatarUrl = tgProfile?.photo_url;
  const name = onb?.profile?.name || onb?.name || tgProfile?.first_name || "—";
  const sex = onb?.ageSex?.sex || onb?.sex;
  const age = onb?.ageSex?.age ?? onb?.age;
  const height = onb?.body?.height ?? onb?.height;
  const weight = onb?.body?.weight ?? onb?.weight;
  const experience = onb?.experience;
  const perWeek = onb?.schedule?.perWeek ?? onb?.schedule?.daysPerWeek ?? onb?.daysPerWeek ?? onb?.perWeek;
  const minutes = onb?.schedule?.minutesPerSession ?? onb?.schedule?.minutes ?? onb?.schedule?.sessionMinutes ?? onb?.minutes ?? onb?.minutesPerSession;
  const place = onb?.trainingPlace?.place || onb?.environment?.location;
  const goal = onb?.motivation?.goal || onb?.goals?.primary;
  const workStyle = onb?.lifestyle?.workStyle;
  const dietRestr: string[] = onb?.dietPrefs?.restrictions || [];
  const dietStyles: string[] = onb?.dietPrefs?.styles || [];

  const initials = useMemo(() => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  }, [name]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.outer}>
      <div style={s.inner}>

        {/* ── Hero: User card (dark pill style like StatPill) ── */}
        <div style={s.hero}>
          <div style={s.heroLeft}>
            <div style={s.avatarWrap}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} style={s.avatarImg} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span style={s.avatarText}>{initials}</span>
              )}
            </div>
            <div>
              <div style={s.heroName}>{name}</div>
              <div style={s.heroMeta}>
                {safeNum(age)} лет • {sexRus(sex)}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Редактировать"
            onClick={() => navigate("/onb/age-sex#age-sex")}
            style={s.editBtn}
          >
            <Pencil size={16} strokeWidth={2.2} color="rgba(255,255,255,0.7)" />
          </button>
        </div>

        {/* ── Обо мне ── */}
        <Card>
          <div style={s.sectionHeader}>
            <User size={18} color="#0f172a" strokeWidth={2.5} />
            <span style={s.sectionTitle}>Обо мне</span>
          </div>
          <div style={s.infoGrid}>
            <InfoRow label="Рост" value={safeNum(height, "см")} />
            <InfoRow label="Вес" value={safeNum(weight, "кг")} />
            {workStyle && <InfoRow label="Образ жизни" value={workStyleRus(workStyle)} />}
          </div>
        </Card>

        {/* ── Тренировки ── */}
        <Card>
          <div style={s.sectionHeader}>
            <Dumbbell size={18} color="#0f172a" strokeWidth={2.5} />
            <span style={s.sectionTitle}>Тренировки</span>
          </div>
          <div style={s.infoGrid}>
            <InfoRow label="Цель" value={goalRus(goal)} />
            <InfoRow label="Опыт" value={expRus(experience)} />
            <InfoRow label="Частота" value={safeNum(perWeek, "раз/нед")} />
            <InfoRow label="Длительность" value={safeNum(minutes, "мин")} />
            <InfoRow label="Место" value={placeRus(place)} />
          </div>
        </Card>

        {/* ── Питание ── */}
        {(dietStyles.length > 0 || dietRestr.length > 0) && (
          <Card>
            <div style={s.sectionHeader}>
              <UtensilsCrossed size={18} color="#0f172a" strokeWidth={2.5} />
              <span style={s.sectionTitle}>Питание</span>
            </div>
            <div style={s.infoGrid}>
              {dietStyles.length > 0 && (
                <InfoRow label="Стиль" value={dietStyles.join(", ")} />
              )}
              {dietRestr.length > 0 && (
                <InfoRow label="Ограничения" value={dietRestr.join(", ")} />
              )}
            </div>
          </Card>
        )}

        {/* ── Исключённые упражнения ── */}
        <Card>
          <button
            type="button"
            onClick={() => setExcludedOpen((v) => !v)}
            style={s.accordionBtn}
          >
            <div style={s.sectionHeader}>
              <Search size={18} color="#0f172a" strokeWidth={2.5} />
              <span style={s.sectionTitle}>Исключённые упражнения</span>
            </div>
            {excludedOpen
              ? <ChevronUp size={18} color="rgba(15,23,42,0.5)" strokeWidth={2.5} />
              : <ChevronDown size={18} color="rgba(15,23,42,0.5)" strokeWidth={2.5} />
            }
          </button>
          <span style={s.accordionSub}>
            Упражнения, которые не будут предлагаться в&nbsp;тренировках
          </span>

          {excludedOpen && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {excludedError && (
                <div style={s.errorNote}>{excludedError}</div>
              )}

              <input
                value={searchQ}
                onChange={(e) => void runSearch(e.target.value)}
                placeholder="Найти упражнение…"
                style={s.searchInput}
              />
              {searchLoading && <span style={s.muted}>Поиск…</span>}

              {searchRes.filter((x) => !excluded.some((e) => e.exerciseId === x.exerciseId)).slice(0, 12).map((x) => (
                <div key={x.exerciseId} style={s.exRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.exName}>{x.name}</div>
                  </div>
                  <button type="button" style={s.exBtnAdd} onClick={() => void addExcluded(x.exerciseId)}>
                    Исключить
                  </button>
                </div>
              ))}

              {(excluded.length > 0 || !excludedLoading) && (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={s.subLabel}>Сейчас исключены</span>
                  {excludedLoading ? (
                    <span style={s.muted}>Загружаю…</span>
                  ) : excluded.length === 0 ? (
                    <span style={s.muted}>Пока пусто</span>
                  ) : (
                    excluded.slice(0, 80).map((x) => (
                      <div key={x.exerciseId} style={s.exRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={s.exName}>{x.name}</div>
                        </div>
                        <button type="button" style={s.exBtnRemove} onClick={() => void removeExcluded(x.exerciseId)}>
                          Вернуть
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Сброс профиля ── */}
        <Card style={s.resetCard}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>Сбросить профиль</span>
          </div>
          <p style={s.resetText}>
            Удалим анкету, планы питания и тренировок, расписание и историю. Вернёшься на стартовый экран.
          </p>
          {resetError && <div style={s.errorNote}>{resetError}</div>}
          <button
            type="button"
            style={{ ...s.resetBtn, opacity: resetting ? 0.5 : 1 }}
            onClick={handleResetProfile}
            disabled={resetting}
          >
            {resetting ? "Сбрасываю…" : "Сбросить профиль"}
          </button>
        </Card>

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

// ─── Styles (consistent with Progress screen) ───────────────────────────────

const s: Record<string, CSSProperties> = {
  outer: {
    minHeight: "100vh", width: "100%", padding: "16px 16px 0",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  },
  inner: {
    maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12,
    paddingTop: "calc(env(safe-area-inset-top,0px) + 6px)",
  },

  // Card — same as Progress
  card: {
    borderRadius: 24, padding: 18,
    background: "linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
  },

  // Hero — dark pill like StatPill
  hero: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderRadius: 24, padding: "14px 18px",
    background: FILL_BG,
    boxShadow: "0 16px 32px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.08)",
  },
  heroLeft: { display: "flex", alignItems: "center", gap: 14 },
  avatarWrap: {
    width: 48, height: 48, borderRadius: 999, flexShrink: 0,
    background: "rgba(255,255,255,0.12)",
    boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.18)",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: 48, height: 48, borderRadius: 999, objectFit: "cover" as const,
    display: "block",
  },
  avatarText: { fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.85)" },
  heroName: { fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.2 },
  heroMeta: { fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  editBtn: {
    border: "none", background: "rgba(255,255,255,0.08)", cursor: "pointer",
    width: 34, height: 34, borderRadius: 999,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  // Section header — same as Progress section titles
  sectionHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 },

  // Info rows
  infoGrid: { display: "grid", gap: 0 },
  infoRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid rgba(15,23,42,0.06)",
  },
  infoLabel: { fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)" },
  infoValue: { fontSize: 14, fontWeight: 500, color: "#1e1f22", textAlign: "right" as const },

  // Accordion
  accordionBtn: {
    width: "100%", border: "none", background: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: 0, marginBottom: 0,
  },
  accordionSub: {
    fontSize: 13, fontWeight: 400, color: "rgba(15,23,42,0.5)", lineHeight: 1.4,
    marginTop: -4,
  },

  // Excluded exercises
  searchInput: {
    width: "100%", padding: "10px 14px", borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.6)",
    fontSize: 14, fontWeight: 500, outline: "none",
    fontFamily: "inherit",
  },
  exRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    padding: "10px 12px", borderRadius: 14,
    background: "rgba(15,23,42,0.03)",
    border: "1px solid rgba(15,23,42,0.06)",
  },
  exName: { fontSize: 14, fontWeight: 500, color: "#1e1f22" },
  exBtnAdd: {
    border: "none", borderRadius: 12, padding: "8px 12px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
    background: FILL_BG, color: "rgba(255,255,255,0.9)",
    boxShadow: FILL_SHADOW,
  },
  exBtnRemove: {
    border: "1px solid rgba(15,23,42,0.12)", borderRadius: 12,
    padding: "8px 12px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", flexShrink: 0,
    background: "rgba(15,23,42,0.03)", color: "#1e1f22",
  },
  subLabel: { fontSize: 13, fontWeight: 600, color: "rgba(15,23,42,0.5)", marginTop: 4 },
  muted: { fontSize: 13, fontWeight: 400, color: "rgba(15,23,42,0.45)" },

  // Error
  errorNote: {
    padding: "10px 12px", borderRadius: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
    color: "#b91c1c", fontSize: 13, fontWeight: 500,
  },

  // Reset section
  resetCard: {
    background: "linear-gradient(180deg, rgba(255,240,240,0.95) 0%, rgba(255,230,230,0.92) 100%)",
    border: "1px solid rgba(239,68,68,0.12)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
  },
  resetText: {
    margin: "-4px 0 0", fontSize: 14, fontWeight: 400,
    color: "rgba(15,23,42,0.62)", lineHeight: 1.5,
  },
  resetBtn: {
    border: "none", borderRadius: 14, padding: "12px 18px",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    background: "rgba(239,68,68,0.12)", color: "#b91c1c",
    transition: "opacity 0.2s ease",
    marginTop: 4,
  },
};
