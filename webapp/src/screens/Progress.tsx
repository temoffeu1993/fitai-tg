// Progress — product-ready, beginner-friendly
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProgressSummary, saveBodyMetric,
  readProgressCache, type ProgressSummaryV2,
} from "@/api/progress";
import NavBar from "@/components/NavBar";
import avatarImg from "@/assets/robonew.webp";
import mascotImg from "@/assets/morobot.webp";
import { Clock3, Weight, Flame, Target, Trophy, Scale, Award, Check, Dumbbell, Zap } from "lucide-react";

// ─── Visual constants (WorkoutResult-consistent) ────────────────────────────

const GROOVE_BG = "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)";
const GROOVE_SHADOW = "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)";
const FILL_BG = "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)";
const FILL_SHADOW = "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)";

// Flat solid colors for muscle focus bars — same Tailwind 400 level as TOD_COLORS
const MUSCLE_FOCUS_COLORS: Record<string, string> = {
  "Грудь":    "#60a5fa", // blue-400
  "Спина":    "#fbbf24", // amber-400
  "Ноги":     "#f87171", // red-400
  "Ягодицы":  "#fb923c", // orange-400
  "Плечи":    "#a78bfa", // violet-400
  "Руки":     "#f472b6", // pink-400
  "Пресс":    "#38bdf8", // sky-400
};

// ─── Russian pluralization ───────────────────────────────────────────────────

function ruForm(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(n);
  if (abs % 10 === 1 && abs % 100 !== 11) return one;
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return few;
  return many;
}

// ─── Haptic ──────────────────────────────────────────────────────────────────

function fireHaptic(style: "light" | "medium" = "light") {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
    else if (navigator.vibrate) navigator.vibrate(style === "light" ? 30 : 60);
  } catch { }
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

function ProgressStyles() {
  return (
    <style>{`
      @keyframes progFadeUp {
        0% { opacity: 0; transform: translateY(14px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes milePulse {
        0%,100% { transform: scale(1); box-shadow: ${GROOVE_SHADOW} }
        50%     { transform: scale(1.18); box-shadow: ${GROOVE_SHADOW}, 0 0 0 4px rgba(59,130,246,0.2) }
      }
      @keyframes shimmer {
        0%   { background-position: -200% 0 }
        100% { background-position:  200% 0 }
      }
      .fade0 { animation: progFadeUp 520ms ease-out 0ms   both }
      .fade1 { animation: progFadeUp 520ms ease-out 80ms  both }
      .fade2 { animation: progFadeUp 520ms ease-out 160ms both }
      .fade3 { animation: progFadeUp 520ms ease-out 240ms both }
      .fade4 { animation: progFadeUp 520ms ease-out 320ms both }
      .fade5 { animation: progFadeUp 520ms ease-out 400ms both }
      .fade6 { animation: progFadeUp 520ms ease-out 480ms both }
      .mile-pulse { animation: milePulse 1.6s ease-in-out infinite }
      .skel {
        background: linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s ease-in-out infinite;
        border-radius: 20px;
      }
      @media (prefers-reduced-motion: reduce) {
        .fade0,.fade1,.fade2,.fade3,.fade4,.fade5,.fade6,.mile-pulse,.skel { animation: none }
      }
    `}</style>
  );
}

// ─── Primitive components ────────────────────────────────────────────────────

function Card({ children, style, className }: { children: React.ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={className} style={{ ...s.card, ...style }}>{children}</div>;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      {icon}
      <span style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>{title}</span>
    </div>
  );
}

function GrooveBar({ percent, height = 8, style }: { percent: number; height?: number; style?: CSSProperties }) {
  return (
    <div style={{ borderRadius: 999, height, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, overflow: "hidden", ...style }}>
      <div style={{
        height: "100%",
        width: `${Math.min(100, Math.max(0, percent))}%`,
        background: FILL_BG, boxShadow: FILL_SHADOW,
        borderRadius: 999, transition: "width 700ms cubic-bezier(0.22,1,0.36,1)",
      }} />
    </div>
  );
}

function Skel({ h }: { h: number }) {
  return <div className="skel" style={{ height: h }} />;
}

// ─── Header ──────────────────────────────────────────────────────────────────

function dayLabel(d: number): string {
  if (d === 1) return "Первый день с Моро";
  if (d === 2) return "Второй день с Моро";
  if (d === 3) return "Третий день с Моро";
  return `${d} ${ruForm(d, "день", "дня", "дней")} с Моро`;
}

function ProgressHeader({ daysWithApp }: { daysWithApp: number }) {
  const d = daysWithApp;
  return (
    <div className="fade0" style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={s.avatarCircle}>
        <img src={avatarImg} alt="Моро" style={s.avatarImg} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#1e1f22", lineHeight: 1.2 }}>
          {dayLabel(d)}
        </span>
        <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(30,31,34,0.7)", marginTop: 3, lineHeight: 1.4 }}>
          Отслеживайте свой прогресс
        </div>
      </div>
    </div>
  );
}

