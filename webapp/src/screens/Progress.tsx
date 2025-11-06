import { useEffect, useMemo, useState, useId, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getProgressSummary, saveBodyMetric, ProgressSummary } from "@/api/progress";
import NavBar from "@/components/NavBar";

type ChartPeriod = "week" | "month" | "quarter" | "year";

const formatWeekSeries = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN) || !value) return "0 нед.";
  return `${value} нед.`;
};

const formatWeekProgress = (done: number, goal: number | null) => {
  if (!goal || goal <= 0) return "—";
  return `${Math.min(done, goal)}/${goal}`;
};

export default function Progress() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("month");
  const [showWeightModal, setShowWeightModal] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getProgressSummary();
      setSummary(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить прогресс");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const chartData = useMemo(() => {
    if (!summary) return [];
    const limit =
      period === "week" ? 7 : period === "month" ? 30 : period === "quarter" ? 90 : 365;
    return summary.weightSeries.filter((point) => withinDays(point.date, limit));
  }, [summary, period]);

  const recentWeights = useMemo(() => {
    if (!summary) return [];
    return [...summary.weightSeries].slice(-5).reverse();
  }, [summary]);

  if (loading) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <section style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pill}>Прогресс</span>
            <span style={s.credits}>Загрузка</span>
          </div>
          <div style={s.heroTitle}>Обновляем статистику</div>
          <div style={s.heroSubtitle}>Подготовка данных о твоих достижениях</div>
        </section>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>{error || "Нет данных"}</h3>
          <button style={s.rowBtn} onClick={load}>
            Повторить
          </button>
        </section>
      </div>
    );
  }

  const stats = summary.stats;
  const currentWeight = stats.currentWeightKg != null ? Number(stats.currentWeightKg) : null;
  const activity = summary.activity;
  const weightDelta = stats.weightDelta30d != null ? Number(stats.weightDelta30d) : null;
  const weightDeltaText =
    weightDelta == null
      ? "—"
      : weightDelta === 0
      ? "0 кг"
      : `${weightDelta > 0 ? "↑" : "↓"} ${Math.abs(weightDelta).toFixed(1)} кг`;

  const workoutsDelta = stats.workoutsDelta30d;
  const workoutsDeltaText =
    workoutsDelta === 0 ? "0 за месяц" : `${workoutsDelta > 0 ? "↑" : "↓"} ${Math.abs(workoutsDelta)} за месяц`;

  const caloriesStatusLabel =
    stats.caloriesStatus === "normal"
      ? "✓ В норме"
      : stats.caloriesStatus === "deficit"
      ? "📉 Дефицит"
      : stats.caloriesStatus === "surplus"
      ? "⚠️ Превышение"
      : "—";

  return (
    <div style={s.page}>
      <SoftGlowStyles />

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Прогресс</span>
          <span style={s.credits}>Статистика</span>
        </div>
        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>
          {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div style={s.heroTitle}>Ты на пути к цели!</div>
        <div style={s.heroSubtitle}>Отслеживай свои достижения и результаты</div>

        <div style={s.heroFooter}>
          <Stat icon="⏳" label="Дней с приложением" value={`${stats.daysWithApp}`} />
          <Stat icon="🔥" label="Серия по плану" value={formatWeekSeries(stats.planSeriesCurrent)} />
          <Stat icon="🥇" label="Рекорд серии" value={formatWeekSeries(stats.planSeriesBest)} />
        </div>
        {stats.planWeeklyGoal != null && (
          <div style={s.heroPlanHint}>
            Цель на неделю: {stats.planWeeklyGoal} трен.
          </div>
        )}

        <button
          className="soft-glow"
          style={s.primaryBtn}
          onClick={() => setShowWeightModal(true)}
        >
          + Записать вес
        </button>
      </section>

      {/* Статистика */}
      <section style={s.block}>
        <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
          <div style={{ ...ux.cardHeader, background: uxColors.headerBg }}>
            <div style={ux.iconInline}>📊</div>
            <div>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>Основные метрики</div>
              </div>
              <div style={ux.cardHint}>Текущие показатели и изменения за месяц</div>
            </div>
          </div>

          <div style={{ padding: 10 }}>
            <StatsGrid
              currentWeight={currentWeight}
              weightDeltaText={weightDeltaText}
              weightDelta={weightDelta}
              workoutsTotal={stats.workoutsTotal}
              workoutsDeltaText={workoutsDeltaText}
              caloriesPerDay={stats.caloriesPerDay}
              caloriesStatusLabel={caloriesStatusLabel}
            />
          </div>
        </div>
      </section>

      {/* Динамика веса */}
      <section style={s.block}>
        <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
          <div style={{ ...ux.cardHeader, background: uxColors.headerBg }}>
            <div style={ux.iconInline}>📈</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>Динамика веса</div>
                <div style={tabs.wrap}>
                  {periodOptions.map((opt) => (
                    <button
                      key={opt.value}
                      style={period === opt.value ? tabs.active : tabs.btn}
                      onClick={() => setPeriod(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={ux.cardHint}>Следим за тем, как меняется тело</div>
            </div>
          </div>

          <div style={{ padding: 10 }}>
            {chartData.length < 2 ? (
              <EmptyState text="Добавь несколько замеров, чтобы увидеть график." />
            ) : (
              <WeightChart data={chartData} />
            )}
            {recentWeights.length > 0 && <WeightList entries={recentWeights} />}
          </div>
        </div>
      </section>

      {/* Активность */}
      <section style={s.block}>
        <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
          <div style={{ ...ux.cardHeader, background: uxColors.headerBg }}>
            <div style={ux.iconInline}>🔥</div>
            <div>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>Активность</div>
              </div>
              <div style={ux.cardHint}>
                Закрашенные дни — проведена тренировка. Серия по плану учитывает твой график.
              </div>
            </div>
          </div>

          <div style={{ padding: 10 }}>
            <ActivityLegend />
            <ActivityWeeks weeks={activity.weeks} />
            <div style={activityStats.wrap}>
              <ActivityStat label="Серия по плану" value={formatWeekSeries(activity.planSeriesCurrent)} />
              <ActivityStat label="Эта неделя" value={formatWeekProgress(activity.completedThisWeek, activity.weeklyGoal)} />
              <ActivityStat
                label="Выполнено в этом месяце"
                value={`${activity.completedThisMonth}/${activity.daysInMonth}`}
              />
            </div>
            <div style={activityStats.note}>
              Дней подряд: {activity.dayStreakCurrent} (рекорд — {activity.dayStreakBest})
            </div>
          </div>
        </div>
      </section>

      {/* Личные рекорды */}
      <section style={s.block}>
        <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
          <div style={{ ...ux.cardHeader, background: uxColors.headerBg }}>
            <div style={ux.iconInline}>🏆</div>
            <div>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>Доска достижений</div>
              </div>
              <div style={ux.cardHint}>Награды обновляются автоматически по твоим результатам</div>
            </div>
          </div>

          <div style={{ padding: 10 }}>
            {summary.achievements.length === 0 ? (
              <EmptyState text="Продолжай тренироваться — награды появятся автоматически." />
            ) : (
              <AchievementsGrid items={summary.achievements} />
            )}
          </div>
        </div>
      </section>

      <div style={{ height: 72 }} />
      <NavBar
        current="none"
        onChange={(t) => {
          if (t === "home") navigate("/");
          if (t === "plan") navigate("/plan/one");
          if (t === "nutrition") navigate("/nutrition");
          if (t === "profile") navigate("/profile");
        }}
      />

      {showWeightModal && (
        <WeightModal
          onClose={() => setShowWeightModal(false)}
          onSave={async (payload) => {
            try {
              await saveBodyMetric(payload);
              setShowWeightModal(false);
              await load();
            } catch {
              alert("Не удалось сохранить замер");
            }
          }}
        />
      )}
    </div>
  );
}

function withinDays(dateIso: string, days: number) {
  const target = new Date(dateIso);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return target >= threshold;
}

function formatDate(dateIso: string) {
  const dt = new Date(dateIso);
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const periodOptions: Array<{ value: ChartPeriod; label: string }> = [
  { value: "week", label: "7д" },
  { value: "month", label: "30д" },
  { value: "quarter", label: "90д" },
  { value: "year", label: "Год" },
];

function StatsGrid({
  currentWeight,
  weightDeltaText,
  weightDelta,
  workoutsTotal,
  workoutsDeltaText,
  caloriesPerDay,
  caloriesStatusLabel,
}: {
  currentWeight: number | null;
  weightDeltaText: string;
  weightDelta: number | null;
  workoutsTotal: number;
  workoutsDeltaText: string;
  caloriesPerDay: number | null;
  caloriesStatusLabel: string;
}) {
  return (
    <div style={statsGrid.wrap}>
      <StatCard
        icon="⚖️"
        label="Текущий вес"
        value={currentWeight != null ? `${currentWeight.toFixed(1)} кг` : "—"}
        hint={weightDeltaText}
        hintTone={weightDelta == null ? "muted" : weightDelta <= 0 ? "positive" : "negative"}
      />
      <StatCard
        icon="🏋️"
        label="Тренировки"
        value={`${workoutsTotal}`}
        hint={workoutsDeltaText}
        hintTone={workoutsDeltaText.startsWith("↑") ? "positive" : workoutsDeltaText.startsWith("↓") ? "negative" : "muted"}
      />
      <StatCard
        icon="🔥"
        label="Калории/день"
        value={caloriesPerDay ? `${caloriesPerDay} ккал` : "—"}
        hint={caloriesStatusLabel}
        hintTone={caloriesStatusLabel.includes("✓") ? "positive" : caloriesStatusLabel.includes("⚠️") ? "negative" : "muted"}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  hintTone = "muted",
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  hintTone?: "positive" | "negative" | "muted";
}) {
  return (
    <div style={statsGrid.card}>
      <div style={statsGrid.icon}>{icon}</div>
      <div style={statsGrid.label}>{label}</div>
      <div style={statsGrid.value}>{value}</div>
      <div
        style={{
          ...statsGrid.hint,
          color: hintTone === "positive" ? "#047857" : hintTone === "negative" ? "#dc2626" : "#64748b",
        }}
      >
        {hint}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

function WeightList({ entries }: { entries: Array<{ date: string; weight: number }> }) {
  return (
    <div style={weightsList.wrap}>
      <div style={weightsList.title}>Последние замеры</div>
      <div style={weightsList.items}>
        {entries.map((entry) => (
          <div key={entry.date} style={weightsList.item}>
            <div style={weightsList.date}>{formatDate(entry.date)}</div>
            <div style={weightsList.value}>{entry.weight.toFixed(1)} кг</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityLegend() {
  return (
    <div style={legend.wrap}>
      <LegendItem color="linear-gradient(135deg,#6366f1,#a855f7)" label="Тренировка выполнена" />
      <LegendItem color="#e2e8f0" label="День отдыха" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={legend.item}>
      <span style={{ ...legend.swatch, background: color }} />
      <span>{label}</span>
    </div>
  );
}

function ActivityWeeks({ weeks }: { weeks: ProgressSummary["activity"]["weeks"] }) {
  if (!weeks || weeks.length === 0) {
    return <EmptyState text="Еще нет активных дней. Тренируйся и возвращайся!" />;
  }

  return (
    <div style={activityWrap}>
      {weeks.map((week) => (
        <div key={week.label} style={activityColumn}>
          <div style={activityLabel}>{week.label}</div>
          <div style={activityDaysGrid}>
            {week.days.map((day) => (
              <div
                key={day.date}
                style={{
                  ...activityDayCell,
                  background: day.completed ? "linear-gradient(135deg,#6366f1,#a855f7)" : "#e2e8f0",
                }}
                title={`${formatDate(day.date)} — ${day.completed ? "тренировка" : "отдых"}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={activityStatCard}>
      <div style={activityStatLabel}>{label}</div>
      <div style={activityStatValue}>{value}</div>
    </div>
  );
}

function AchievementsGrid({ items }: { items: ProgressSummary["achievements"] }) {
  return (
    <div style={achievementsGrid.wrap}>
      {items.map((item) => (
        <div key={item.id} style={achievementsGrid.card}>
          <div style={achievementsGrid.badge}>
            <BadgeIcon badge={item.badge} fallback={item.icon} />
          </div>
          <div style={achievementsGrid.body}>
            <div style={achievementsGrid.title}>{item.title}</div>
            <div style={achievementsGrid.desc}>{item.description}</div>
            {item.value ? <div style={achievementsGrid.value}>{item.value}</div> : null}
            {item.earnedAt ? <div style={achievementsGrid.meta}>{formatDate(item.earnedAt)}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

type MedalPalette = {
  ring: string;
  base: string;
  core: string;
  ribbonLeft: string;
  ribbonRight: string;
  highlight: string;
};

type ShieldPalette = {
  top: string;
  bottom: string;
  stroke: string;
  accent: string;
  text: string;
};

const medalPalettes: Record<string, MedalPalette> = {
  "medal-gold": {
    ring: "#f59e0b",
    base: "#facc15",
    core: "#fef3c7",
    ribbonLeft: "#3b82f6",
    ribbonRight: "#2563eb",
    highlight: "rgba(255,255,255,0.6)",
  },
  "medal-silver": {
    ring: "#64748b",
    base: "#cbd5f5",
    core: "#f8fafc",
    ribbonLeft: "#64748b",
    ribbonRight: "#475569",
    highlight: "rgba(255,255,255,0.7)",
  },
  "medal-bronze": {
    ring: "#b45309",
    base: "#d97706",
    core: "#fde68a",
    ribbonLeft: "#92400e",
    ribbonRight: "#854d0e",
    highlight: "rgba(255,255,255,0.35)",
  },
  "medal-purple": {
    ring: "#7c3aed",
    base: "#a855f7",
    core: "#f5f3ff",
    ribbonLeft: "#4338ca",
    ribbonRight: "#4c1d95",
    highlight: "rgba(255,255,255,0.45)",
  },
  "medal-blue": {
    ring: "#2563eb",
    base: "#3b82f6",
    core: "#eff6ff",
    ribbonLeft: "#1d4ed8",
    ribbonRight: "#1e3a8a",
    highlight: "rgba(255,255,255,0.45)",
  },
  "medal-green": {
    ring: "#16a34a",
    base: "#22c55e",
    core: "#dcfce7",
    ribbonLeft: "#15803d",
    ribbonRight: "#166534",
    highlight: "rgba(255,255,255,0.45)",
  },
  "medal-default": {
    ring: "#4b5563",
    base: "#94a3b8",
    core: "#e2e8f0",
    ribbonLeft: "#475569",
    ribbonRight: "#334155",
    highlight: "rgba(255,255,255,0.4)",
  },
};

const volumePalettes: Record<string, ShieldPalette> = {
  "1": { top: "#6366f1", bottom: "#4f46e5", stroke: "#c7d2fe", accent: "#a5b4fc", text: "#eef2ff" },
  "10": { top: "#7c3aed", bottom: "#6d28d9", stroke: "#c084fc", accent: "#a855f7", text: "#f3e8ff" },
  "25": { top: "#9333ea", bottom: "#7e22ce", stroke: "#d8b4fe", accent: "#c084fc", text: "#faf5ff" },
  "50": { top: "#c026d3", bottom: "#a21caf", stroke: "#f0abfc", accent: "#f5d0fe", text: "#fdf4ff" },
  "100": { top: "#e11d48", bottom: "#be123c", stroke: "#fbcfe8", accent: "#fda4af", text: "#fff1f2" },
  default: { top: "#475569", bottom: "#334155", stroke: "#cbd5f5", accent: "#a5b4fc", text: "#e2e8f0" },
};

const planPalettes: Record<string, ShieldPalette> = {
  "1": { top: "#10b981", bottom: "#059669", stroke: "#a7f3d0", accent: "#6ee7b7", text: "#ecfdf5" },
  "4": { top: "#0ea5e9", bottom: "#0284c7", stroke: "#bae6fd", accent: "#7dd3fc", text: "#f0f9ff" },
  "8": { top: "#2563eb", bottom: "#1d4ed8", stroke: "#bfdbfe", accent: "#93c5fd", text: "#eff6ff" },
  "12": { top: "#4338ca", bottom: "#312e81", stroke: "#c7d2fe", accent: "#a5b4fc", text: "#ede9fe" },
  default: { top: "#475569", bottom: "#334155", stroke: "#cbd5f5", accent: "#a5b4fc", text: "#e2e8f0" },
};

const streakPalettes: Record<string, ShieldPalette> = {
  "3": { top: "#fb7185", bottom: "#f43f5e", stroke: "#fecdd3", accent: "#fda4af", text: "#fff1f2" },
  "7": { top: "#f97316", bottom: "#ea580c", stroke: "#fed7aa", accent: "#fdba74", text: "#fff7ed" },
  "14": { top: "#ef4444", bottom: "#dc2626", stroke: "#fecaca", accent: "#fca5a5", text: "#fff5f5" },
  default: { top: "#f97316", bottom: "#ea580c", stroke: "#fed7aa", accent: "#fdba74", text: "#fff7ed" },
};

function BadgeIcon({ badge, fallback }: { badge?: string | null; fallback?: string | null }) {
  const id = useId();

  if (!badge) {
    return <span style={achievementsGrid.fallback}>{fallback ?? "★"}</span>;
  }

  if (badge.startsWith("medal")) {
    const palette = medalPalettes[badge] ?? medalPalettes["medal-default"];
    const gradientId = `${id}-medal`;
    const highlightId = `${id}-medal-highlight`;
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-hidden="true">
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor={palette.core} />
            <stop offset="70%" stopColor={palette.base} />
            <stop offset="100%" stopColor={palette.ring} />
          </radialGradient>
          <radialGradient id={highlightId} cx="30%" cy="25%" r="50%">
            <stop offset="0%" stopColor={palette.highlight} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <path d="M18 6 L24 6 L28 18 L20 18 Z" fill={palette.ribbonLeft} />
        <path d="M32 6 L38 6 L36 18 L28 18 Z" fill={palette.ribbonRight} />
        <circle cx="28" cy="30" r="18" fill={`url(#${gradientId})`} stroke={palette.ring} strokeWidth="2" />
        <circle cx="24" cy="24" r="7" fill={`url(#${highlightId})`} opacity="0.6" />
        <path
          d="M28 17 L30.8 24 L38 24.8 L32.4 29.2 L34.2 36 L28 32.4 L21.8 36 L23.6 29.2 L18 24.8 L25.2 24 Z"
          fill={palette.ring}
          opacity="0.9"
        />
      </svg>
    );
  }

  if (badge.startsWith("volume")) {
    const level = badge.split("-")[1] ?? "";
    const palette = volumePalettes[level] ?? volumePalettes.default;
    const gradientId = `${id}-volume`;
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
        </defs>
        <path d="M28 4 L46 12 V30 C46 38 39 45 28 50 C17 45 10 38 10 30 V12 Z" fill={`url(#${gradientId})`} stroke={palette.stroke} strokeWidth="2" />
        <path
          d="M28 10 L40 15 V30 C40 35 35 40 28 43 C21 40 16 35 16 30 V15 Z"
          fill={palette.accent}
          opacity="0.35"
        />
        <text
          x="28"
          y="31"
          textAnchor="middle"
          fontWeight={700}
          fontSize={level.length > 2 ? 12 : 14}
          fill={palette.text}
        >
          {level}
        </text>
      </svg>
    );
  }

  if (badge.startsWith("plan")) {
    const level = badge.split("-")[1] ?? "";
    const palette = planPalettes[level] ?? planPalettes.default;
    const gradientId = `${id}-plan`;
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
        </defs>
        <path
          d="M28 4 L46 12 V30 C46 38 39 45 28 50 C17 45 10 38 10 30 V12 Z"
          fill={`url(#${gradientId})`}
          stroke={palette.stroke}
          strokeWidth="2"
        />
        <path
          d="M20 18 H36 V22 H20 Z"
          fill={palette.accent}
          opacity="0.6"
        />
        <path
          d="M20 24 H36 V28 H20 Z"
          fill={palette.accent}
          opacity="0.35"
        />
        <path
          d="M22 30 L27 35 L36 24"
          fill="none"
          stroke={palette.text}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (badge.startsWith("streak")) {
    const level = badge.split("-")[1] ?? "";
    const palette = streakPalettes[level] ?? streakPalettes.default;
    const gradientId = `${id}-streak`;
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
        </defs>
        <circle cx="28" cy="28" r="22" fill={`url(#${gradientId})`} stroke={palette.stroke} strokeWidth="2" />
        <path
          d="M28 14 C32 20 36 19 36 25 C36 30 32.5 33.5 28 38 C23.5 33.5 20 30 20 25 C20 19 24 20 28 14 Z"
          fill={palette.accent}
          opacity="0.7"
        />
        <path
          d="M28 18 C29.8 21 32 21 32 24 C32 26.5 30.5 28 28 30.5 C25.5 28 24 26.5 24 24 C24 21 26.2 21 28 18 Z"
          fill={palette.text}
          opacity="0.9"
        />
      </svg>
    );
  }

  return <span style={achievementsGrid.fallback}>{fallback ?? "★"}</span>;
}

type WeightPayload = { weight: number; recordedAt: string; notes?: string };

function WeightModal({ onClose, onSave }: { onClose: () => void; onSave: (payload: WeightPayload) => Promise<void> }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const numericWeight = Number(weight.replace(",", "."));
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      alert("Введи корректный вес.");
      return;
    }
    setSaving(true);
    await onSave({ recordedAt: date, weight: numericWeight, notes: notes.trim() || undefined });
    setSaving(false);
  };

  return (
    <div style={modal.overlay} onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={modal.card}>
        <div style={modal.header}>
          <h3 style={modal.title}>Записать вес</h3>
          <button style={modal.close} onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <label style={modal.label}>
          <span>Дата</span>
          <input style={modal.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={modal.label}>
          <span>Вес (кг)</span>
          <input
            style={modal.input}
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Например, 80.5"
          />
        </label>
        <label style={modal.label}>
          <span>Заметка (опционально)</span>
          <textarea
            style={{ ...modal.input, height: 80, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Как чувствуешь себя сегодня?"
          />
        </label>
        <button style={modal.saveBtn} onClick={handleSubmit} disabled={saving}>
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

function WeightChart({ data }: { data: Array<{ date: string; weight: number }> }) {
  const width = Math.max(520, data.length * 70);
  const height = 240;
  const paddingX = 48;
  const paddingY = 28;
  const minWeight = Math.min(...data.map((d) => d.weight));
  const maxWeight = Math.max(...data.map((d) => d.weight));
  const range = maxWeight - minWeight || 1;

  const points = data.map((point, idx) => {
    const x = paddingX + (idx / Math.max(1, data.length - 1)) * (width - paddingX * 2);
    const y = paddingY + ((maxWeight - point.weight) / range) * (height - paddingY * 2);
    return { x, y, label: point.weight.toFixed(1), date: formatDate(point.date) };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="chartLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <linearGradient id="chartFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.35)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </linearGradient>
        </defs>

        <path
          d={`M${paddingX},${height - paddingY} L${polylinePoints.replace(/ /g, " L")} L${width - paddingX},${height - paddingY} Z`}
          fill="url(#chartFill)"
          stroke="none"
        />
        <polyline points={polylinePoints} fill="none" stroke="url(#chartLine)" strokeWidth={3} strokeLinecap="round" />

        {points.map((p) => (
          <g key={`${p.date}-${p.label}`}>
            <circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke="#6366f1" strokeWidth={3} />
            <text x={p.x} y={p.y - 12} fill="#312e81" fontSize="10" fontWeight={600} textAnchor="middle">
              {p.label}
            </text>
            <text x={p.x} y={height - 6} fill="#475569" fontSize="11" textAnchor="middle">
              {p.date}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
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

/* ===================== Стили ===================== */

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
  heroPlanHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(255,255,255,0.85)",
  },
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
};

const uxColors = {
  headerBg: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
};

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
};

const statsGrid = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    gap: 10,
  },
  card: {
    borderRadius: 14,
    padding: 12,
    background: "linear-gradient(135deg, rgba(114,135,255,.08), rgba(164,94,255,.06))",
    border: "1px solid rgba(114,135,255,.15)",
    minHeight: 110,
  },
  icon: {
    fontSize: 20,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    color: "#555",
    fontWeight: 600,
  },
  value: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: 800,
    color: "#1b1b1b",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 600,
  },
};

const tabs = {
  wrap: {
    display: "flex",
    gap: 6,
    background: "rgba(114,135,255,.12)",
    padding: 4,
    borderRadius: 999,
  },
  btn: {
    border: "none",
    background: "transparent",
    padding: "5px 10px",
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 11,
    color: "#475569",
    cursor: "pointer",
  },
  active: {
    border: "none",
    background: "#6366f1",
    padding: "5px 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 11,
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
  },
};

const weightsList = {
  wrap: {
    marginTop: 14,
    background: "linear-gradient(135deg, rgba(114,135,255,.06), rgba(164,94,255,.04))",
    borderRadius: 14,
    padding: 12,
    border: "1px solid rgba(114,135,255,.12)",
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    marginBottom: 10,
  },
  items: {
    display: "grid",
    gap: 8,
  },
  item: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#1f2937",
  },
  date: {
    opacity: 0.75,
  },
  value: {
    fontWeight: 700,
  },
};

const legend = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#475569",
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    display: "inline-block",
  },
};

const activityWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 16,
  marginBottom: 18,
};

const activityColumn: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const activityLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
};

const activityDaysGrid: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(114,135,255,.06), rgba(164,94,255,.04))",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 6,
  border: "1px solid rgba(114,135,255,.12)",
};

const activityDayCell: React.CSSProperties = {
  width: "100%",
  paddingBottom: "100%",
  borderRadius: 6,
};

const activityStats = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
    gap: 12,
  },
  note: {
    marginTop: 12,
    fontSize: 12,
    color: "#64748b",
  },
};

const activityStatCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(114,135,255,.06), rgba(164,94,255,.04))",
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(114,135,255,.12)",
};

const activityStatLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 600,
};

const activityStatValue: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  marginTop: 4,
  color: "#1b1b1b",
};

const achievementsGrid = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
    gap: 12,
  },
  card: {
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(114,135,255,.08), rgba(164,94,255,.06))",
    padding: 14,
    display: "grid",
    gridTemplateColumns: "64px 1fr",
    gap: 14,
    boxShadow: "0 4px 12px rgba(114,135,255,0.15)",
    border: "1px solid rgba(114,135,255,.15)",
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "linear-gradient(135deg, rgba(226,232,240,.6), rgba(203,213,225,.4))",
    border: "1px solid rgba(148,163,184,.45)",
    display: "grid",
    placeItems: "center",
  } as React.CSSProperties,
  body: {
    display: "grid",
    gap: 4,
    alignContent: "start",
  } as React.CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
  },
  desc: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.4,
  } as React.CSSProperties,
  value: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: 700,
    color: "#6366f1",
  },
  meta: {
    marginTop: 6,
    fontSize: 11,
    color: "#94a3b8",
  },
  fallback: {
    fontSize: 28,
    filter: "drop-shadow(0 2px 4px rgba(99,102,241,0.2))",
  },
};

const modal = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 1000,
  } as React.CSSProperties,
  card: {
    width: "min(420px, 100%)",
    background: "#fff",
    borderRadius: 20,
    padding: 22,
    boxShadow: "0 28px 50px rgba(15,23,42,0.4)",
    display: "grid",
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  },
  close: {
    border: "none",
    background: "none",
    fontSize: 22,
    cursor: "pointer",
    color: "#94a3b8",
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#1f2937",
  } as React.CSSProperties,
  input: {
    borderRadius: 14,
    border: "1px solid rgba(114,135,255,.2)",
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    background: "#f8fafc",
  } as React.CSSProperties,
  saveBtn: {
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 700,
    cursor: "pointer",
    background: "linear-gradient(135deg,#6366f1,#a855f7)",
    color: "#fff",
  },
};

const emptyStyle: React.CSSProperties = {
  padding: "24px 0",
  color: "#94a3b8",
  fontSize: 13,
  textAlign: "center",
};
