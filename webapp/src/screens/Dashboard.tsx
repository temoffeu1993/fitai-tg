// webapp/src/screens/Dashboard.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import robotImg from "../assets/robot.png";
const ROBOT_SRC = robotImg;

const HISTORY_KEY = "history_sessions_v1";
const RANK_TIERS = [
  { min: 0, name: "Новичок" },
  { min: 5, name: "Импульс" },
  { min: 12, name: "Темпо" },
  { min: 25, name: "Сталь" },
  { min: 45, name: "Легенда" },
];

type HistorySnapshot = { total: number; lastCompletedAt: number | null; xp: number };

function readHistorySnapshot(): HistorySnapshot {
  if (typeof window === "undefined") return { total: 0, lastCompletedAt: null, xp: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return { total: 0, lastCompletedAt: null, xp: 0 };

    const sorted = raw
      .map((rec) => {
        const dateValue = rec?.finishedAt || rec?.completedAt || rec?.date;
        const ts = dateValue ? new Date(dateValue).getTime() : NaN;
        return { ...rec, __ts: Number.isNaN(ts) ? null : ts };
      })
      .sort((a, b) => ((a.__ts || 0) - (b.__ts || 0)));

    let last: number | null = null;
    let xp = 0;
    let streak = 0;
    let prevDayNumber: number | null = null;

    for (const rec of sorted) {
      const ts = rec.__ts;
      const duration = Number(rec?.durationMin) || 0;
      const exercisesCount = Array.isArray(rec?.exercises)
        ? rec.exercises.length
        : Array.isArray(rec?.items)
        ? rec.items.length
        : 0;

      const base = 120;
      const durationBonus = Math.min(90, Math.max(20, duration || 30)) * 1.5;
      const varietyBonus = Math.min(10, Math.max(3, exercisesCount || 4)) * 12;
      xp += Math.round(base + durationBonus + varietyBonus);

      if (typeof ts === "number") {
        const dayNumber = Math.floor(ts / 86400000);
        if (prevDayNumber != null && dayNumber - prevDayNumber <= 2) {
          streak += 1;
        } else {
          streak = 1;
        }
        xp += Math.max(0, streak - 1) * 25;
        prevDayNumber = dayNumber;
        if (last == null || ts > last) last = ts;
      }
    }

    return { total: raw.length, lastCompletedAt: last, xp };
  } catch {
    return { total: 0, lastCompletedAt: null, xp: 0 };
  }
}

function rankTitle(total: number, lastCompletedAt: number | null) {
  let tierIndex = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (total >= RANK_TIERS[i].min) {
      tierIndex = i;
    } else {
      break;
    }
  }
  if (lastCompletedAt) {
    const daysSince = (Date.now() - lastCompletedAt) / 86400000;
    const penalty = daysSince > 45 ? 2 : daysSince > 21 ? 1 : 0;
    tierIndex = Math.max(0, tierIndex - penalty);
  }
  return RANK_TIERS[tierIndex].name;
}

let robotPreloaded = false;
function ensureRobotPreloaded(src: string) {
  if (robotPreloaded) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!src) return;
  robotPreloaded = true;

  try {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    link.setAttribute("data-preload-img", "robot");
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
  } catch {}

  const img = new Image();
  img.decoding = "async";
  img.src = src;
}

ensureRobotPreloaded(ROBOT_SRC);

// имя из Телеграма
function resolveTelegramName() {
  try {
    const profileData = localStorage.getItem("profile");
    if (!profileData) return "Гость";
    
    const p = JSON.parse(profileData);
    if (p && typeof p === "object") {
      if (p.first_name && typeof p.first_name === "string" && p.first_name.trim()) {
        return p.first_name.trim();
      }
      if (p.username && typeof p.username === "string" && p.username.trim()) {
        return p.username.trim();
      }
    }
  } catch (err) {
    console.error("Error parsing Telegram profile:", err);
  }
  return "Гость";
}

