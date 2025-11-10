// webapp/src/screens/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";

import robotImg from "../assets/robot.png";
const ROBOT_SRC = robotImg;

function resolveName() {
  try {
    const onbRaw = localStorage.getItem("onb_summary");
    if (onbRaw) {
      const onb = JSON.parse(onbRaw);
      const n = onb?.profile?.name;
      if (typeof n === "string" && n.trim()) return n.trim();
    }
  } catch {}
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "null");
    if (p?.first_name) return String(p.first_name);
    if (p?.username) return String(p.username);
  } catch {}
  return "Гость";
}

function hasOnb() {
  try {
    return !!JSON.parse(localStorage.getItem("onb_summary") || "null");
  } catch {
    return false;
  }
}
function isFirstWelcome() {
  return !localStorage.getItem("welcome_seen_v1");
}

function TypeWriter({
  text,
  speed = 25,
  onDone,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
}) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setI(text.length);
      setDone(true);
      onDone?.();
      return;
    }
    const id = setInterval(() => {
      setI((v) => {
        if (v >= text.length) {
          clearInterval(id);
          setDone(true);
          onDone?.();
          return v;
        }
        return v + 1;
      });
    }, speed + Math.random() * 60);
    return () => clearInterval(id);
  }, [text, speed, onDone]);

  return (
    <p
      style={s.blockText}
      onClick={() => {
        setI(text.length);
        setDone(true);
        onDone?.();
      }}
    >
      {text.slice(0, i)}
      {!done && <span className="caret">|</span>}
    </p>
  );
}

