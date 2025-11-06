import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/apiClient";

type Summary = any;

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
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("onb_summary");
    if (raw) {
      try { setSummary(JSON.parse(raw)); } catch { setSummary(null); }
    }
    setLoaded(true);
  }, []);

  // УДАЛЕНО: ранний useEffect, который отдельно читал onb_feedback

  // Ленивый фетч комментария ИИ, если его нет, но есть summary
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

  // >>> Новые утилита и эффект для автообновления без перезагрузки
  function readAll() {
    try {
      const raw = localStorage.getItem("onb_summary");
      setSummary(raw ? JSON.parse(raw) : null);
    } catch { setSummary(null); }

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

    // короткий опрос локального фидбека, чтобы поймать фоновую запись
    let tries = 0;
    const t = setInterval(() => {
      const fb = localStorage.getItem("onb_feedback");
      if (fb) {
        setFeedback(fb);
        setLoadingFeedback(false);
        localStorage.removeItem("onb_feedback_pending");
        clearInterval(t);
      } else if (++tries > 30) { // ~15 сек
        setLoadingFeedback(false);
        clearInterval(t);
      }
    }, 500);

    // обновлять при возврате на вкладку
    const onFocus = () => readAll();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  // <<<

  const onb = summary || {};
  const name = onb?.profile?.name || "—";
  const sex =
    onb?.ageSex?.sex === "male" ? "Муж" :
    onb?.ageSex?.sex === "female" ? "Жен" : "—";
  const age = safeNum(onb?.ageSex?.age);
  const height = safeNum(onb?.body?.height, "см");
  const weight = safeNum(onb?.body?.weight, "кг");

  const expText = expRus(onb.experience);

  // Частота и длительность: поддерживаем оба варианта ключей
  const perWeek = onb?.schedule?.perWeek ?? onb?.schedule?.daysPerWeek;
  const minutes =
    onb?.schedule?.minutesPerSession ??
    onb?.schedule?.minutes ??
    onb?.schedule?.duration;

  const equipmentList: string[] =
    Array.isArray(onb.equipmentItems)
      ? onb.equipmentItems
      : Array.isArray(onb.equipment)
      ? onb.equipment
      : [];
  const equipmentText =
    equipmentList.length
      ? null
      : onb.environment?.bodyweightOnly
      ? "только вес тела"
      : "—";

  const motives: string[] = onb?.motivation?.motives || [];
  const dietRestr: string[] = onb?.dietPrefs?.restrictions || [];
  const dietStyles: string[] = onb?.dietPrefs?.styles || [];

  function gotoEdit(anchor: string) {
    navigate(`/onb/age-sex#${anchor}`);
  }
  function toggle(id: keyof typeof open) {
    setOpen((s) => ({ ...s, [id]: !s[id] }));
  }

  const initials = useMemo(() => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "👤";
    const letters = (parts[0][0] || "") + (parts[1]?.[0] || "");
    return letters.toUpperCase();
  }, [name]);

  return (
    <div style={st.page}>
      {/* USER CARD */}
      <section style={st.userCard}>
        <IconButton
          label="Редактировать личные данные"
          onClick={() => gotoEdit("age-sex")}
        />

        <div style={st.userTopRow}>
          <div style={st.userLeft}>
            <div style={st.avatarWrap}>
              <div style={st.avatarCircle}>
                <span style={st.avatarText}>{initials}</span>
              </div>
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

        <div style={st.userStats}>
          <Stat label="Рост" value={height} />
          <Divider />
          <Stat label="Вес" value={weight} />
        </div>
      </section>

      {!loaded ? (
        <Skeleton />
      ) : (
        <>
          {/* Комментарий тренера — мелкий шрифт + спиннер при загрузке */}
          {(feedback || loadingFeedback) && (
            <section style={st.feedbackBox}>
              <div style={st.feedbackTitle}>Комментарий тренера🤖💬</div>
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

          <Accordion
            title="⏱️ Опыт и время"
            open={open.expTime}
            onToggle={() => toggle("expTime")}
          >
            <Grid>
              <RowSmall k="Опыт" v={expText} />
              <RowSmall k="Частота тренировок" v={safeNum(perWeek, "раз/нед")} />
              <RowSmall k="Длительность тренировки" v={safeNum(minutes, "мин")} />
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
              <RowSmall
                k="Оборудование"
                v={equipmentText ?? <ChipList items={equipmentList.map(eqRus)} empty="—" />}
              />
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
              <RowSmall k="Маленькая победа" v={onb?.motivation?.victory3m || "—"} />
            </Grid>
          </Accordion>

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
    <section style={st.block}>
      <button style={st.accordionHeader} onClick={onToggle}>
        <span style={st.blockTitleSmall}>{title}</span>
        <span style={st.accordionChevron} aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </section>
  );
}

/* ---------- Common atoms ---------- */
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={st.grid}>{children}</div>;
}
function RowSmall({ k, v }: { k: string; v: any }) {
  return (
    <div style={st.row}>
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
        <div key={i} style={{ ...st.block, paddingBottom: 18 }}>
          <div style={{ ...shimmer, width: 160, height: 18, borderRadius: 6 }} />
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} style={st.row}>
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
const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
    background: "#fff",
  },

  userCard: {
    position: "relative",
    borderRadius: 20,
    boxShadow: cardShadow,
    background:
      "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    padding: 16,
  },
  userTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between", // FIX
  },
  userLeft: { display: "flex", alignItems: "center", gap: 12 },
  avatarWrap: { flex: "0 0 auto" },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "rgba(255,255,255,.22)",
    display: "grid",
    placeItems: "center",
    boxShadow: "inset 0 0 0 2px rgba(255,255,255,.25)",
    backdropFilter: "blur(6px)",
  },
  avatarText: { fontSize: 18, fontWeight: 800, color: "#fff" },
  userMain: { display: "flex", flexDirection: "column" },
  userName: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  userMeta: { marginTop: 4, opacity: 0.95, display: "flex", alignItems: "center" },
  metaItem: { display: "inline-flex", gap: 6, alignItems: "baseline" },
  metaTitle: { fontSize: 12, opacity: 0.9 },
  metaValue: { fontSize: 13, fontWeight: 700 },

  iconBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    border: "none",
    background: "transparent",
    color: "#fff",
    padding: 6,
    cursor: "pointer",
    lineHeight: 0,
  },

  userStats: {
    marginTop: 12,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 12,
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

  block: {
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
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

  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #F3F4F6",
    gap: 12,
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

  feedbackBox: {
    marginTop: 16,
    padding: 14,
    background: "#f6f7fb",
    borderRadius: 14,
    fontSize: 15,
    lineHeight: 1.5,
    color: "#111",
  },
  feedbackTitle: { fontWeight: 800, marginBottom: 6 },
  feedbackText: { whiteSpace: "pre-wrap" },
};

const shimmer: React.CSSProperties = {
  background:
    "linear-gradient(110deg, rgba(0,0,0,0.06) 8%, rgba(0,0,0,0.12) 18%, rgba(0,0,0,0.06) 33%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.1s linear infinite",
};