// ─── Stat Pill ───────────────────────────────────────────────────────────────

function StatPill({ workoutsTotal, totalMinutes, totalTonnage, userGoal }: {
  workoutsTotal: number;
  totalMinutes: number;
  totalTonnage: number;
  userGoal: string;
}) {
  const showCalories = userGoal === "lose_weight";
  const calories = Math.round(totalMinutes * 6);
  return (
    <div className="fade1" style={s.statPill}>
      <span style={s.statChip}>
        <Dumbbell size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />
        <span>{workoutsTotal}</span>
      </span>
      <span style={s.statChip}>
        <Clock3 size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />
        <span>{totalMinutes > 0 ? `${totalMinutes} мин` : "—"}</span>
      </span>
      <span style={s.statChip}>
        {showCalories
          ? <Flame size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />
          : <Weight size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />}
        <span>{showCalories
          ? (calories > 0 ? `~${calories.toLocaleString("ru-RU")} ккал` : "—")
          : (totalTonnage > 0 ? `${totalTonnage.toLocaleString("ru-RU")} кг` : "—")}
        </span>
      </span>
    </div>
  );
}

// ─── Section 1: Активность ───────────────────────────────────────────────────

// Flat solid colors for time-of-day activity cells — Tailwind 400 level
const TOD_COLORS: Record<string, string> = {
  morning: "#60a5fa",   // blue-400
  afternoon: "#818cf8", // indigo-400
  evening: "#a78bfa",   // violet-400
};