export default function Dashboard() {
  const [name, setName] = useState("Гость");
  const { chips } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const update = () => setName(resolveName());
    update();
    window.addEventListener("focus", update);
    const onOnbUpdated = () => update();
    window.addEventListener("onb_updated" as any, onOnbUpdated);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("onb_updated" as any, onOnbUpdated);
    };
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  const onbDone = hasOnb();

  return (
    <div style={s.page}>
      <style>{`
        .caret { margin-left: 2px; opacity: 1; animation: caretBlink 1s step-end infinite; }
        @keyframes caretBlink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .caret { animation: none } }

        /* ===== iPhone 14/15 Pro и узкие экраны ===== */
        @media (max-width: 420px) {
          .heroCard {
            /* стандартный отступ от края экрана + компактная карточка */
            padding: calc(env(safe-area-inset-top, 0px) + 8px) 14px 12px 14px;
            min-height: 280px;             /* уменьшили высоту блока */
            border-radius: 22px;
          }
          .heroHeaderPill {
            font-size: 12px;
            padding: 6px 10px;
          }
          .heroTitle {
            font-size: clamp(22px, 6vw, 28px);
            line-height: 1.12;
            margin-top: 4px;
          }
          .heroSubtitle {
            font-size: clamp(13px, 3.4vw, 15px);
            line-height: 1.3;
            margin-top: 4px;
          }
          .heroCTA {
            margin-top: 12px;
            padding: 14px 16px;
            font-size: 16px;
            border-radius: 14px;
          }

          /* Компоновка: контент ~56%, зона под робота ~44% */
          .heroGrid {
            display: grid;
            grid-template-columns: 56% 44%;
            align-items: start;
            gap: 8px;
            position: relative;
            z-index: 3;
            margin-top: 0;
          }
          .heroContent {
            width: auto !important;
            max-width: none !important;
          }

          /* Робот — оставили исходный размер */
          .robotWrap {
            position: relative;
            height: 0;
            padding-bottom: 88%;           /* как было */
            overflow: visible;
          }
          .robot {
            position: absolute;
            right: -8%;
            bottom: -6%;
            width: 120%;
            max-width: none;
            pointer-events: none;
          }

          /* Подрезаем только низ, чтобы карточка была ниже, а робот — прежний */
          .heroClip {
            position: absolute;
            inset: -120px -10% -1px -10%;
            overflow-x: visible;
            overflow-y: hidden;
            border-bottom-left-radius: 22px;
            border-bottom-right-radius: 22px;
            z-index: 2;
          }
        }

        /* ===== Планшеты и десктопы (ваша прежняя логика) ===== */
        @media (min-width: 421px) {
          .heroContent { width: min(420px, 50%) !important; max-width: 50% !important; }
          .heroRightSpacer { flex: 0 0 50% !important; max-width: 50% !important; }
          .robot { width: 520px; right: 8%; }
          .heroClip {
            position: absolute;
            left: -12%;
            right: -12%;
            top: -160px;
            height: calc(100% + 160px);
            pointerEvents: none;
            border-bottom-left-radius: 20px;
            border-bottom-right-radius: 20px;
            overflow-y: hidden;
            overflow-x: visible;
            z-index: 2;
          }
        }
      `}</style>

      {/* HERO */}
      <section style={s.heroWrap}>
        <div className="heroCard" style={s.heroCard}>
          <div style={s.heroHeader}>
            <span className="heroHeaderPill" style={s.pillDark}>{today}</span>
            <span />
          </div>

          <div className="heroGrid" style={s.heroBody}>
            <div className="heroContent" style={s.heroContent}>
              <div className="heroTitle" style={s.heroTitle}>Привет, {name}</div>
              <div className="heroSubtitle" style={s.heroSubtitle}>Я твой персональный ИИ фитнес тренер</div>
              <button
                className="heroCTA"
                style={s.ctaGenerate}
                onClick={() => navigate("/plan/one")}
              >
                Новая тренировка
              </button>
            </div>

            <div className="heroRightSpacer" style={s.heroRightSpacer}>
              <div className="robotWrap" />
            </div>
          </div>

          <div className="heroClip" style={s.heroClip}>
            <img
              src={ROBOT_SRC}
              alt="ИИ-тренер"
              className="robot"
              style={s.robot}
              draggable={false}
            />
          </div>
        </div>
      </section>

      {/* Чипы: одинаковый размер */}
      <section style={s.statsRow}>
        <ChipStatSquare emoji="🔥" label="Ккал/трен." value={chips.kcal ? String(chips.kcal) : "—"} />
        <ChipStatSquare emoji="🕒" label="Время" value={chips.minutes ? `${chips.minutes} мин` : "—"} />
        <ChipStatSquare emoji="🏋️" label="Сеты" value={chips.sets ? String(chips.sets) : "—"} />
      </section>

      {/* Твой ИИ-тренер */}
      <section style={{ ...s.block, ...s.chipSurface }}>
        {onbDone ? (
          <>
            <h3 style={s.blockTitle}>Умные тренировки 🧠</h3>
            <p style={s.blockText}>
              Я делаею каждую тренировку эффективной и составляю план питания с учётом твоей цели, опыта и данных
            </p>
            <button
              style={{
                ...s.primaryBtn,
                background: "rgba(255,255,255,0.5)",
                color: "#000",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
              onClick={() => navigate("/onb/age-sex")}
            >
              Редактировать данные
            </button>
          </>
        ) : (
          <>
            <h3 style={s.blockTitle}>Добро пожаловать 👋</h3>
            {isFirstWelcome() ? (
              <TypeWriter
                text="Я персональный ИИ-тренер. Помогу настроить тренировки и питание под твою цель."
                speed={55}
                onDone={() => localStorage.setItem("welcome_seen_v1", "1")}
              />
            ) : (
              <p style={s.blockText}>
                Я персональный ИИ-тренер. Помогу настроить тренировки и питание под твою цель.
              </p>
            )}
            <button style={s.ctaBig} onClick={() => navigate("/onb/age-sex")}>
              Заполнить данные
            </button>
          </>
        )}
      </section>

      {/* Быстрые действия: одинаковый размер карточек */}
      <section style={{ ...s.block, ...s.quickActionsWrap }}>
        <div style={s.quickRow}>
          <QuickAction
            emoji="📅"
            title="Расписание"
            hint="Тренировок"
            onClick={() => navigate("/schedule")}
          />
          <QuickAction
            emoji="🍽️"
            title="Питание"
            hint="Сегодня"
            onClick={() => navigate("/nutrition/today")}
          />
          <QuickAction
            emoji="📈"
            title="Прогресс"
            hint="Данные"
            onClick={() => navigate("/progress")}
          />
        </div>
      </section>

      <div style={{ height: 16 }} />
    </div>
  );
}

function ChipStatSquare({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: string;
}) {
  return (
    <div className="chipSquare" style={s.chipSquare}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontSize: 12, opacity: 0.7, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, textAlign: "center" }}>{value}</div>
    </div>
  );
}

