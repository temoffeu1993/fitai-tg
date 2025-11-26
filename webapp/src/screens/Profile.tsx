// webapp/src/screens/Profile.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/apiClient";
import { resetProfileRemote } from "@/api/profile";
import { NUTRITION_CACHE_KEY } from "@/hooks/useNutritionPlan";

type Summary = any;

const PLAN_CACHE_KEY = "plan_cache_v2";
const HISTORY_KEY = "history_sessions_v1";
const LOCAL_RESET_KEYS = [
  "onb_summary",
  "onb_feedback",
  "onb_feedback_pending",
  "onb",
  "onboarding_done",
  "onb_complete",
  "onb_history",
  PLAN_CACHE_KEY,
  HISTORY_KEY,
  "current_plan",
  "session_draft",
  "planned_workout_id",
];

// мини-спиннер для загрузки комментария
function MiniSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 50 50" aria-hidden>
      <circle cx="25" cy="25" r="20" stroke="#8a64ff" strokeWidth="5" fill="none" opacity="0.25" />
      <circle cx="25" cy="25" r="20" stroke="#6a8dff" strokeWidth="5" fill="none" strokeLinecap="round"
        strokeDasharray="110" strokeDashoffset="80">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
}

export default function Profile() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    expTime: false,
    locEq: false,
    healthDiet: false,
    life: false,
    mot: false,
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [tgProfile, setTgProfile] = useState<any>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("onb_summary");
    if (raw) {
      try { setSummary(JSON.parse(raw)); } catch { setSummary(null); }
    }
    setLoaded(true);
  }, []);

  // Ленивый фетч комментария ИИ
  useEffect(() => {
    if (!feedback && summary) {
      (async () => {
        try {
          setLoadingFeedback(true);
          const resp = await apiFetch("/onboarding/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ data: summary }),
          });
          if (resp.ok) {
            const { feedback: text } = await resp.json();
            setFeedback(text || null);
            if (text) {
              localStorage.setItem("onb_feedback", text);
              localStorage.removeItem("onb_feedback_pending");
            }
          }
        } catch (e) {
          console.error("feedback fetch error", e);
        } finally {
          setLoadingFeedback(false);
        }
      })();
    }
  }, [feedback, summary]);

  // автообновление без перезагрузки
  function readAll() {
    try {
      const raw = localStorage.getItem("onb_summary");
      setSummary(raw ? JSON.parse(raw) : null);
    } catch { setSummary(null); }

    try {
      const rawProfile = localStorage.getItem("profile");
      setTgProfile(rawProfile ? JSON.parse(rawProfile) : null);
    } catch {
      setTgProfile(null);
    }

    const pending = localStorage.getItem("onb_feedback_pending") === "1";
    const fb = localStorage.getItem("onb_feedback");
    if (pending) {
      setFeedback(null);
      setLoadingFeedback(true);
    } else if (fb) {
      setFeedback(fb);
      setLoadingFeedback(false);
    } else {
      setLoadingFeedback(true);
    }
  }

  useEffect(() => {
    readAll();
    setLoaded(true);

    let tries = 0;
    const t = setInterval(() => {
      const fb = localStorage.getItem("onb_feedback");
      if (fb) {
        setFeedback(fb);
        setLoadingFeedback(false);
        localStorage.removeItem("onb_feedback_pending");
        clearInterval(t);
      } else if (++tries > 30) {
        setLoadingFeedback(false);
        clearInterval(t);
      }
    }, 500);

    const onFocus = () => readAll();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const onb = summary || {};
  const avatarUrl = tgProfile?.photo_url;
  const name = onb?.profile?.name || tgProfile?.first_name || "—";
  const sex =
    onb?.ageSex?.sex === "male" ? "Муж" :
    onb?.ageSex?.sex === "female" ? "Жен" : "—";
  const age = safeNum(onb?.ageSex?.age);
  const height = safeNum(onb?.body?.height, "см");
  const weight = safeNum(onb?.body?.weight, "кг");

  const expText = expRus(onb.experience);
  const perWeek = onb?.schedule?.perWeek ?? onb?.schedule?.daysPerWeek;

  const equipmentText = equipmentSummary(onb.environment, onb.equipmentItems ?? onb.equipment);
  const motives: string[] = onb?.motivation?.motives || [];
  const dietRestr: string[] = onb?.dietPrefs?.restrictions || [];
  const dietStyles: string[] = onb?.dietPrefs?.styles || [];

  function gotoEdit(anchor: string) {
    navigate(`/onb/age-sex#${anchor}`);
  }
  function toggle(id: keyof typeof open) {
    setOpen((s) => ({ ...s, [id]: !s[id] }));
  }

  function clearLocalProfileState() {
    const keys = [...LOCAL_RESET_KEYS, NUTRITION_CACHE_KEY];
    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });
  }

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
      clearLocalProfileState();
      setSummary(null);
      setFeedback(null);
      window.location.replace("/");
    } catch (err) {
      console.error("reset profile error", err);
      setResetError("Не удалось сбросить профиль. Попробуй ещё раз.");
    } finally {
      setResetting(false);
    }
  };

  const initials = useMemo(() => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "👤";
    const letters = (parts[0][0] || "") + (parts[1]?.[0] || "");
    return letters.toUpperCase();
  }, [name]);

  const today = useMemo(() =>
    new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }),
  []);

  return (
    <div style={st.page}>
      {/* HERO в чёрном стиле приложения */}
      <section style={st.userCard}>
        <div style={st.heroHeader}>
          <span style={st.pillDark}>{today}</span>
          <IconButton
            label="Редактировать личные данные"
            onClick={() => gotoEdit("age-sex")}
          />
        </div>

        <div style={st.userTopRow}>
          <div style={st.userLeft}>
            <div style={st.avatarWrap}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  style={st.avatarImg}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div style={st.avatarCircle}>
                  <span style={st.avatarText}>{initials}</span>
                </div>
              )}
            </div>
            <div style={st.userMain}>
              <div style={st.userName}>{name}</div>
              <div style={st.userMeta}>
                <Meta title="Возраст" value={age} />
                <Dot />
                <Meta title="Пол" value={sex} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ЧИПЫ РОСТ/ВЕС ПОД ВЕРХНИМ БЛОКОМ + СМАЙЛИКИ */}
      <section style={st.statsRow}>
        <div style={st.chipSquare}>
          <div style={st.chipEmoji}>📏</div>
          <div style={st.chipLabel}>Рост</div>
          <div style={st.chipValue}>{height}</div>
        </div>
        <div style={st.chipSquare}>
          <div style={st.chipEmoji}>⚖️</div>
          <div style={st.chipLabel}>Вес</div>
          <div style={st.chipValue}>{weight}</div>
        </div>
      </section>

      {!loaded ? (
        <Skeleton />
      ) : (
        <>
          {/* Комментарий тренера — белый стеклянный блок как фирменные чипы */}
          {(feedback || loadingFeedback) && (
            <section style={st.glassBlock}>
              <div style={st.blockTitle}>Комментарий тренера 🤖💬</div>
              {loadingFeedback ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, ...st.feedbackText, fontSize: 12 }}>
                  <MiniSpinner />
                  <span>Готовлю комментарий…</span>
                </div>
              ) : (
                <div style={{ ...st.feedbackText, fontSize: 12 }}>{feedback}</div>
              )}
            </section>
          )}

          {/* Все нижние блоки — стеклянные. Внутри строки тоже стеклянные. */}
          <Accordion
            title="⏱️ Опыт и режим"
            open={open.expTime}
            onToggle={() => toggle("expTime")}
          >
            <Grid>
              <RowSmall k="Опыт" v={expText} />
              <RowSmall k="Частота тренировок" v={safeNum(perWeek, "раз/нед")} />
            </Grid>
          </Accordion>

          <Accordion
            title="🏋️ Локация и оборудование"
            open={open.locEq}
            onToggle={() => toggle("locEq")}
          >
            <Grid>
              <RowSmall
                k="Локация"
                v={onb?.environment?.location ? locRus(onb.environment.location) : "—"}
              />
              <RowSmall k="Оборудование" v={equipmentText} />
            </Grid>
          </Accordion>

          <Accordion
            title="🍽️ Здоровье и питание"
            open={open.healthDiet}
            onToggle={() => toggle("healthDiet")}
          >
            <Grid>
              <RowSmall k="Ограничения по здоровью" v={noneOrList(onb?.health?.limits)} />
              <RowSmall k="Непереносимости" v={<ChipList items={dietRestr} empty="нет" />} />
              <RowSmall k="Стиль питания" v={<ChipList items={dietStyles} empty="—" />} />
              <RowSmall k="Бюджет" v={budgetRus(onb?.dietPrefs?.budgetLevel)} />
            </Grid>
          </Accordion>

          <Accordion
            title="💤 Образ жизни"
            open={open.life}
            onToggle={() => toggle("life")}
          >
            <Grid>
              <RowSmall k="Подвижность" v={activityRus(onb?.lifestyle)} />
              <RowSmall k="Сон" v={safeNum(onb?.lifestyle?.sleep, "ч")} />
              <RowSmall k="Стресс" v={stressRus(onb?.lifestyle?.stress)} />
            </Grid>
          </Accordion>

          <Accordion
            title="🎯 Мотивация и цель"
            open={open.mot}
            onToggle={() => toggle("mot")}
          >
            <Grid>
              <RowSmall k="Мотивация" v={<ChipList items={motives.map(motiveRus)} empty="—" />} />
              <RowSmall
                k="Цель"
                v={onb?.motivation?.goalCustom || goalRus(onb?.motivation?.goal) || "—"}
              />
            </Grid>
          </Accordion>

          <section style={st.resetCard}>
            <div style={st.resetTitle}>Сбросить профиль</div>
            <p style={st.resetText}>
              Удалим анкету, планы питания и тренировок, расписание и историю. Вернёшься на стартовый экран.
            </p>
            {resetError && <div style={st.resetError}>{resetError}</div>}
            <button
              type="button"
              style={{ ...st.resetBtn, opacity: resetting ? 0.6 : 1 }}
              onClick={handleResetProfile}
              disabled={resetting}
            >
              {resetting ? "Сбрасываю…" : "Сбросить профиль"}
            </button>
          </section>

          <div style={{ height: 16 }} />
        </>
      )}
    </div>
  );
}