function ActivitySection({ activity }: { activity: ProgressSummaryV2["activity"] }) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayMap = new Map(
    (activity.days ?? []).map((d) => [d.date, d] as const),
  );

  // Build 12-week grid (cols = weeks, rows = Mon–Sun)
  const todayDow = (today.getDay() + 6) % 7; // 0=Mon
  const gridStart = new Date(today);
  gridStart.setDate(today.getDate() - todayDow - 77); // 11 full weeks before current Mon

  type Cell = { date: string; timeOfDay: "morning" | "afternoon" | "evening" | null };
  const weeks: Cell[][] = [];
  for (let w = 0; w < 12; w++) {
    const col: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(gridStart);
      dt.setDate(gridStart.getDate() + w * 7 + d);
      const iso = dt.toISOString().slice(0, 10);
      const entry = dayMap.get(iso);
      col.push({
        date: iso,
        timeOfDay: entry?.completed ? (entry.timeOfDay ?? "evening") : null,
      });
    }
    weeks.push(col);
  }

  const DAY_LABELS = ["пн", "", "ср", "", "пт", "", "вс"];
  const GAP = 3;

  return (
    <Card className="fade3">
      {/* Title — matches MuscleFocusSection */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Zap size={18} color="#0f172a" strokeWidth={2.5} />
        <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Активность</span>
      </div>

      {/* Grid: 7 rows (Mon–Sun), each row = label + 12 cells */}
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
        {Array.from({ length: 7 }, (_, dayIdx) => (
          <div key={dayIdx} style={{ display: "flex", gap: GAP, alignItems: "center" }}>
            <div style={{
              width: 18, flexShrink: 0, marginRight: 6,
              fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)",
              textAlign: "right", lineHeight: 1,
            }}>{DAY_LABELS[dayIdx]}</div>
            {weeks.map((col, wi) => {
              const cell = col[dayIdx];
              const isToday = cell.date === todayIso;
              const hasTod = cell.timeOfDay != null;
              const color = hasTod ? TOD_COLORS[cell.timeOfDay!] : undefined;
              return (
                <div
                  key={cell.date}
                  style={{
                    flex: 1, aspectRatio: "1", borderRadius: 3,
                    background: color || GROOVE_BG,
                    boxShadow: isToday
                      ? `${hasTod ? "" : GROOVE_SHADOW + ", "}0 0 0 2px rgba(59,130,246,0.55)`
                      : hasTod ? undefined : GROOVE_SHADOW,
                    transition: "background 300ms",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend below — aligned with grid cells */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, paddingLeft: 25 }}>
        {([
          ["morning", "утро"],
          ["afternoon", "день"],
          ["evening", "вечер"],
        ] as const).map(([key, label]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: TOD_COLORS[key] }} />
            <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)" }}>{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Section 2: Инсайт готовности (маскот + бабл) ────────────────────────────

function ReadinessInsightSection({ peakReadiness }: { peakReadiness: ProgressSummaryV2["peakReadiness"] }) {
  const todLabel: Record<string, string> = { morning: "утром", afternoon: "днём", evening: "вечером" };

  let text: string;
  if (!peakReadiness.hasEnoughData) {
    text = "Заполняйте чекин перед тренировкой, так я смогу определить, в какое время дня вы в лучшей форме.";
  } else if (peakReadiness.bestTimeOfDay) {
    text = `Заметил закономерность — ${todLabel[peakReadiness.bestTimeOfDay]} ваш организм готов к нагрузке больше всего.`;
  } else {
    text = "Ваше самочувствие стабильно в любое время дня.";
  }

  return (
    <>
      <style>{`
        .readiness-bubble:before {
          content: "";
          position: absolute;
          right: -8px;
          top: 18px;
          width: 0;
          height: 0;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-left: 8px solid rgba(255,255,255,0.9);
          filter: drop-shadow(1px 0 0 rgba(15, 23, 42, 0.12));
        }
      `}</style>
      <div className="fade4" style={{
        display: "grid", gridTemplateColumns: "1fr auto",
        alignItems: "center", gap: 12,
      }}>
        <div className="readiness-bubble" style={{
          position: "relative",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.6)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
          color: "#0f172a",
          boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: "#0f172a" }}>{text}</span>
        </div>
        <img src={mascotImg} alt="Моро" style={{ width: 100, height: "auto", objectFit: "contain" as const }} />
      </div>
    </>
  );
}

// ─── Section 3: Акцент по мышцам ─────────────────────────────────────────────

type MuscleAccentPeriodKey = keyof ProgressSummaryV2["muscleAccent"];

const MUSCLE_PERIOD_OPTIONS: Array<{ key: MuscleAccentPeriodKey; label: string }> = [
  { key: "last7d", label: "7 д" },
  { key: "last30d", label: "30 д" },
  { key: "all", label: "Все" },
];

function getPreferredMusclePeriod(muscleAccent: ProgressSummaryV2["muscleAccent"]): MuscleAccentPeriodKey {
  if (muscleAccent.last7d?.length) return "last7d";
  if (muscleAccent.last30d?.length) return "last30d";
  if (muscleAccent.all?.length) return "all";
  return "last30d";
}

function MuscleFocusSection({ muscleAccent }: { muscleAccent: ProgressSummaryV2["muscleAccent"] }) {
  const preferredPeriod = getPreferredMusclePeriod(muscleAccent);
  const [period, setPeriod] = useState<MuscleAccentPeriodKey>(preferredPeriod);

  useEffect(() => {
    if (!muscleAccent[period]?.length) setPeriod(preferredPeriod);
  }, [muscleAccent, period, preferredPeriod]);

  const hasAnyData =
    muscleAccent.last7d.length > 0 ||
    muscleAccent.last30d.length > 0 ||
    muscleAccent.all.length > 0;
  if (!hasAnyData) return null;

  const items = muscleAccent[period]?.length > 0 ? muscleAccent[period] : muscleAccent[preferredPeriod];
  if (!items.length) return null;

  const maxPercent = items[0]?.percent ?? 1;

  return (
    <Card className="fade2">
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Flame size={18} color="#0f172a" strokeWidth={2.5} />
        <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Акцент по мышцам</span>
      </div>

      {/* Period segmented chip */}
      <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 3, marginBottom: 18 }}>
        {MUSCLE_PERIOD_OPTIONS.map((option) => {
          const enabled = muscleAccent[option.key]?.length > 0;
          const active = period === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={!enabled}
              onClick={() => {
                if (!enabled) return;
                fireHaptic("light");
                setPeriod(option.key);
              }}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.45,
                cursor: enabled ? "pointer" : "default",
                opacity: enabled ? 1 : 0.38,
                background: active ? "rgba(196,228,178,0.38)" : "transparent",
                boxShadow: active
                  ? "inset 0 2px 3px rgba(78,122,58,0.08), inset 0 -1px 0 rgba(255,255,255,0.22)"
                  : "none",
                color: active ? "#2a5218" : "rgba(15,23,42,0.62)",
                transition: "background 200ms ease, box-shadow 200ms ease, color 200ms ease",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Horizontal bar chart */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "8px 8px", alignItems: "center" }}>
        {items.map((item) => (
          <Fragment key={item.muscle}>
            <span style={{
              fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45,
              whiteSpace: "nowrap",
            }}>
              {item.muscle}
            </span>
            <div style={{ height: 16, borderRadius: 10, background: "transparent", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.max(8, Math.round((item.percent / maxPercent) * 100))}%`,
                borderRadius: 10,
                transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
                background: MUSCLE_FOCUS_COLORS[item.muscle] || "#94a3b8",
              }} />
            </div>
            <span style={{
              fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45,
              textAlign: "right", fontVariantNumeric: "tabular-nums",
            }}>
              {item.percent}%
            </span>
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

// ─── Section: Прогресс упражнений ─────────────────────────────────────────────

type ExPeriod = "30d" | "90d" | "year";
const EX_PERIOD_OPTIONS: { key: ExPeriod; label: string; days: number }[] = [
  { key: "30d", label: "30д", days: 30 },
  { key: "90d", label: "90д", days: 90 },
  { key: "year", label: "Год", days: 365 },
];

const METRIC_UNIT: Record<string, string> = {
  weight: "кг",
  reps: "повт",
  duration: "сек",
  assistance: "кг",
};

function ExerciseProgressChart({ points, metric }: {
  points: Array<{ date: string; value: number; estimated1RM?: number }>;
  metric: "value" | "1rm";
}) {
  // In 1RM mode, only use points that have estimated1RM (no fallback to value)
  const effective = metric === "1rm" ? points.filter((p) => p.estimated1RM != null) : points;
  const values = effective.map((p) => metric === "1rm" ? p.estimated1RM! : p.value);
  if (values.length < 2) return null;

  const W = 300, H = 120;
  const padX = 6, padY = 10;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const coords = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * (W - padX * 2),
    y: padY + (1 - (v - minV) / range) * (H - padY * 2),
  }));

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const polygonPts = polyline + ` ${coords[coords.length - 1].x.toFixed(1)},${H} ${coords[0].x.toFixed(1)},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="exChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(30,31,34,0.15)" />
          <stop offset="100%" stopColor="rgba(30,31,34,0)" />
        </linearGradient>
      </defs>
      <polygon points={polygonPts} fill="url(#exChartGrad)" />
      <polyline points={polyline} fill="none" stroke="#1e1f22" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 3} fill={i === coords.length - 1 ? "#1e1f22" : "#3a3b40"} />
      ))}
    </svg>
  );
}

const MOCK_EXERCISE_POINTS = [
  { date: "2025-12-01", value: 40 },
  { date: "2025-12-15", value: 42.5 },
  { date: "2026-01-02", value: 45 },
  { date: "2026-01-14", value: 45 },
  { date: "2026-01-28", value: 47.5 },
  { date: "2026-02-08", value: 50 },
  { date: "2026-02-22", value: 52.5 },
  { date: "2026-03-05", value: 55 },
];

function ExerciseProgressSection({ exerciseProgress }: { exerciseProgress: ProgressSummaryV2["exerciseProgress"] }) {
  const exercises = exerciseProgress?.exercises;
  const hasData = exercises && exercises.length > 0;

  if (!hasData) {
    return (
      <Card className="fade3">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Dumbbell size={18} color="#0f172a" strokeWidth={2.5} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Прогресс упражнений</span>
        </div>
        <div style={{ position: "relative" }}>
          {/* Blurred mock chart */}
          <div style={{ filter: "blur(6px)", opacity: 0.45, pointerEvents: "none" }}>
            <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 3, marginBottom: 14 }}>
              {EX_PERIOD_OPTIONS.map((opt) => (
                <span key={opt.key} style={{ borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: 600, color: "rgba(15,23,42,0.62)", background: opt.key === "90d" ? "rgba(196,228,178,0.38)" : "transparent" }}>
                  {opt.label}
                </span>
              ))}
            </div>
            <ExerciseProgressChart points={MOCK_EXERCISE_POINTS} metric="value" />
            <div style={{ marginTop: 14, borderRadius: 12, padding: "8px 12px", background: GROOVE_BG, boxShadow: GROOVE_SHADOW, fontSize: 14, fontWeight: 600, color: "#0f172a", display: "inline-block" }}>
              Жим лёжа со штангой
            </div>
          </div>
          {/* Overlay text */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: 20,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(15,23,42,0.72)", lineHeight: 1.45 }}>
              Здесь появится график прогресса, когда вы выполните упражнение 3+ раз
            </span>
          </div>
        </div>
      </Card>
    );
  }

  const [selectedKey, setSelectedKey] = useState(exercises[0].key);
  const [period, setPeriod] = useState<ExPeriod>("90d");
  const [metric, setMetric] = useState<"value" | "1rm">("value");

  const selected = exercises.find((e) => e.key === selectedKey) || exercises[0];

  // Filter points by period
  const cutoff = new Date();
  const periodDays = EX_PERIOD_OPTIONS.find((o) => o.key === period)!.days;
  cutoff.setDate(cutoff.getDate() - periodDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Auto-widen period if < 2 points — also update the active chip
  let effectivePeriod = period;
  let filteredPoints = selected.points.filter((p) => p.date >= cutoffStr);

  if (filteredPoints.length < 2) {
    const wider = EX_PERIOD_OPTIONS.find((o) => {
      const c2 = new Date();
      c2.setDate(c2.getDate() - o.days);
      return selected.points.filter((p) => p.date >= c2.toISOString().slice(0, 10)).length >= 2;
    });
    if (wider) {
      effectivePeriod = wider.key;
      const c2 = new Date();
      c2.setDate(c2.getDate() - wider.days);
      filteredPoints = selected.points.filter((p) => p.date >= c2.toISOString().slice(0, 10));
    } else {
      effectivePeriod = "year";
      filteredPoints = selected.points;
    }
  }

  // Delta computation — in 1RM mode, only use points with estimated1RM
  const deltaPoints = metric === "1rm"
    ? filteredPoints.filter((p) => p.estimated1RM != null)
    : filteredPoints;
  const lastVal = deltaPoints.length > 0
    ? (metric === "1rm" ? deltaPoints[deltaPoints.length - 1].estimated1RM! : deltaPoints[deltaPoints.length - 1].value)
    : null;
  const firstVal = deltaPoints.length > 1
    ? (metric === "1rm" ? deltaPoints[0].estimated1RM! : deltaPoints[0].value)
    : null;

  let deltaPercent: number | null = null;
  if (lastVal != null && firstVal != null && firstVal !== 0) {
    deltaPercent = Math.round(((lastVal - firstVal) / firstVal) * 100);
  }

  // For assistance: invert color (decrease = good)
  const isAssistance = selected.metricKind === "assistance";
  const deltaPositive = deltaPercent != null
    ? (isAssistance ? deltaPercent < 0 : deltaPercent > 0)
    : null;

  return (
    <Card className="fade3">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Dumbbell size={18} color="#0f172a" strokeWidth={2.5} />
        <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Прогресс упражнений</span>
      </div>

      {/* Period chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 3 }}>
          {EX_PERIOD_OPTIONS.map((opt) => {
            const active = effectivePeriod === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => { fireHaptic("light"); setPeriod(opt.key); }}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.45,
                  cursor: "pointer",
                  background: active ? "rgba(196,228,178,0.38)" : "transparent",
                  boxShadow: active
                    ? "inset 0 2px 3px rgba(78,122,58,0.08), inset 0 -1px 0 rgba(255,255,255,0.22)"
                    : "none",
                  color: active ? "#2a5218" : "rgba(15,23,42,0.62)",
                  transition: "background 200ms ease, box-shadow 200ms ease, color 200ms ease",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 1RM toggle */}
        {selected.supports1RM && (
          <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 3 }}>
            {(["value", "1rm"] as const).map((m) => {
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { fireHaptic("light"); setMetric(m); }}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "5px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1.45,
                    cursor: "pointer",
                    background: active ? "rgba(196,228,178,0.38)" : "transparent",
                    boxShadow: active
                      ? "inset 0 2px 3px rgba(78,122,58,0.08), inset 0 -1px 0 rgba(255,255,255,0.22)"
                      : "none",
                    color: active ? "#2a5218" : "rgba(15,23,42,0.62)",
                    transition: "background 200ms ease, box-shadow 200ms ease, color 200ms ease",
                  }}
                >
                  {m === "value" ? "Вес" : "Расч. макс."}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      <ExerciseProgressChart points={filteredPoints} metric={metric} />

      {/* Exercise picker + stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <select
          value={selectedKey}
          onChange={(e) => { setSelectedKey(e.target.value); setMetric("value"); }}
          style={{
            flex: 1,
            appearance: "none",
            WebkitAppearance: "none",
            border: "none",
            borderRadius: 12,
            padding: "8px 12px",
            fontSize: 14,
            fontWeight: 600,
            color: "#0f172a",
            background: GROOVE_BG,
            boxShadow: GROOVE_SHADOW,
            cursor: "pointer",
            outline: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
            paddingRight: 30,
          }}
        >
          {exercises.map((ex) => (
            <option key={ex.key} value={ex.key}>{ex.name}</option>
          ))}
        </select>

        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          {lastVal != null && (
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1e1f22", fontVariantNumeric: "tabular-nums" }}>
              {Number.isInteger(lastVal) ? lastVal : lastVal.toFixed(1)} <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(15,23,42,0.55)" }}>{METRIC_UNIT[selected.metricKind]}</span>
            </span>
          )}
          {deltaPercent != null && deltaPercent !== 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: deltaPositive ? "#16A34A" : "#EF4444", marginTop: 1 }}>
              {deltaPercent > 0 ? "+" : ""}{deltaPercent}%
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Section 4: Личные рекорды ────────────────────────────────────────────────

function PersonalRecordsSection({ records }: { records: ProgressSummaryV2["personalRecords"] }) {
  const top = records.slice(0, 4); // max 4 for readability
  if (top.length === 0) return null;

  return (
    <Card className="fade4">
      <SectionTitle icon={<Trophy size={17} color="#0f172a" strokeWidth={2.5} />} title="Личные рекорды" />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2, paddingRight: 16 }}>
          {top.map((pr) => (
            <div key={pr.name} style={s.prCard}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(15,23,42,0.45)", marginBottom: 4 }}>
                🏋️ Лучший результат
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1e1f22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 136, marginBottom: 8 }}>
                {pr.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span style={{ fontSize: 30, fontWeight: 900, color: "#1e1f22", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{pr.bestWeight}</span>
                <span style={{ fontSize: 14, color: "rgba(15,23,42,0.55)" }}>кг</span>
                {!pr.isFirst && pr.delta != null && pr.delta !== 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: pr.delta > 0 ? "#16A34A" : "#EF4444", position: "relative", top: -4 }}>
                    {pr.delta > 0 ? "+" : ""}{pr.delta}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "rgba(15,23,42,0.45)", marginTop: 4 }}>
                {pr.isFirst ? "🏅 Первый результат!" : `× ${pr.bestReps} ${ruForm(pr.bestReps, "повторение", "повторения", "повторений")}`}
              </div>
            </div>
          ))}
        </div>
        {/* Right fade hint */}
        {top.length > 2 && (
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 2, width: 28, background: "linear-gradient(to left, rgba(242,242,247,0.92), transparent)", pointerEvents: "none", borderRadius: "0 20px 20px 0" }} />
        )}
      </div>
    </Card>
  );
}

// ─── Section 5: Путь к цели ───────────────────────────────────────────────────

function GoalJourneySection({ journey }: { journey: ProgressSummaryV2["goalJourney"] }) {
  // Show at most 5 milestones to avoid crowding
  const ms = journey.milestones.slice(0, 5);
  const n = ms.length;
  if (n === 0) return null;

  const completedCount = ms.filter((m) => m.completed).length;
  const fillPct = n <= 1 ? 0 : (completedCount / (n - 1)) * 100;

  return (
    <Card className="fade5">
      <SectionTitle icon={<Target size={17} color="#0f172a" strokeWidth={2.5} />} title="Путь к цели" />

      <div style={{ position: "relative", paddingBottom: 32 }}>
        {/* Track */}
        <div style={{
          position: "absolute", top: 18, left: `${100 / (n * 2)}%`, right: `${100 / (n * 2)}%`,
          height: 6, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, borderRadius: 999,
        }} />
        {/* Fill */}
        {fillPct > 0 && (
          <div style={{
            position: "absolute", top: 18,
            left: `${100 / (n * 2)}%`,
            width: `calc(${fillPct}% * ${(n - 1) / n})`,
            height: 6, background: FILL_BG, boxShadow: FILL_SHADOW, borderRadius: 999,
            transition: "width 700ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {ms.map((m, i) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }}>
              <div
                className={m.current ? "mile-pulse" : ""}
                style={{
                  width: 36, height: 36, borderRadius: "50%", position: "relative", zIndex: 1,
                  background: m.completed ? FILL_BG : GROOVE_BG,
                  boxShadow: m.completed ? FILL_SHADOW : GROOVE_SHADOW,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 400ms",
                }}
              >
                {m.completed
                  ? <Check size={16} color="rgba(255,255,255,0.92)" strokeWidth={2.5} />
                  : m.current
                    ? <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3a3b40" }} />
                    : <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(15,23,42,0.2)" }} />
                }
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{
                  fontSize: 11, fontWeight: m.completed ? 600 : 400, lineHeight: 1.25, textAlign: "center",
                  color: m.completed ? "#0f172a" : m.current ? "rgba(15,23,42,0.75)" : "rgba(15,23,42,0.38)",
                  maxWidth: 60,
                }}>
                  {m.emoji} {m.label}
                </span>
                {m.value && (
                  <span style={{ fontSize: 10, color: "rgba(15,23,42,0.38)", textAlign: "center", lineHeight: 1.2 }}>
                    {m.value}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: -4, padding: "10px 14px", borderRadius: 14,
        background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
        fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.4,
      }}>
        {journey.nextGoalText}
      </div>
    </Card>
  );
}

// ─── Section 6: Достижения ────────────────────────────────────────────────────

function AchievementsSection({ achievements }: { achievements: ProgressSummaryV2["achievements"] }) {
  const { earned, upcoming } = achievements;

  if (earned.length === 0 && upcoming.length === 0) {
    return (
      <Card className="fade6">
        <SectionTitle icon={<Award size={17} color="#0f172a" strokeWidth={2.5} />} title="Достижения" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
          }}>🏅</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Заработай первый значок</div>
            <div style={{ fontSize: 12, color: "rgba(15,23,42,0.5)", lineHeight: 1.5 }}>Выполни тренировку,<br />чтобы разблокировать награды</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="fade6">
      <SectionTitle icon={<Award size={17} color="#0f172a" strokeWidth={2.5} />} title="Достижения" />

      {earned.length > 0 && (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4, marginBottom: upcoming.length > 0 ? 18 : 0 }}>
          {earned.map((a) => (
            <div key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, minWidth: 52 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: FILL_BG, boxShadow: FILL_SHADOW,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              }}>
                {a.icon}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: "#1e1f22", textAlign: "center", maxWidth: 54, lineHeight: 1.25 }}>{a.title}</span>
            </div>
          ))}
        </div>
      )}

      {upcoming.slice(0, 2).map((u) => (
        <div key={u.id} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 16 }}>{u.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#1e1f22" }}>{u.title}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(15,23,42,0.5)" }}>{u.current}/{u.target}</span>
          </div>
          <GrooveBar percent={u.percent} height={8} />
        </div>
      ))}
    </Card>
  );
}

