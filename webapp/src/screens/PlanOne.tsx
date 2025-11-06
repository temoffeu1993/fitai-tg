import { useEffect, useMemo, useState } from "react";
import { generatePlan } from "@/api/plan";
import { useNavigate, useLocation } from "react-router-dom";
import { loadHistory, buildHistoryFeatures } from "@/lib/history";
import { createPlannedWorkout } from "@/api/schedule";

const PLAN_CACHE_KEY = "plan_cache_v1";
const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const defaultScheduleTime = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
};

export type Exercise = {
  name: string; sets: number;
  reps?: number|string; restSec?: number; cues?: string;
  pattern?: string; targetMuscles?: string[]; tempo?: string; guideUrl?: string; weight?: string;
};

/**
 * PLAN — ознакомительный экран в общем стиле приложения.
 * - collapsible секции (разминка, основная часть, заминка)
 * - плавающий комментарий тренера (plan.notes)
 * - улучшенный caret
 * - увеличенный бот
 * - "пишет..." при генерации
 * - чат-бабл без затемнения
 */

export default function PlanOne() {
  const nav = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any | null>(null);
  const [chips, setChips] = useState<{ sets: number; minutes: number; kcal: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => toDateInput(new Date()));
  const [scheduleTime, setScheduleTime] = useState(() => defaultScheduleTime());
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // collapsible state
  const [openWarmup, setOpenWarmup] = useState(false);
  const [openMain, setOpenMain] = useState(false);
  const [openCooldown, setOpenCooldown] = useState(false);

  // trainer notes popup
  const [showNotes, setShowNotes] = useState(false);

  const steps = useMemo(
    () => ["Анализ профиля", "Цели и ограничения", "Подбор упражнений", "Оптимизация нагрузки", "Формирование плана"],
    []
  );

  useEffect(() => {
    let mounted = true;
    const stepTimer: any = setInterval(() => setStage((s) => (s < steps.length - 1 ? s + 1 : s)), 1200);

    (async () => {
      setError(null);

      // 1) читаем онбординг и считаем его хэш
      let onb: any = {};
      try {
        onb = JSON.parse(localStorage.getItem("onb_summary") || "null") || {};
      } catch {}
      const onbHash = djb2(JSON.stringify(onb));

      // 2) флаг принудительной регенерации ?force=1
      const force = new URLSearchParams(location.search).get("force") === "1";

      // 3) пробуем кэш
      try {
        const cachedRaw = localStorage.getItem(PLAN_CACHE_KEY);
        if (!force && cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.onbHash === onbHash && cached?.plan) {
            if (!mounted) return;
            setPlan(cached.plan);

            const sets = (cached.plan.exercises || []).reduce((a: number, x: any) => a + Number(x.sets || 0), 0);
            const minutes = Number(cached.plan.duration || 0) || Math.max(25, Math.min(90, Math.round(sets * 3.5)));
            const kcal = Math.round(minutes * 6);
            setChips({ sets, minutes, kcal });

            setLoading(false);
            clearInterval(stepTimer);
            return; // ранний выход: используем кэш
          }
        }
      } catch {}

      // 4) если кэша нет/не подходит — генерируем
      try {
        // подмешиваем историю из localStorage
        const history = loadHistory();
        const histFeatures = buildHistoryFeatures(history);

        const result = await generatePlan({
          ...onb,
          history: {
            summary: histFeatures,
            recent: history.slice(0, 30),
            policy: {
              avoidRecentlyDone: true,
              progression: "small-steps",
            },
          },
        });

        const raw = result?.plan || result;

        const norm = (arr: any[]): Exercise[] =>
          (arr || []).map((x: any) =>
            typeof x === "string"
              ? { name: x, sets: 1 }
              : {
                  name: String(x.name ?? ""),
                  sets: Number(x.sets ?? 1),
                  reps: x.reps, restSec: x.restSec, cues: x.cues,
                  pattern: x.pattern, targetMuscles: x.targetMuscles,
                  tempo: x.tempo, guideUrl: x.guideUrl, weight: x.weight,
                }
          );

        const normalized = {
          ...raw,
          warmup: norm(raw.warmup),
          exercises: norm(raw.exercises),
          cooldown: norm(raw.cooldown),
          notes: raw.notes || raw.note || raw.trainerNotes || "",
        };

        if (!mounted) return;
        setPlan(normalized);

        const sets = (normalized.exercises || []).reduce((a: number, x: Exercise) => a + Number(x.sets || 0), 0);
        const minutes = Number(normalized.duration || 0) || Math.max(25, Math.min(90, Math.round(sets * 3.5)));
        const kcal = Math.round(minutes * 6);
        setChips({ sets, minutes, kcal });

        // 5) кладём в кэш
        try {
          localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ onbHash, plan: normalized, ts: Date.now() }));
        } catch {}
      } catch (e: any) {
        console.error("generatePlan error:", e?.message || e);
        setError("Не удалось создать план");
      } finally {
        if (mounted) setLoading(false);
        clearInterval(stepTimer);
      }
    })();

    return () => {
      mounted = false;
      clearInterval(stepTimer);
    };
  }, [steps.length, location.search]);

  useEffect(() => {
    const onPlanCompleted = () => {
      try {
        localStorage.removeItem(PLAN_CACHE_KEY);
        nav("/plan/one?force=1", { replace: true });
      } catch {}
    };
    window.addEventListener("plan_completed", onPlanCompleted as any);
    return () => window.removeEventListener("plan_completed", onPlanCompleted as any);
  }, [nav]);

  useEffect(() => {
    const onOnbUpdated = () => {
      try { localStorage.removeItem(PLAN_CACHE_KEY); } catch {}
    };
    window.addEventListener("onb_updated" as any, onOnbUpdated);
    return () => window.removeEventListener("onb_updated" as any, onOnbUpdated);
  }, []);

  // --- новый обработчик регенерации: сброс экрана и запуск анимации генерации ---
  const handleRegenerate = () => {
    try {
      localStorage.removeItem(PLAN_CACHE_KEY);
      localStorage.removeItem("current_plan");
      localStorage.removeItem("session_draft");
    } catch {}
    setPlan(null);
    setChips(null);
    setError(null);
    setStage(0);
    setLoading(true);
    nav("/plan/one?force=1", { replace: true });
  };

  const handleScheduleOpen = () => {
    setScheduleDate(toDateInput(new Date()));
    setScheduleTime(defaultScheduleTime());
    setScheduleError(null);
    setShowScheduleModal(true);
  };

  const handleScheduleConfirm = async () => {
    if (!plan) return;
    if (!scheduleDate || !scheduleTime) {
      setScheduleError("Укажи дату и время");
      return;
    }
    const when = new Date(`${scheduleDate}T${scheduleTime}`);
    if (!Number.isFinite(when.getTime())) {
      setScheduleError("Некорректная дата или время");
      return;
    }

    try {
      setScheduleSaving(true);
      setScheduleError(null);
      await createPlannedWorkout({ plan, scheduledFor: when.toISOString(), scheduledTime: scheduleTime });
      setShowScheduleModal(false);
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch {}
      nav("/", { replace: true });
    } catch (err) {
      console.error("createPlannedWorkout failed", err);
      setScheduleError("Не удалось сохранить. Попробуй ещё раз.");
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pill}>Генерация</span>
            <span style={s.credits}>ИИ работает</span>
          </div>

          <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>{steps[stage]}</div>
          <div style={s.heroTitle}>Создаю персональную тренировку</div>
          <div style={s.loadWrap}>
            <Spinner />
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>Подстраиваю под твои цели и инвентарь</div>
          </div>

          <div style={s.heroFooter}>
            <Stat icon="🧠" label="Аналитика" value="в процессе" />
            <Stat icon="🧩" label="Подбор" value="готовится" />
            <Stat icon="⚡" label="Прогресс" value={`${Math.min(20 + stage * 20, 95)}%`} />
          </div>
        </section>

        <section style={s.blockWhite}>
          <SkeletonLine />
          <SkeletonLine w={80} />
          <SkeletonLine w={60} />
        </section>

        {/* Плавающий тренер во время генерации: вместо текста комментария — точки */}
        <div style={notesStyles.fabWrapLoading}>
          <div style={notesStyles.speechBubble}>
            <div style={notesStyles.speechText}>
              <span className="typing-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
            </div>
            <div style={notesStyles.speechArrow} />
          </div>
          <div style={notesStyles.fabCircle}>
            <span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>{error}</h3>
          <p style={{ marginTop: 6, color: "#555" }}>Проверь подключение и повтори попытку.</p>
          <button style={s.rowBtn} onClick={() => window.location.reload()}>Повторить</button>
        </section>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>План отсутствует</h3>
        </section>
      </div>
    );
  }

  // вычисления для верхнего блока (кнопки и метрики)
  const workoutNumber = (() => {
    try { const history = loadHistory(); return history.length + 1; } catch { return 1; }
  })();
  const totalExercises = Array.isArray(plan.exercises) ? plan.exercises.length : 0;

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Сегодня</span>
          <span style={s.credits}>План готов</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>
          {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div style={s.heroTitle}>{plan.title || "Тренировка дня"}</div>
        <div style={s.heroSubtitle}>Краткое превью перед стартом</div>

        {chips && (
          <div style={s.heroFooter}>
            <Stat icon="🎯" label="Тренировка" value={`#${workoutNumber}`} />
            <Stat icon="🕒" label="Время" value={`${chips.minutes} мин`} />
            <Stat icon="💪" label="Упражнения" value={`${totalExercises}`} />
          </div>
        )}

        <button
          className="soft-glow"
          style={s.primaryBtn}
          onClick={() => {
            try {
              localStorage.setItem("current_plan", JSON.stringify(plan));
              nav("/workout/session", { state: { plan } });
            } catch (err) {
              console.error("open session error", err);
              alert("Не удалось открыть тренировку");
            }
          }}
        >
          Начать тренировку
        </button>

        <button
          style={s.secondaryBtn}
          onClick={handleScheduleOpen}
        >
          Запланировать в календарь
        </button>

        <button
          style={s.ghostBtn}
          onClick={handleRegenerate}
        >
          Сгенерировать заново
        </button>
      </section>

      {/* Разминка */}
      {Array.isArray(plan.warmup) && plan.warmup.length > 0 && (
        <SectionCard
          icon="🧘‍♀️"
          title="Разминка"
          hint="Мягкая активация. Двигайся без спешки."
          isOpen={openWarmup}
          onToggle={() => setOpenWarmup((v) => !v)}
        >
          <ExercisesList items={plan.warmup} variant="warmup" isOpen={openWarmup} />
        </SectionCard>
      )}

      {/* Основная часть */}
      <SectionCard
        icon="⚡"
        title="Основная часть"
        hint="Техника приоритетнее веса. Держи темп и отдых по самочувствию."
        isOpen={openMain}
        onToggle={() => setOpenMain((v) => !v)}
      >
        <ExercisesList items={plan.exercises} variant="main" isOpen={openMain} />
      </SectionCard>

      {/* Заминка */}
      {Array.isArray(plan.cooldown) && plan.cooldown.length > 0 && (
        <SectionCard
          icon="🧘‍♂️"
          title="Заминка"
          hint="Снижаем пульс. Растяжка без боли. Ровное дыхание."
          isOpen={openCooldown}
          onToggle={() => setOpenCooldown((v) => !v)}
        >
          <ExercisesList items={plan.cooldown} variant="cooldown" isOpen={openCooldown} />
        </SectionCard>
      )}

      <div style={{ height: 56 }} />

      {showScheduleModal && (
        <ScheduleModal
          title={plan.title || "Тренировка"}
          date={scheduleDate}
          time={scheduleTime}
          loading={scheduleSaving}
          error={scheduleError}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={handleScheduleConfirm}
          onDateChange={(val) => setScheduleDate(val)}
          onTimeChange={(val) => setScheduleTime(val)}
        />
      )}

      {/* Комментарий тренера */}
      {plan.notes && (
        <>
          {/* чат-панель над иконкой */}
          {showNotes && (
            <div
              style={notesStyles.chatPanelWrap}
            >
              <div style={notesStyles.chatPanel}>
                <div style={notesStyles.chatHeader}>
                  <div style={notesStyles.chatHeaderLeft}>
                    <div style={notesStyles.robotIconLarge}>🤖</div>
                    <div style={notesStyles.chatTitle}>Комментарий тренера</div>
                  </div>
                  <button
                    style={notesStyles.closeBtn}
                    onClick={() => setShowNotes(false)}
                  >
                    ✕
                  </button>
                </div>
                <div style={notesStyles.chatBody}>{plan.notes}</div>
              </div>
            </div>
          )}

          {/* плавающая кнопка тренера */}
          <div style={notesStyles.fabWrap} onClick={() => setShowNotes((v) => !v)}>
            {!showNotes && (
              <div style={notesStyles.speechBubble}>
                <div style={notesStyles.speechText}>Комментарий тренера</div>
                <div style={notesStyles.speechArrow} />
              </div>
            )}
            <div style={notesStyles.fabCircle}>
              <span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------- Типы и утилиты ----------------- */

function djb2(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return String(h >>> 0);
}

function formatReps(r?: number | string) {
  if (r == null || r === "") return "—";
  return typeof r === "number" ? String(r) : String(r);
}

function formatSec(s?: number) {
  if (s == null) return "—";
  const m = Math.floor((s as number) / 60);
  const sec = Math.round((s as number) % 60);
  return m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}с`;
}

/* ----------------- Компоненты UI ----------------- */

function ScheduleModal({
  title,
  date,
  time,
  loading,
  error,
  onClose,
  onSubmit,
  onDateChange,
  onTimeChange,
}: {
  title: string;
  date: string;
  time: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <div style={modal.wrap} role="dialog" aria-modal="true">
      <div style={modal.card}>
        <div style={modal.header}>
          <div style={modal.title}>{title}</div>
          <button style={modal.close} onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div style={modal.body}>
          <label style={modal.label}>
            <span style={modal.labelText}>Дата</span>
            <input
              style={modal.input}
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </label>
          <label style={modal.label}>
            <span style={modal.labelText}>Время</span>
            <input
              style={modal.input}
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </label>
          {error && <div style={modal.error}>{error}</div>}
        </div>
        <div style={modal.footer}>
          <button
            style={modal.cancel}
            onClick={onClose}
            type="button"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            style={modal.save}
            onClick={onSubmit}
            type="button"
            disabled={loading}
          >
            {loading ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  hint,
  children,
  isOpen,
  onToggle,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: any;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section style={s.block}>
      <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
        {/* Шапка секции */}
        <button
          style={{
            ...ux.cardHeader,
            background: uxColors.headerBg,
            width: "100%",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            position: "relative",
          }}
          onClick={onToggle}
        >
          <div style={{ ...ux.iconInline }}>{icon}</div>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={ux.cardTitleRow}>
              <div style={ux.cardTitle}>{title}</div>

              {/* Новый caret */}
              <div style={{
                ...ux.caretWrap,
                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}>
                <div style={ux.caretInner} />
              </div>
            </div>
            {hint && <div style={ux.cardHint}>{hint}</div>}
          </div>
        </button>

        {isOpen && <div style={{ padding: 10 }}>{children}</div>}
      </div>
    </section>
  );
}

function ExercisesList({
  items,
  variant, // warmup | main | cooldown
  isOpen,
}: {
  items: Exercise[];
  variant: "warmup" | "main" | "cooldown";
  isOpen: boolean;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!isOpen) return null;

  const isMain = variant === "main";
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((ex, i) => (
        <div key={i} style={row.wrap}>
          {/* Левая часть */}
          <div style={row.left}>
            <div style={row.name}>{ex.name}</div>
            {ex.cues && <div style={row.cues}>{ex.cues}</div>}
          </div>

          {/* Правая часть: две одинаковые компактные капсулы, контент вправо */}
          {isMain ? (
            <div style={row.metrics}>
              <div style={caps.wrap} title="Подходы и отдых">
                <div style={caps.box}>
                  <span style={caps.num}>{ex.sets}×{formatReps(ex.reps)}</span>
                </div>
                <div style={caps.box}>
                  <span style={caps.label}>Отдых</span>
                  <span style={caps.num}>{formatSec(ex.restSec)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ----------------- Мелкие элементы ----------------- */

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function SkeletonLine({ w = 100 }: { w?: number }) {
  return (
    <div
      style={{
        height: 10,
        width: `${w}%`,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.4s ease-in-out infinite",
        marginTop: 8,
      }}
    />
  );
}

function Spinner() {
  return (
    <svg width="56" height="56" viewBox="0 0 50 50" style={{ display: "block" }}>
      <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.35)" strokeWidth="6" fill="none" />
      <circle
        cx="25" cy="25" r="20"
        stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none"
        strokeDasharray="110" strokeDashoffset="80"
        style={{ transformOrigin: "25px 25px", animation: "spin 1.2s linear infinite" }}
      />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
    </svg>
  );
}

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow {
        background: linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);
        background-size: 300% 300%;
        animation: glowShift 6s ease-in-out infinite, pulseSoft 3s ease-in-out infinite;
        transition: background 0.3s ease;
      }
      @keyframes glowShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.15) saturate(1.1); transform: scale(1.01) } }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
    `}</style>
  );
}

