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

        

        /* Контент слева: максимум 50% при любых ширинах */
        .heroContent { width: min(420px, 50%) !important; max-width: 50% !important; }
        .heroRightSpacer { flex: 0 0 50% !important; max-width: 50% !important; }

        /* Робот адаптивный */
        @media (max-width: 420px)  { .robot { width: 60vw; right: 4%; } }
        @media (min-width: 421px) and (max-width: 640px) { .robot { width: 56vw; right: 6%; } }
        @media (min-width: 641px)  { .robot { width: 520px; right: 8%; } }
      `}</style>

      {/* HERO */}
      <section style={s.heroWrap}>
        <div style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pillDark}>{today}</span>
            <span />
          </div>

          {/* Две колонки: слева контент (<=50%), справа резерв (50%) */}
          <div style={s.heroBody}>
            <div className="heroContent" style={s.heroContent}>
              <div style={s.heroTitle}>Привет, {name}</div>
              <div style={s.heroSubtitle}>Я твой персональный ИИ фитнес тренер</div>

              <button
                style={s.ctaGenerate}
                onClick={() => navigate("/plan/one")}
              >
                Сгенерировать тренировку
              </button>
            </div>
            <div className="heroRightSpacer" style={s.heroRightSpacer} />
          </div>

          {/* Робот внутри карточки: выше фона, ниже текста. Может заходить влево. */}
          <div style={s.heroClip}>
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

      {/* Чипы */}
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

      {/* Быстрые действия */}
<section style={{ ...s.block, ...s.quickActionsWrap }}>
  <div style={s.quickRow}>
    <QuickAction
      emoji="📅"
      title="Расписание"
      hint="Выбрать дни"
      onClick={() => navigate("/schedule")}
    />
    <QuickAction
      emoji="🍽️"
      title="Питание"
      hint="Текущий день"
      onClick={() => navigate("/nutrition/today")}
    />
    <QuickAction
      emoji="📈"
      title="Прогресс"
      hint="Замеры и графики"
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
      <div style={{ fontSize: 12, opacity: 0.7, textAlign: "center" }}>{label}</div>
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
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{hint}</div>
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
    marginTop: 30,
    marginBottom: 12,
  },

  heroCard: {
    position: "relative",
    padding: 20,
    borderRadius: 20,
    boxShadow: cardShadow,
    background: "#000",
    color: "#fff",
    minHeight: 260,
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
    minWidth: 160,
  },

  heroTitle: { fontSize: 24, fontWeight: 900, marginTop: 10, color: "#fff" },
  heroSubtitle: { marginTop: 6, color: "rgba(255,255,255,.9)" },

  ctaGenerate: {
    marginTop: 45,
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

  /* Клиппер: даём роботу заходить влево, режем только низ */
  heroClip: {
    position: "absolute",
    left: "-12%",             // было 50% — из-за этого слева обрезало
    right: "-12%",
    top: -160,
    height: "calc(100% + 160px)",
    pointerEvents: "none",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflowY: "hidden",      // низ обрезается
    overflowX: "visible",     // по бокам не обрезаем
    zIndex: 2,                // между фоном и текстом
  },

  robot: {
    position: "absolute",
    right: "3%",
    bottom: -36,
    width: "60vw",
    pointerEvents: "none",
    filter: "none",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(96px, 1fr))",
    gap: 12,
    margin: "14px 0 10px",
  },
  chipSquare: {
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 10,
    aspectRatio: "1 / 1",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    gap: 4,
  },

  chipSurface: {
  background: "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
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

  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 12,
    marginTop: 10,
  },
  quickActionsWrap: {
  background: "transparent", // убираем фон
  boxShadow: "none",         // убираем тень
  padding: 0,                // без внутренних отступов
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
  padding: "18px 12px",
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
  fontSize: 15,
  fontWeight: 600,
},

};