// ─── Mini sparkline ───────────────────────────────────────────────────────────

function WeightSparkline({ series }: { series: Array<{ date: string; weight: number }> }) {
  if (series.length < 2) return null;
  const W = 200, H = 44;
  const weights = series.map((p) => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * (W - 4) + 2;
    const y = H - 4 - ((p.weight - minW) / range) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const ptsArr = pts.split(" ");
  const lastCoord = ptsArr[ptsArr.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", marginTop: 12, overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke="#1e1f22" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={parseFloat(lastCoord[0])} cy={parseFloat(lastCoord[1])} r={3.5} fill="#1e1f22" />
    </svg>
  );
}

// ─── Section 7: Трансформация (Weight only) ──────────────────────────────────

type WeightPayload = { weight: number; recordedAt: string; notes?: string };

function BodySection({
  body, onAddWeight,
}: {
  body: ProgressSummaryV2["body"];
  onAddWeight: () => void;
}) {
  const w = body.currentWeight;

  if (w == null) {
    return (
      <Card className="fade6">
        <SectionTitle icon={<Scale size={17} color="#0f172a" strokeWidth={2.5} />} title="Твой вес" />
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(15,23,42,0.55)", lineHeight: 1.5 }}>
          Запиши вес сегодня — Моро начнёт отслеживать твой прогресс.
        </p>
        <button style={s.darkBtn} onClick={() => { fireHaptic("light"); onAddWeight(); }}>+ Записать вес</button>
      </Card>
    );
  }

  const delta = body.weightDelta;
  const fromOnboarding = body.weightSource === "onboarding";

  return (
    <Card className="fade6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Scale size={17} color="#0f172a" strokeWidth={2.5} />
          <span style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Твой вес</span>
        </div>
        <button style={s.outlineBtn} onClick={() => { fireHaptic("light"); onAddWeight(); }}>+ Записать</button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: "#1e1f22", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {Number(w).toFixed(1)}
        </span>
        <span style={{ fontSize: 16, color: "rgba(15,23,42,0.55)" }}>кг</span>
        {delta != null && delta !== 0 && !fromOnboarding && (
          <span style={{ fontSize: 13, fontWeight: 700, color: delta < 0 ? "#16A34A" : "#EF4444", position: "relative", top: -6 }}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)} кг
          </span>
        )}
      </div>

      {fromOnboarding && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(15,23,42,0.42)", lineHeight: 1.4 }}>
          Из анкеты — запиши текущий вес для точного отслеживания
        </p>
      )}

      <WeightSparkline series={body.weightSeries ?? []} />
    </Card>
  );
}