function TypingDotsStyles() {
  return (
    <style>{`
      .typing-dots {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .typing-dots .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #1b1b1b;
        opacity: 0.3;
        animation: blink 1.2s infinite;
      }
      .typing-dots .dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dots .dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes blink {
        0%   { opacity: 0.3; transform: translateY(0); }
        50%  { opacity: 1;   transform: translateY(-2px); }
        100% { opacity: 0.3; transform: translateY(0); }
      }
    `}</style>
  );
}

/* ----------------- Стиль под Dashboard ----------------- */

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, 'Inter', 'Roboto', Segoe UI",
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
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
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

  secondaryBtn: {
    marginTop: 10,
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#d7f3ff,#a0d9ff)",
    boxShadow: "0 5px 16px rgba(0,0,0,.13)",
    cursor: "pointer",
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
    padding: 0,
    borderRadius: 16,
    background: "transparent",
    boxShadow: "none",
  },

  blockWhite: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },

  rowBtn: {
    border: "none",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    cursor: "pointer",
    marginTop: 8,
  },

  loadWrap: { marginTop: 10, display: "grid", justifyItems: "center" },

  ghostBtn: {
    width: "100%",
    marginTop: 10,
    padding: "8px 0",
    border: "none",
    background: "transparent",
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
    opacity: 0.9,
  },
};