function QuickAction({
  emoji,
  title,
  hint,
  onClick,
}: {
  emoji: string;
  title: string;
  hint: string;
  onClick?: () => void;
}) {
  return (
    <button style={s.quickItem} type="button" onClick={onClick}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={s.quickItemTitle}>{title}</div>
      <div style={s.quickItemHint}>{hint}</div>
    </button>
  );
}

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.35) 0%, rgba(217,194,240,.35) 45%, rgba(255,216,194,.35) 100%)",
    minHeight: "100vh",
    backgroundAttachment: "fixed",
  },

  heroWrap: {
    position: "relative",
    overflow: "visible",
    marginTop: 0, // к самому верху
    marginBottom: 10,
  },

  heroCard: {
    position: "relative",
    padding: 20,
    borderRadius: 20,
    boxShadow: cardShadow,
    background: "#000",
    color: "#fff",
    minHeight: 220, // ниже на широких экранах
    overflow: "visible",
    zIndex: 1,
  },

  heroHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
    zIndex: 3,
  },

  heroBody: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    position: "relative",
    zIndex: 3,
  },

  pillDark: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.12)",
    backdropFilter: "blur(4px)",
  },

  heroContent: {
    width: "min(420px, 50%)",
    maxWidth: "50%",
    position: "relative",
    zIndex: 3,
    wordBreak: "break-word",
  },

  heroRightSpacer: {
    flex: "0 0 50%",
    maxWidth: "50%",
    minWidth: 140,
  },

  heroTitle: { fontSize: 24, fontWeight: 900, marginTop: 10, color: "#fff" },
  heroSubtitle: { marginTop: 6, color: "rgba(255,255,255,.9)" },

  ctaGenerate: {
    marginTop: 18,
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 800,
    color: "#000",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    boxShadow: "0 10px 28px rgba(0,0,0,.25)",
    cursor: "pointer",
    position: "relative",
    zIndex: 3,
  },

  heroClip: {
    position: "absolute",
    left: "-12%",
    right: "-12%",
    top: -160,
    height: "calc(100% + 160px)",
    pointerEvents: "none",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflowY: "hidden",
    overflowX: "visible",
    zIndex: 2,
  },

  robot: {
    position: "absolute",
    right: "3%",
    bottom: -20,
    width: "60vw",
    pointerEvents: "none",
    filter: "none",
  },

  /* Чипы: одинаковые квадраты */
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(96px, 1fr))",
    gap: 12,
    margin: "12px 0 10px",
  },
  chipSquare: {
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 10,
    aspectRatio: "1 / 1",      // гарантирует равные размеры
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    gap: 4,
    wordBreak: "keep-all",
    whiteSpace: "nowrap",
    hyphens: "none",
  },

  chipSurface: {
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderRadius: 16,
  },

  block: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },
  blockTitle: { margin: 0, fontSize: 18, fontWeight: 800 },
  blockText: { margin: "8px 0 12px", color: "#444" },

  primaryBtn: {
    marginTop: 10,
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    background: "#000",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
    cursor: "pointer",
  },

  ctaBig: {
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    fontWeight: 800,
    color: "#fff",
    background: "linear-gradient(135deg,#34a1fe,#04b5c9,#00ede0)",
    cursor: "pointer",
  },

  /* Быстрые действия: одинаковые карточки */
  quickActionsWrap: {
    background: "transparent",
    boxShadow: "none",
    padding: 0,
    marginTop: 20,
  },
  quickRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  quickItem: {
    flex: 1,
    borderRadius: 16,
    padding: "16px 10px",
    minHeight: 96,             // одинаковая высота
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "grid",
    gap: 6,
    alignItems: "center",
    justifyItems: "center",
    textAlign: "center",
    cursor: "pointer",
    fontSize: 14,              // чуть меньше шрифт
    fontWeight: 600,
    wordBreak: "keep-all",
    whiteSpace: "nowrap",
    hyphens: "none",
  },
  quickItemTitle: {
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    wordBreak: "keep-all",
    hyphens: "none",
  },
  quickItemHint: {
    fontSize: 12,
    color: "#666",
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    wordBreak: "keep-all",
    hyphens: "none",
  },
};