// ─── Weight Modal ─────────────────────────────────────────────────────────────

function WeightModal({ onClose, onSave }: { onClose: () => void; onSave: (p: WeightPayload) => Promise<void> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const num = Number(weight.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) { alert("Введи корректный вес"); return; }
    setSaving(true);
    await onSave({ recordedAt: date, weight: num });
    setSaving(false);
  };

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modalCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Записать вес</h3>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <label style={s.field}>
          <span style={s.fieldLabel}>Дата</span>
          <input style={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={s.field}>
          <span style={s.fieldLabel}>Вес (кг)</span>
          <input style={s.input} type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Например, 78.5" />
        </label>
        <button style={s.saveBtn} onClick={submit} disabled={saving}>
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

// ─── Nav helper ───────────────────────────────────────────────────────────────

function useNav() {
  const navigate = useNavigate();
  return (t: string) => {
    if (t === "home") navigate("/");
    if (t === "plan") navigate("/schedule");
    if (t === "coach") navigate("/coach");
    if (t === "profile") navigate("/profile");
  };
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Progress() {
  const nav = useNav();
  const [summary, setSummary] = useState<ProgressSummaryV2 | null>(() => readProgressCache());
  const [loading, setLoading] = useState(summary === null);
  const [error, setError] = useState<string | null>(null);
  const [showWeight, setShowWeight] = useState(false);

  useEffect(() => {
    fireHaptic("light");
    void load();
  }, []);

  async function load(showLoader = false) {
    if (showLoader) setLoading(true);
    try {
      setSummary(await getProgressSummary());
      setError(null);
    } catch {
      if (!summary) setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !summary) {
    return (
      <div style={p.outer}>
        <ProgressStyles />
        <div style={p.inner}>
          <Skel h={60} /><Skel h={52} /><Skel h={110} />
          <Skel h={180} /><Skel h={160} /><Skel h={140} />
        </div>
        <NavBar current="none" onChange={nav} />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div style={p.outer}>
        <ProgressStyles />
        <div style={p.inner}>
          <Card>
            <p style={{ textAlign: "center", color: "#EF4444", margin: "0 0 12px" }}>{error}</p>
            <button style={{ ...s.darkBtn, display: "block", margin: "0 auto" }} onClick={() => load(true)}>Повторить</button>
          </Card>
        </div>
        <NavBar current="none" onChange={nav} />
      </div>
    );
  }

  if (!summary) return null;

  const workoutsTotal = summary.workoutsTotal;
  const daysWithApp = summary.daysWithApp;
  const totalTonnage = summary.totalTonnage;
  const totalMinutes = summary.totalMinutes;
  const userGoal = summary.userGoal;

  const achievements = !summary.achievements || Array.isArray(summary.achievements)
    ? { earned: [], upcoming: [] }
    : summary.achievements as { earned: any[]; upcoming: any[] };

  return (
    <div style={p.outer}>
      <ProgressStyles />
      <div style={p.inner}>
        <ProgressHeader daysWithApp={daysWithApp} />

        <StatPill
          workoutsTotal={workoutsTotal}
          totalMinutes={totalMinutes}
          totalTonnage={totalTonnage}
          userGoal={userGoal}
        />

        {summary.muscleAccent && (
          <MuscleFocusSection muscleAccent={summary.muscleAccent} />
        )}

        <ExerciseProgressSection exerciseProgress={summary.exerciseProgress} />

        {summary.activity && (
          <ActivitySection activity={summary.activity} />
        )}

        {summary.peakReadiness && (
          <ReadinessInsightSection peakReadiness={summary.peakReadiness} />
        )}

        {summary.personalRecords && summary.personalRecords.length > 0 && (
          <PersonalRecordsSection records={summary.personalRecords} />
        )}

        {summary.goalJourney && (
          <GoalJourneySection journey={summary.goalJourney} />
        )}

        <AchievementsSection achievements={achievements} />

        {summary.body && (
          <BodySection body={summary.body} onAddWeight={() => setShowWeight(true)} />
        )}

        <div style={{ height: 88 }} />
      </div>

      <NavBar current="none" onChange={nav} />

      {showWeight && (
        <WeightModal
          onClose={() => setShowWeight(false)}
          onSave={async (payload) => {
            await saveBodyMetric(payload);
            fireHaptic("medium");
            setShowWeight(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const p: Record<string, CSSProperties> = {
  outer: {
    minHeight: "100vh", width: "100%", padding: "16px 16px 0",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  },
  inner: {
    maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12,
    paddingTop: "calc(env(safe-area-inset-top,0px) + 6px)",
  },
};

const s: Record<string, CSSProperties> = {
  // Card
  card: {
    borderRadius: 24, padding: 18,
    background: "linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
  },

  // Avatar — 56px, идентично WorkoutResult
  avatarCircle: {
    width: 56, height: 56, borderRadius: 999, flexShrink: 0,
    background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", flex: "0 0 auto", padding: 2,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" as const, objectPosition: "center top", borderRadius: 999 },

  // Stat pill — идентично WorkoutResult
  statPill: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderRadius: 24, padding: "14px 18px",
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "0 16px 32px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.08)",
  },
  statChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 15, fontWeight: 600, lineHeight: 1.25,
    color: "rgba(255,255,255,0.88)",
  },

  // PR card
  prCard: {
    minWidth: 148, borderRadius: 20, background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    padding: "13px 12px", flexShrink: 0,
  },

  // Buttons
  darkBtn: {
    border: "none", background: FILL_BG, boxShadow: FILL_SHADOW,
    color: "rgba(255,255,255,0.9)", borderRadius: 18, padding: "10px 18px",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  outlineBtn: {
    border: "1.5px solid rgba(15,23,42,0.15)", background: "transparent",
    color: "rgba(15,23,42,0.62)", borderRadius: 18, padding: "7px 13px",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  },

  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.42)", display: "grid", placeItems: "center", padding: 16, zIndex: 1000 },
  modalCard: {
    width: "min(400px,100%)", background: "#fff", borderRadius: 24, padding: 22,
    boxShadow: "0 24px 48px rgba(15,23,42,0.36)", display: "grid", gap: 12,
  },
  closeBtn: { border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", padding: 4 },
  field: { display: "grid", gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "#374151" },
  input: {
    borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", padding: "11px 13px",
    fontSize: 15, color: "#0f172a", background: "#f8fafc", outline: "none",
  },
  saveBtn: {
    border: "none", borderRadius: 18, padding: "13px", fontWeight: 700, cursor: "pointer",
    background: FILL_BG, boxShadow: FILL_SHADOW, color: "rgba(255,255,255,0.9)", fontSize: 15,
  },
};