const modal: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 2000,
    overscrollBehavior: "contain",
  },
  card: {
    width: "min(92vw, 420px)",
    borderRadius: 18,
    background: "#fff",
    boxShadow: "0 22px 60px rgba(0,0,0,.32)",
    padding: 20,
    display: "grid",
    gap: 18,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
  },
  close: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
    color: "#555",
  },
  body: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 6,
  },
  labelText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#555",
  },
  input: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    fontSize: 15,
    fontWeight: 600,
    color: "#1b1b1b",
    fontFamily: "inherit",
  },
  error: {
    background: "rgba(255,102,102,.12)",
    color: "#d24",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 10px",
    borderRadius: 10,
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  cancel: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    background: "rgba(0,0,0,.06)",
    color: "#333",
    cursor: "pointer",
  },
  save: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 5px 16px rgba(0,0,0,.18)",
    cursor: "pointer",
  },
};

/* ----------------- Единые цвета секций ----------------- */
const uxColors = {
  headerBg: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
  subPill: "rgba(139,92,246,.14)",
  border: "rgba(139,92,246,.22)",
  iconBg: "transparent",
};

/* ----------------- Микро-стили карточек ----------------- */
const ux: Record<string, any> = {
  card: {
    borderRadius: 18,
    border: "none",
    boxShadow: "0 8px 24px rgba(0,0,0,.06)",
    overflow: "hidden",
    background: "#fff",
    position: "relative",
  },
  cardHeader: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottom: "1px solid rgba(0,0,0,.06)",
  },
  iconInline: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    fontSize: 18,
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: 750, color: "#1b1b1b", lineHeight: 1.2 },
  cardHint: { fontSize: 11, color: "#2b2b2b", opacity: 0.85 },

  // новый caret
  caretWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    background: "rgba(139,92,246,.12)",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
    display: "grid",
    placeItems: "center",
    transition: "transform 0.18s ease",
  },
  caretInner: {
    width: 0,
    height: 0,
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderTop: "6px solid #4a3a7a",
  },
};