function hasOnb() {
  try {
    // Проверяем ТОЛЬКО флаг завершения онбординга
    return localStorage.getItem("onb_complete") === "1";
  } catch {
    return false;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();

  // Всегда используем имя из Telegram (убрали поле имени из онбординга)
  const [onbDone, setOnbDone] = useState<boolean>(hasOnb());
  const [name, setName] = useState<string>(() => {
    const tgName = resolveTelegramName();
    console.log("Dashboard name from Telegram:", tgName);
    return tgName;
  });

  const [historyStats, setHistoryStats] = useState<HistorySnapshot>(() => readHistorySnapshot());
  
  // Подсветка кнопки после выбора схемы
  const [highlightGenerateBtn, setHighlightGenerateBtn] = useState<boolean>(
    () => localStorage.getItem("highlight_generate_btn") === "1"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateIdentity = () => {
      const done = hasOnb();
      setOnbDone(done);
      // Всегда используем имя из Telegram
      setName(resolveTelegramName());
    };

    updateIdentity();
    window.addEventListener("focus", updateIdentity);
    const onOnbUpdated = () => updateIdentity();
    window.addEventListener("onb_updated" as any, onOnbUpdated);

    return () => {
      window.removeEventListener("focus", updateIdentity);
      window.removeEventListener("onb_updated" as any, onOnbUpdated);
    };
  }, []);

  // Убрать подсветку через 10 секунд
  useEffect(() => {
    if (!highlightGenerateBtn) return;
    const timer = setTimeout(() => {
      setHighlightGenerateBtn(false);
      localStorage.removeItem("highlight_generate_btn");
    }, 10000);
    return () => clearTimeout(timer);
  }, [highlightGenerateBtn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshHistory = () => setHistoryStats(readHistorySnapshot());
    refreshHistory();
    window.addEventListener("focus", refreshHistory);
    window.addEventListener("history_updated" as any, refreshHistory);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_KEY || event.key === "onb_complete") {
        setOnbDone(hasOnb());
        // Всегда используем имя из Telegram
        setName(resolveTelegramName());
        refreshHistory();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("focus", refreshHistory);
      window.removeEventListener("history_updated" as any, refreshHistory);
      window.removeEventListener("storage", handleStorage);
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

  const heroCtaLabel = onbDone ? "Редактировать анкету" : "Заполнить анкету";
  const totalWorkouts = historyStats.total || 0;
  const experiencePoints = historyStats.xp || 0;
  const rankName = useMemo(
    () => rankTitle(totalWorkouts, historyStats.lastCompletedAt),
    [totalWorkouts, historyStats.lastCompletedAt]
  );
  const statsChips = useMemo(
    () => [
      { emoji: "🏁", label: "Тренировок", value: String(totalWorkouts) },
      { emoji: "⭐", label: "Опыт", value: experiencePoints ? String(experiencePoints) : "0" },
      { emoji: "⚡", label: "Ранг", value: rankName },
    ],
    [totalWorkouts, experiencePoints, rankName]
  );

  // под заголовком — всегда один и тот же текст
  const subtitle = "Я персональный ИИ фитнес тренер";

  const goOnb = () => navigate("/onb/age-sex");

  const workoutsCtaLabel = "Выбрать тренировку";

  return (
    <div style={s.page}>
      <style>{`
        /* ===== iPhone 14/15 Pro и узкие экраны ===== */
        @media (max-width: 420px) {
          .heroCard { padding: calc(env(safe-area-inset-top, 0px) + 8px) 14px 12px 14px; min-height: 280px; border-radius: 22px; }
          .heroHeaderPill { font-size: 12px; padding: 6px 10px; }
          .heroTitle { font-size: clamp(22px, 6vw, 28px); line-height: 1.12; margin-top: 4px; }
          .heroSubtitle { font-size: clamp(13px, 3.4vw, 15px); line-height: 1.3; margin-top: 4px; }
          .heroCTA { margin-top: 12px; padding: 14px 16px; font-size: 16px; border-radius: 14px; }
          .heroGrid { display: grid; grid-template-columns: 56% 44%; align-items: start; gap: 8px; position: relative; z-index: 3; margin-top: 0; }
          .heroContent { width: auto !important; max-width: none !important; align-self: end;}
          .robotWrap { position: relative; height: 0; padding-bottom: 88%; overflow: visible; }
          .robot { position: absolute; right: -8%; bottom: -6%; width: 120%; max-width: none; pointer-events: none; }
          .heroClip { position: absolute; inset: -120px -10% -1px -10%; overflow-x: visible; overflow-y: hidden; border-bottom-left-radius: 22px; border-bottom-right-radius: 22px; z-index: 2; }
        }

        /* === Glow border for cta buttons === */
        .glow-anim{ position:relative; isolation:isolate; }
        .glow-anim::before{
          content:""; position:absolute; inset:-2px; border-radius:14px; padding:2px;
          background: conic-gradient(from var(--angle),
            rgba(236,227,255,.95), rgba(217,194,240,.95),
            rgba(255,216,194,.95), rgba(236,227,255,.95));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: spinAngle 2.8s linear infinite; z-index:0; filter: saturate(1.1);;
        }
        .glow-anim::after{
          content:""; position:absolute; inset:-8px; border-radius:18px;
          background: conic-gradient(from var(--angle),
            rgba(236,227,255,.35), rgba(217,194,240,.35),
            rgba(255,216,194,.35), rgba(236,227,255,.35));
          filter: blur(12px); z-index:-1; animation: spinAngle 2.8s linear infinite;
        }
        @property --angle{ syntax:"<angle>"; initial-value:0deg; inherits:false; }
        @keyframes spinAngle{ to{ --angle:360deg; } }

        /* === Highlight pulse для подсветки кнопки === */
        .highlight-pulse {
          animation: highlightPulse 1.5s ease-in-out infinite !important;
        }
        @keyframes highlightPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.02); filter: brightness(1.1); }
        }

        /* ===== Планшеты и десктопы ===== */
        @media (min-width: 421px) {
          .heroContent { width: min(420px, 50%) !important; max-width: 50% !important; }
          .heroRightSpacer { flex: 0 0 50% !important; max-width: 50% !important; }
          .robot { width: 520px; right: 8%; }
          .heroClip { position: absolute; left: -12%; right: -12%; top: -160px; height: calc(100% + 160px); pointerEvents: none; border-bottom-left-radius: 20px; border-bottom-right-radius: 20px; overflow-y: hidden; overflow-x: visible; z-index: 2; }
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
              {/* Заголовок в две строки */}
              <div className="heroTitle" style={s.heroTitle}>
                <div>Привет,</div>
                <div>{name}</div>
              </div>
              {/* Подзаголовок всегда */}
              <div className="heroSubtitle" style={s.heroSubtitle}>{subtitle}</div>

              <div style={s.heroCtaWrap}>
                {/* В HERO кнопка только после онбординга, без анимации */}
                {onbDone ? (
                  <button
                    className="heroCTA"
                    style={s.ctaGenerate}
                    onClick={goOnb}
                    aria-label={heroCtaLabel}
                  >
                    <span style={s.heroCtaWords}>
                      {"Редактировать анкету".split(" ").map((word, idx) => (
                        <span key={`${word}-${idx}`} style={s.heroCtaWord}>
                          {word}
                        </span>
                      ))}
                    </span>
                  </button>
                ) : null}
              </div>
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
              loading="eager"
              fetchPriority="high"
              decoding="sync"
              draggable={false}
            />
          </div>
        </div>
      </section>

      {/* Блок призыва заполнить анкету — только до онбординга */}
      {!onbDone && (
        <section style={{ ...s.block, ...s.chipSurface }}>
          <p style={s.blockText}>
            Сначала заполни анкету, чтобы я лучше понял твои цели и особенности. После этого я буду составлять эффективные программы тренировок и питания.
          </p>
          <button
            className="glow-anim"
            style={{ ...s.ctaBig, border: "1px solid transparent" }}
            onClick={goOnb}
            aria-label="Заполнить анкету"
          >
            Заполнить анкету
          </button>
        </section>
      )}

      {/* Чипы — визуально неактивны до онбординга */}
      <section style={s.statsRow}>
        {statsChips.map((chip) => (
          <ChipStatSquare
            key={chip.label}
            emoji={chip.emoji}
            label={chip.label}
            value={chip.value}
            disabled={!onbDone}
          />
        ))}
      </section>

      {/* Твой ИИ-тренер — весь блок неактивен до онбординга */}
      <section style={{ ...s.block, ...s.chipSurface, ...(onbDone ? {} : s.disabledBtn) }}>
        <h3 style={s.blockTitle}>Умные тренировки 🧠</h3>
        <p style={s.blockText}>
          Я делаю каждую тренировку эффективной с учётом твоего состояния, цели, опыта и истории тренировок.
        </p>
        <button
          className={onbDone ? (highlightGenerateBtn ? "glow-anim highlight-pulse" : "glow-anim") : undefined}
          style={{
            ...s.ctaMain,
            ...(onbDone ? {} : s.disabledBtn),
            border: "1px solid transparent",
          }}
          onClick={() => {
            if (!onbDone) return;
            setHighlightGenerateBtn(false);
            localStorage.removeItem("highlight_generate_btn");
            navigate("/plan/one");
          }}
          disabled={!onbDone}
          aria-disabled={!onbDone}
        >
          {workoutsCtaLabel}
        </button>
      </section>

      {/* Быстрые действия */}
      <section style={{ ...s.block, ...s.quickActionsWrap }}>
        <div style={s.quickRow}>
          <QuickAction
            emoji="📅"
            title="Расписание"
            hint="Тренировок"
            onClick={onbDone ? () => navigate("/schedule") : undefined}
            disabled={!onbDone}
          />
          <QuickAction
            emoji="🍽️"
            title="Питание"
            hint="Сегодня"
            onClick={onbDone ? () => navigate("/nutrition/today") : undefined}
            disabled={!onbDone}
          />
          <QuickAction
            emoji="📈"
            title="Прогресс"
            hint="Данные"
            onClick={onbDone ? () => navigate("/progress") : undefined}
            disabled={!onbDone}
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
  disabled,
}: {
  emoji: string;
  label: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <div className="chipSquare" style={{ ...s.chipSquare, ...(disabled ? s.disabledBtn : {}) }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
          textAlign: "center",
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          textAlign: "center",
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function QuickAction({
  emoji,
  title,
  hint,
  onClick,
  disabled,
}: {
  emoji: string;
  title: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      style={{ ...s.quickItem, ...(disabled ? s.disabledBtn : {}) }}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
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
    background: "transparent",
    minHeight: "100vh",
  },

  heroWrap: { position: "relative", overflow: "visible", marginTop: 0, marginBottom: 10 },

  heroCard: {
    position: "relative",
    padding: 20,
    borderRadius: 20,
    boxShadow: cardShadow,
    background: "#0f172a",
    color: "#fff",
    minHeight: 240,
    overflow: "visible",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 3 },

  heroBody: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    position: "relative",
    zIndex: 3,
    flex: 1,
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

  heroContent: { width: "min(420px, 50%)", maxWidth: "50%", position: "relative", zIndex: 3, wordBreak: "break-word", alignSelf: "flex-end", },

  heroRightSpacer: { flex: "0 0 50%", maxWidth: "50%", minWidth: 140 },

  heroTitle: { fontSize: 24, fontWeight: 900, marginTop: 10, color: "#fff" },

  heroSubtitle: { marginTop: 6, color: "rgba(255,255,255,.9)", fontSize: 15, fontWeight: 500, lineHeight: 1.35 },

  heroCtaWrap: { marginTop: 12 },

  ctaGenerate: {
    border: "none",
    borderRadius: 14,
    padding: "10px 14px",
    fontSize: 15,
    fontWeight: 400,
    color: "#000",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    boxShadow: "0 10px 28px rgba(0,0,0,.25)",
    cursor: "pointer",
    whiteSpace: "normal",
    display: "inline-flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    minWidth: 0,
    textAlign: "left",
    gap: 6,
    flexWrap: "wrap",
    width: "fit-content",
    maxWidth: 200,
    lineHeight: 1.15,
  },

  heroCtaWords: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.05,
    gap: 1,
    fontSize: "clamp(13px, 3.5vw, 16px)",
    whiteSpace: "nowrap",
  },
  heroCtaWord: { display: "block" },

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

  robot: { position: "absolute", right: "3%", bottom: -20, width: "60vw", pointerEvents: "none", filter: "none" },

  /* Чипы */
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

  chipSurface: {
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#000",
    border: "0px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderRadius: 16,
  },

  block: { marginTop: 16, padding: 14, borderRadius: 16, background: "#fff", boxShadow: cardShadow },
  blockTitle: { margin: 0, fontSize: 17, fontWeight: 600 },
  blockText: { margin: "8px 0 12px", color: "#444", fontSize: 15, fontWeight: 450, lineHeight: 1.4 },

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
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 16,
    fontWeight: 600,
    color: "#000",
    background: "rgba(255, 255, 255, 1)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 0px 0px rgba(0,0,0,0.08)",
    backdropFilter: "blur(0px)",
    WebkitBackdropFilter: "blur(0px)",
    cursor: "pointer",
    alignSelf: "flex-start",
  },

  ctaMain: {
    borderRadius: 16,
    padding: "18px 18px",
    fontSize: "clamp(20px, 5.5vw, 24px)",
    lineHeight: 1.12,
    fontWeight: 900,
    color: "rgba(255,255,255,.96)",
    background: "rgba(15,23,42,0.55)",
    border: "1px solid transparent",
    boxShadow: "0 10px 28px rgba(0,0,0,.22)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
    textTransform: "none",
    letterSpacing: "normal",
    whiteSpace: "nowrap",
    alignSelf: "center",
  },

  // визуально выключенные элементы
  disabledBtn: {
    opacity: 0.5,
    cursor: "default",
    filter: "grayscale(10%)",
    pointerEvents: "none",
  },

  // тонкий бордер для glow-маски
  ctaGlowBorderFix: {
    border: "1px solid transparent",
  },

  /* Быстрые действия */
  quickActionsWrap: { background: "transparent", boxShadow: "none", padding: 0, marginTop: 20 },
  quickRow: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "stretch" },
  quickItem: {
    flex: 1,
    borderRadius: 16,
    padding: "16px 10px",
    minHeight: 110,
    height: "100%",
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
    fontSize: 14,
    fontWeight: 400,
    wordBreak: "keep-all",
    whiteSpace: "nowrap",
    hyphens: "none",
  },
  quickItemTitle: { fontWeight: 600, fontSize: 14, lineHeight: 1.1, whiteSpace: "nowrap", wordBreak: "keep-all", hyphens: "none" },
  quickItemHint: { fontSize: 12, color: "#666", lineHeight: 1.1, whiteSpace: "nowrap", wordBreak: "keep-all", hyphens: "none" },
};