/* ---------- UI atoms ---------- */
function Meta({ title, value }: { title: string; value: string }) {
  return (
    <span style={st.metaItem}>
      <span style={st.metaTitle}>{title}</span>
      <span style={st.metaValue}>{value}</span>
    </span>
  );
}
function Dot() { return <span style={{ margin: "0 8px", opacity: 0.5 }}>•</span>; }
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={st.stat}>
      <div style={st.statLabel}>{label}</div>
      <div style={st.statValue}>{value}</div>
    </div>
  );
}
function Divider() { return <div style={st.statDivider} />; }

function IconButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} style={st.iconBtn}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="currentColor" strokeWidth="1.6" fill="currentColor" />
        <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
      </svg>
    </button>
  );
}

/* ---------- Accordion ---------- */
function Accordion({
  title, open, onToggle, children,
}: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode; }) {
  return (
    <section style={st.glassBlock}>
      <button style={st.accordionHeader} onClick={onToggle}>
        <span style={st.blockTitleSmall}>{title}</span>
        <span style={st.accordionChevron} aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

/* ---------- Common atoms ---------- */
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={st.grid}>{children}</div>;
}
function RowSmall({ k, v }: { k: string; v: any }) {
  return (
    <div style={st.rowGlass}>
      <div style={st.keySmall}>{k}</div>
      <div style={st.valSmall}>{isEmpty(v) ? "—" : v}</div>
    </div>
  );
}
function ChipList({ items, empty }: { items: string[]; empty?: string }) {
  if (!items?.length) return <span>{empty ?? "—"}</span>;
  return (
    <div style={st.chips}>
      {items.map((x, i) => (
        <span key={i} style={st.chip}>{x}</span>
      ))}
    </div>
  );
}
function Skeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ ...st.glassBlock, paddingBottom: 18 }}>
          <div style={{ ...shimmer, width: 160, height: 18, borderRadius: 6 }} />
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} style={st.rowGlass}>
                <div style={{ ...shimmer, width: 140, height: 14, borderRadius: 6 }} />
                <div style={{ ...shimmer, width: 220, height: 14, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------- helpers ---------- */
function isEmpty(v: any) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}
function toValue(x: any, suffix?: string) {
  if (x === null || x === undefined || x === "") return "—";
  return suffix ? `${x} ${suffix}` : String(x);
}
function listOrDash(v: any) {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
function noneOrList(v: any) {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "нет";
  if (v === null || v === undefined || v === "" || v === false) return "нет";
  return String(v);
}
function safeNum(x: any, suffix?: string) {
  if (x === null || x === undefined || x === "") return "—";
  const n = Number(x);
  if (Number.isFinite(n)) return suffix ? `${n} ${suffix}` : String(n);
  return suffix ? `${x} ${suffix}` : String(x);
}
function boolRus(b: any) {
  if (typeof b !== "boolean") return "—";
  return b ? "да" : "нет";
}
function locRus(l?: string) {
  if (!l) return "—";
  if (l === "gym") return "зал";
  if (l === "home") return "дом";
  if (l === "outdoor") return "улица";
  return l;
}
function budgetRus(b?: string) {
  if (!b) return "—";
  const map: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };
  return map[b] || b;
}
function goalRus(g?: string) {
  if (!g) return "";
  const map: Record<string, string> = {
    fat_loss: "сжигание жира",
    muscle_gain: "набор мышц",
    maintenance: "поддержание",
    event_prep: "под мероприятие",
    custom: "другое",
  };
  return map[g] || g;
}
function expRus(e: any) {
  const v = typeof e === "string" ? e : e?.level;
  const map: Record<string, string> = {
    beginner: "новичок",
    intermediate: "средний",
    advanced: "продвинутый",
  };
  return map[String(v || "")] || v || "—";
}
function stressRus(s?: string) {
  if (!s) return "—";
  const map: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };
  return map[s] || s;
}
function motiveRus(m?: string) {
  if (!m) return "—";
  const map: Record<string, string> = {
    health: "здоровье",
    appearance: "внешний вид",
    performance: "производительность",
    energy: "энергия",
    habit: "привычка",
    stress: "снижение стресса",
    rehabilitation: "реабилитация",
    weight_loss: "похудение",
    weight_gain: "набор веса",
    strength: "сила",
    endurance: "выносливость",
    flexibility: "гибкость",
  };
  return map[m] || m;
}
function activityRus(lifestyle: any) {
  const v =
    lifestyle?.activity ??
    lifestyle?.activityLevel ??
    lifestyle?.workStyle ??
    lifestyle?.mobility ??
    lifestyle?.stepsPerDay ??
    null;
  if (v == null || v === "") return "—";
  const s = String(v).toLowerCase();
  const map: Record<string, string> = {
    sedentary: "сидячий",
    light: "низкая",
    lightly_active: "низкая",
    moderate: "средняя",
    moderately_active: "средняя",
    active: "высокая",
    very_active: "очень высокая",
  };
  if (!Number.isNaN(Number(s))) return `${s} шагов/день`;
  return map[s] || v;
}