/* ----------------- Строки упражнений ----------------- */
const row: Record<string, React.CSSProperties> = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: "#fff",
    borderRadius: 10,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
  },
  left: { display: "grid", gap: 3, minWidth: 0 },
  name: { fontSize: 13.5, fontWeight: 650, color: "#111", lineHeight: 1.15, whiteSpace: "normal" },
  cues: { fontSize: 11, color: "#666" },
  metrics: { display: "grid", alignItems: "center", justifyContent: "end" },
};

/* ----------------- Капсулы метрик ----------------- */
const caps: Record<string, React.CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 6,
    justifyItems: "end",
  },
  box: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    width: 90,
    height: 28,
    padding: "0 8px",
    borderRadius: 12,
    background: "rgba(139,92,246,.08)",
    border: "none",
    fontSize: 12.5,
    lineHeight: 1,
    fontFeatureSettings: "'tnum' 1, 'lnum' 1",
    color: "#222",
    textAlign: "right",
  },
  label: {
    fontSize: 10.5,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  num: {
    letterSpacing: 0.2,
    fontWeight: 700,
    fontSize: 12.5,
  },
};

/* ----------------- Старые метрики (если где-то используются) ----------------- */
const metricLabelStyle: React.CSSProperties = {
  fontSize: 20,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "#555",
  fontWeight: 700,
};

const metricNumStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.1,
  fontWeight: 600,
  letterSpacing: 0.2,
  fontFamily:
    "'Inter Tight', 'Roboto Condensed', 'SF Compact', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif",
};

/* ----------------- Комментарий тренера styles ----------------- */
const notesStyles: Record<string, React.CSSProperties> = {
  // плавающий блок, пока план уже сгенерен
  fabWrap: {
    position: "fixed",
    right: 16,
    bottom: 88, // подняли выше нижнего меню
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    cursor: "pointer",
    zIndex: 9999,
  },

  // плавающий блок, пока генерим (нет клика, просто показывает typing)
  fabWrapLoading: {
    position: "fixed",
    right: 16,
    bottom: 88,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    zIndex: 9999,
  },

  fabCircle: {
    width: 56, // увеличили
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 10px 24px rgba(0,0,0,.2)",
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    color: "#1b1b1b",
  },

  speechBubble: {
    maxWidth: 180,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(0,0,0,.15)",
    borderRadius: 14,
    padding: "10px 12px",
    position: "relative",
    border: "1px solid rgba(0,0,0,.06)",
  },
  speechText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#1b1b1b",
    lineHeight: 1.3,
  },
  speechArrow: {
    position: "absolute",
    right: -6,
    bottom: 10,
    width: 0,
    height: 0,
    borderTop: "6px solid transparent",
    borderBottom: "6px solid transparent",
    borderLeft: "6px solid #fff",
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,.1))",
  },

  // чат-панель. без затемнения. появляется над иконкой
  chatPanelWrap: {
    position: "fixed",
    right: 16,
    bottom: 88 + 56 + 12, // fab bottom + fab size + отступ
    zIndex: 10000,
    maxWidth: 300,
    width: "calc(100% - 32px)",
  },
  chatPanel: {
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 24px 64px rgba(0,0,0,.4)",
    border: "1px solid rgba(0,0,0,.06)",
    maxHeight: "40vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "12px 12px 10px 12px",
    borderBottom: "1px solid rgba(0,0,0,.06)",
    background: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
  },
  chatHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  robotIconLarge: {
    fontSize: 20,
    lineHeight: 1,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1b1b1b",
  },
  closeBtn: {
    background: "rgba(0,0,0,0.08)",
    border: "none",
    borderRadius: 8,
    width: 28,
    height: 28,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1,
    color: "#1b1b1b",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  chatBody: {
    padding: 12,
    fontSize: 13.5,
    lineHeight: 1.4,
    color: "#1b1b1b",
    whiteSpace: "pre-wrap",
    overflowY: "auto",
  },
};
