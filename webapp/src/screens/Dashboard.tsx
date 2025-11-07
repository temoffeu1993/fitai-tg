// webapp/src/screens/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";

function resolveName() {
  // 1) онбординг
  try {
    const onbRaw = localStorage.getItem("onb_summary");
    if (onbRaw) {
      const onb = JSON.parse(onbRaw);
      const n = onb?.profile?.name;
      if (typeof n === "string" && n.trim()) return n.trim();
    }
  } catch {}

  // 2) профиль из Telegram WebApp initData
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "null");
    if (p?.first_name) return String(p.first_name);
    if (p?.username) return String(p.username);
  } catch {}

  return "Гость";
}

// --- helpers for welcome logic ---
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

// --- typewriter component ---
function TypeWriter({
  text,
  speed = 25, // медленнее, ближе к реальному набору
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
    }, speed + Math.random() * 60); // случайная задержка для "живости"

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

    // Обновим имя при возвращении на вкладку
    window.addEventListener("focus", update);

    // Если где-то в коде диспатчат это событие после онбординга — тоже обновим
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
      {/* плавное живое свечение фона кнопки */}
      <style>{`
        .soft-glow {
          background: linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);
          background-size: 300% 300%;
          animation: glowShift 6s ease-in-out infinite, pulseSoft 3s ease-in-out infinite;
          transition: background 0.3s ease;
        }
        @keyframes glowShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulseSoft {
          0%, 100% { filter: brightness(1) saturate(1); transform: scale(1); }
          50% { filter: brightness(1.15) saturate(1.1); transform: scale(1.01); }
        }
        @media (prefers-reduced-motion: reduce) {
          .soft-glow { animation: none; }
        }

        /* caret for typewriter */
        .caret { margin-left: 2px; opacity: 1; animation: caretBlink 1s step-end infinite; }
        @keyframes caretBlink { 50% { opacity: 0; } }
      `}</style>

      {/* hero card */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Сегодня</span>
          <span style={s.credits}>Готовность 100%</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>{today}</div>
        <div style={s.heroTitle}>Привет, {name}</div>
        <div style={s.heroSubtitle}>Создай план и начни тренировку</div>

        <button
          className="soft-glow"
          style={s.primaryBtn}
          onClick={() => navigate("/plan/one")}
        >
          Сгенерировать тренировку
        </button>

        <div style={s.heroFooter}>
          <Stat icon="🔥" label="Ккал/трен." value={`${chips.kcal ?? "—"}`} />
          <Stat
            icon="🕒"
            label="Время"
            value={chips.minutes ? `${chips.minutes} мин` : "—"}
          />
          <Stat icon="🏋️" label="Сеты" value={`${chips.sets ?? "—"}`} />
        </div>
      </section>

      {/* AI trainer block */}
<section style={s.block}>
  {hasOnb() ? (
    <>
      <h3 style={s.blockTitle}>Твой ИИ-тренер 🤖</h3>
      <p style={s.blockText}>
        Делает каждую тренировку эффективной и составляет план питания с учётом
        твоей цели, опыта и условий.
      </p>
      <button style={s.ctaBig} onClick={() => navigate("/onb/age-sex")}>
        Редактировать данные
      </button>
    </>
  ) : (
    <>
      <h3 style={s.blockTitle}>Добро пожаловать 👋</h3>
      {isFirstWelcome() ? (
        <TypeWriter
          text="Я персональный ИИ-тренер. Помогу тебе изменить тело и самочувствие с продуманными тренировками и питанием. Подберу план, который сделает тебя сильнее, стройнее и увереннее. Укажи цель, уровень и условия — и начнём путь к твоему лучшему результату."
          speed={55}
          onDone={() => localStorage.setItem("welcome_seen_v1", "1")}
        />
      ) : (
        <p style={s.blockText}>
          Я персональный ИИ-тренер. Помогу тебе изменить тело и самочувствие с продуманными тренировками и питанием. Подберу план, который сделает тебя сильнее, стройнее и увереннее. Укажи цель, уровень и условия — и начнём путь к твоему лучшему результату.
        </p>
      )}

      <button style={s.ctaBig} onClick={() => navigate("/onb/age-sex")}>
        Заполнить данные
      </button>
    </>
  )}
</section>

      {/* quick actions */}
      <section style={{ ...s.block, paddingTop: 10 }}>
        <h3 style={s.blockTitle}>Быстрые действия</h3>
        <div style={s.quickGrid}>
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

function Stat({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div style={s.stat}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
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
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{hint}</div>
    </button>
  );
}

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
    overflow: "hidden",
  },
  heroHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pill: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    backdropFilter: "blur(6px)",
  },
  credits: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    backdropFilter: "blur(6px)",
  },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  heroSubtitle: { opacity: 0.92, marginTop: 2 },

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
    transition: "filter 0.3s ease, transform 0.3s ease",
  },

  heroFooter: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 8,
  },
  stat: {
    background: "rgba(255,255,255,.15)",
    borderRadius: 12,
    padding: 10,
    textAlign: "center",
    backdropFilter: "blur(6px)",
    fontWeight: 600,
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

  ctaBig: {
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "16px",
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
  quickItem: {
    border: "none",
    borderRadius: 14,
    padding: "12px 10px",
    background: "#f6f7fb",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
    display: "grid",
    gap: 4,
    alignItems: "start",
    textAlign: "left",
    cursor: "pointer",
  } as React.CSSProperties,

  cardRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f7f9fc",
    borderRadius: 14,
    padding: 12,
  },
  rowLeft: { display: "grid", gap: 2 },
  rowTitle: { fontWeight: 700 },
  rowHint: { fontSize: 12, color: "#666" },
  rowBtn: {
    border: "none",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    cursor: "pointer",
  },
};