function equipmentSummary(env?: { location?: string; bodyweightOnly?: boolean }, legacy?: any): string {
  const legacyList = Array.isArray(legacy) ? legacy.filter(Boolean) : [];
  if (legacyList.length) {
    return legacyList.map(eqRus).join(", ");
  }
  if (!env) return "—";
  if (env.bodyweightOnly) return "Только вес собственного тела";
  const loc = env.location || "";
  if (loc === "gym") return "Полностью оборудованный зал";
  if (loc === "home") return "Домашние условия с базовым инвентарём";
  if (loc === "outdoor") return "Уличная площадка";
  return "—";
}

// Русификация оборудования
function eqRus(x: string) {
  const m: Record<string, string> = {
    bodyweight: "только вес тела",
    dumbbell: "гантели", dumbbells: "гантели",
    barbell: "штанга",
    kettlebell: "гиря",
    bands: "резинки",
    trx: "TRX",
    bench: "скамья",
    mat: "коврик",
  };
  return m[(x || "").toLowerCase()] || x;
}

/* ---------- styles ---------- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const SCHEDULE_BTN_GRADIENT = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
background:"transparent",
    minHeight: "100vh",
  },

  // HERO в чёрном стиле
  userCard: {
    position: "relative",
    borderRadius: 22,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#050505",
    color: "#fff",
    padding: 18,
    overflow: "hidden",
  },
  heroHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pillDark: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(4px)",
    textTransform: "capitalize",
  },

  userTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userLeft: { display: "flex", alignItems: "center", gap: 12 },
  avatarWrap: { flex: "0 0 auto" },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "rgba(255,255,255,.10)",
    display: "grid",
    placeItems: "center",
    boxShadow: "inset 0 0 0 2px rgba(255,255,255,.15)",
    backdropFilter: "blur(6px)",
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid rgba(255,255,255,.22)",
    boxShadow: "0 6px 18px rgba(0,0,0,.25)",
    display: "block",
  },
  avatarText: { fontSize: 18, fontWeight: 800, color: "#fff" },
  userMain: { display: "flex", flexDirection: "column" },
  userName: { fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: "#fff" },
  userMeta: { marginTop: 4, opacity: 0.95, display: "flex", alignItems: "center", color: "rgba(255,255,255,.9)" },
  metaItem: { display: "inline-flex", gap: 6, alignItems: "baseline" },
  metaTitle: { fontSize: 12, opacity: 0.9 },
  metaValue: { fontSize: 13, fontWeight: 700 },

  iconBtn: {
    border: "none",
    background: "transparent",
    color: "#fff",
    padding: 6,
    cursor: "pointer",
    lineHeight: 0,
  },

  /* Чипы под героем */
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(96px, 1fr))",
    gap: 12,
    margin: "12px 0 10px",
  },
  chipSquare: {
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: "10px 8px",
    minHeight: 96,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    gap: 4,
    wordBreak: "break-word",
    whiteSpace: "normal",
    hyphens: "none",
  },
  chipEmoji: { fontSize: 20, lineHeight: 1 },
  chipLabel: { fontSize: 11, color: "rgba(0,0,0,.75)" },
  chipValue: { fontSize: 18, fontWeight: 800, color: "#111" },

  // Базовый блок
  block: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },

  // Белая стеклянная поверхность как фирменные чипы
  glassBlock: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },

  accordionHeader: {
    width: "100%",
    background: "transparent",
    border: "none",
    padding: "6px 2px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
  },
  accordionChevron: { fontSize: 14, color: "#111" },
  blockTitleSmall: { margin: 0, fontSize: 14, fontWeight: 800 },

  grid: { marginTop: 6, display: "grid", gap: 8 },

  // Стеклянные строки внутри аккордеонов
  rowGlass: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(0,0,0,.06)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  keySmall: { color: "#6B7280", minWidth: 140, fontSize: 12 },
  valSmall: { fontWeight: 600, wordBreak: "break-word", textAlign: "right", flex: 1, fontSize: 13 },

  chips: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  chip: {
    background: "transparent",
    color: "#111827",
    padding: 0,
    borderRadius: 0,
    fontSize: 13,
    fontWeight: 500,
  },
  resetCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    background: "linear-gradient(135deg, rgba(255,255,255,.8), rgba(255,221,214,.85))",
    border: "1px solid rgba(0,0,0,.06)",
    boxShadow: "0 12px 28px rgba(0,0,0,.12)",
    display: "grid",
    gap: 10,
  },
  resetTitle: { fontWeight: 800, fontSize: 16, color: "#1b1b1b" },
  resetText: { margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.4 },
  resetError: {
    padding: "8px 10px",
    borderRadius: 10,
    background: "rgba(255,102,102,.12)",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 600,
  },
  resetBtn: {
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
    cursor: "pointer",
    transition: "opacity 0.2s ease",
  },

  stat: {
    flex: 1,
    background: "rgba(255,255,255,.15)",
    border: "1px solid rgba(255,255,255,.25)",
    borderRadius: 14,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backdropFilter: "blur(6px)",
  },
  statDivider: { width: 0, borderLeft: "1px solid rgba(255,255,255,.35)" },
  statLabel: { fontSize: 12, opacity: 0.9 },
  statValue: { fontSize: 16, fontWeight: 800 },

  blockTitle: { fontWeight: 800, marginBottom: 6 },
  feedbackText: { whiteSpace: "pre-wrap" },
};

const shimmer: React.CSSProperties = {
  background:
    "linear-gradient(110deg, rgba(0,0,0,0.06) 8%, rgba(0,0,0,0.12) 18%, rgba(0,0,0,0.06) 33%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.1s linear infinite",
};
