// Progress — product-ready, beginner-friendly
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProgressSummary, saveBodyMetric, saveMeasurements,
  readProgressCache, type ProgressSummaryV2,
} from "@/api/progress";
import NavBar from "@/components/NavBar";
import avatarImg from "@/assets/robonew.webp";
import mascotImg from "@/assets/morobot.webp";
import { Clock3, Weight, Flame, Dumbbell, Zap, Activity, RefreshCw } from "lucide-react";

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

function ExerciseProgressChart({ points, metric, color = "#1e1f22" }: {
  points: Array<{ date: string; value: number; estimated1RM?: number }>;
  metric: "value" | "1rm";
  color?: string;
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

  const gradId = `exChartGrad_${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const polygonPts = polyline + ` ${coords[coords.length - 1].x.toFixed(1)},${H} ${coords[0].x.toFixed(1)},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={polygonPts} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 3} fill={color} opacity={i === coords.length - 1 ? 1 : 0.7} />
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

/** Reusable bottom sheet list picker */
function SelectSheet<T extends string>({ title, options, onSelect, onClose }: {
  title: string;
  options: Array<{ key: T; label: string; sub?: string }>;
  onSelect: (key: T) => void;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 10); return () => clearTimeout(t); }, []);
  const requestClose = () => { setClosing(true); setTimeout(onClose, SHEET_EXIT); };
  return (
    <>
      <div onClick={requestClose} style={{
        position: "fixed", inset: 0, zIndex: 2400,
        background: "rgba(10,16,28,0.52)",
        opacity: entered && !closing ? 1 : 0,
        transition: `opacity ${entered ? SHEET_ENTER : SHEET_EXIT}ms ease`,
      }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2401,
        borderRadius: "24px 24px 0 0",
        background: "linear-gradient(180deg, #fff 0%, #f5f5fa 100%)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
        transform: entered && !closing ? "translateY(0)" : "translateY(100%)",
        transition: `transform ${entered && !closing ? SHEET_ENTER : SHEET_EXIT}ms ${entered && !closing ? SPRING_OPEN : SPRING_CLOSE}`,
        maxHeight: "70vh", display: "flex", flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.15)" }} />
        </div>
        <div style={{ padding: "4px 20px 8px" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{title}</h3>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px" }}>
          {options.map((opt, idx) => (
            <Fragment key={opt.key}>
              {idx > 0 && <div style={{ height: 1, background: "rgba(15,23,42,0.06)", margin: "0" }} />}
              <button
                type="button"
                onClick={() => { fireHaptic("light"); onSelect(opt.key); requestClose(); }}
                style={{
                  display: "flex", flexDirection: "column", gap: 2, width: "100%",
                  padding: "14px 0", border: "none", background: "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 500, color: "#1e1f22", lineHeight: 1.3 }}>{opt.label}</span>
                {opt.sub && <span style={{ fontSize: 13, color: "rgba(15,23,42,0.5)" }}>{opt.sub}</span>}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

/** Swap button (icon only, no background) */
function SwapBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => { fireHaptic("light"); onClick(); }}
      style={{ border: "none", background: "none", cursor: "pointer", padding: "2px", lineHeight: 1, display: "flex" }}
    >
      <RefreshCw size={16} color="rgba(15,23,42,0.45)" strokeWidth={2.5} />
    </button>
  );
}

/** Period chip row (reused by both sections) */
function PeriodChips<T extends string>({ options, active, onChange }: {
  options: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 3 }}>
      {options.map((opt) => {
        const isActive = active === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => { fireHaptic("light"); onChange(opt.key); }}
            style={{
              border: "none", borderRadius: 999, padding: "5px 12px",
              fontSize: 13, fontWeight: 600, lineHeight: 1.45, cursor: "pointer",
              background: isActive ? "rgba(196,228,178,0.38)" : "transparent",
              boxShadow: isActive ? "inset 0 2px 3px rgba(78,122,58,0.08), inset 0 -1px 0 rgba(255,255,255,0.22)" : "none",
              color: isActive ? "#2a5218" : "rgba(15,23,42,0.62)",
              transition: "background 200ms ease, box-shadow 200ms ease, color 200ms ease",
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  );
}

function ExerciseProgressSection({ exerciseProgress }: { exerciseProgress: ProgressSummaryV2["exerciseProgress"] }) {
  const exercises = exerciseProgress?.exercises;
  const hasData = exercises && exercises.length > 0;

  const [selectedKey, setSelectedKey] = useState(hasData ? exercises[0].key : "");
  const [period, setPeriod] = useState<ExPeriod>("90d");
  const [metric, setMetric] = useState<"value" | "1rm">("value");
  const [showPicker, setShowPicker] = useState(false);

  if (!hasData) {
    return (
      <Card className="fade3">
        {/* Title always visible */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Dumbbell size={18} color="#0f172a" strokeWidth={2.5} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Прогресс упражнений</span>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ filter: "blur(3px)", opacity: 0.55, pointerEvents: "none" }}>
            <ExerciseProgressChart points={MOCK_EXERCISE_POINTS} metric="value" />
            <div style={{ marginTop: 10 }}>
              <PeriodChips options={EX_PERIOD_OPTIONS} active={"90d" as ExPeriod} onChange={() => {}} />
            </div>
          </div>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: 20,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(15,23,42,0.72)", lineHeight: 1.45 }}>
              В зале рост незаметен, но цифры не врут. После 3 тренировок с одним упражнением мы покажем, как вы становитесь сильнее
            </span>
          </div>
        </div>
      </Card>
    );
  }

  const selected = exercises.find((e) => e.key === selectedKey) || exercises[0];

  // Filter points by period
  const cutoff = new Date();
  const periodDays = EX_PERIOD_OPTIONS.find((o) => o.key === period)!.days;
  cutoff.setDate(cutoff.getDate() - periodDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

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

  const isAssistance = selected.metricKind === "assistance";
  const deltaPositive = deltaPercent != null
    ? (isAssistance ? deltaPercent < 0 : deltaPercent > 0)
    : null;

  return (
    <Card className="fade3">
      {/* Header: exercise name + swap + value */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Dumbbell size={18} color="#0f172a" strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected.name}
          </span>
          <SwapBtn onClick={() => setShowPicker(true)} />
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8 }}>
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

      {/* Chart */}
      <ExerciseProgressChart points={filteredPoints} metric={metric} />

      {/* Period chips + 1RM toggle BELOW chart */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <PeriodChips options={EX_PERIOD_OPTIONS} active={effectivePeriod} onChange={setPeriod} />
        {selected.supports1RM && (
          <PeriodChips
            options={[{ key: "value" as const, label: "Вес" }, { key: "1rm" as const, label: "Расч. макс." }]}
            active={metric}
            onChange={setMetric}
          />
        )}
      </div>

      {/* Exercise picker sheet */}
      {showPicker && (
        <SelectSheet
          title="Выберите упражнение"
          options={exercises.map((ex) => ({ key: ex.key, label: ex.name, sub: `${ex.sessionCount} тренировок` }))}
          onSelect={(key) => { setSelectedKey(key); setMetric("value"); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Card>
  );
}

// ─── Section 4: Личные рекорды ────────────────────────────────────────────────

// ─── Section: Тело (unified Weight + BMI + Measurements) ─────────────────────

type WeightPayload = { weight: number; recordedAt: string; notes?: string };

function fmtVal(v: number) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

function bmiColorFn(bmi: number): string {
  if (bmi < 18.5) return "#3b82f6";
  if (bmi < 25) return "#16A34A";
  if (bmi < 30) return "#f59e0b";
  return "#EF4444";
}

type MeasurementField = "chest_cm" | "waist_cm" | "hips_cm" | "bicep_left_cm" | "bicep_right_cm" | "neck_cm" | "thigh_cm";

type BodyMetricKey = "weight" | "bmi" | MeasurementField;

const BODY_METRIC_OPTIONS: { key: BodyMetricKey; label: string; unit: string }[] = [
  { key: "weight", label: "Вес", unit: "кг" },
  { key: "bmi", label: "ИМТ", unit: "" },
  { key: "chest_cm", label: "Грудь", unit: "см" },
  { key: "waist_cm", label: "Талия", unit: "см" },
  { key: "hips_cm", label: "Бёдра", unit: "см" },
  { key: "bicep_left_cm", label: "Бицепс Л", unit: "см" },
  { key: "bicep_right_cm", label: "Бицепс П", unit: "см" },
  { key: "neck_cm", label: "Шея", unit: "см" },
  { key: "thigh_cm", label: "Бедро", unit: "см" },
];

type BodyPeriod = "30d" | "90d" | "all";
const BODY_PERIOD_OPTIONS: { key: BodyPeriod; label: string; days: number }[] = [
  { key: "30d", label: "30д", days: 30 },
  { key: "90d", label: "90д", days: 90 },
  { key: "all", label: "Все", days: 99999 },
];

const MOCK_BODY_POINTS: Array<{ date: string; value: number }> = [
  { date: "2025-12-01", value: 82 }, { date: "2025-12-15", value: 81.5 },
  { date: "2026-01-02", value: 80.8 }, { date: "2026-01-14", value: 80.2 },
  { date: "2026-01-28", value: 79.5 }, { date: "2026-02-08", value: 79 },
  { date: "2026-02-22", value: 78.3 }, { date: "2026-03-05", value: 77.8 },
];

/** Extract dated points for any body metric */
function getBodyPoints(
  body: ProgressSummaryV2["body"],
  metric: BodyMetricKey,
): Array<{ date: string; value: number }> {
  if (metric === "weight") {
    const ws = body.weightSeries ?? [];
    return ws.map((p) => ({ date: p.date, value: p.weight }));
  }
  if (metric === "bmi") {
    const hm = body.heightCm != null && body.heightCm > 0 ? body.heightCm / 100 : null;
    if (!hm) return [];
    const ws = body.weightSeries ?? [];
    return ws.map((p) => ({ date: p.date, value: Number((p.weight / (hm * hm)).toFixed(1)) }));
  }
  // Measurement field
  const series = body.measurements?.series ?? [];
  return series
    .filter((row) => row[metric] != null)
    .map((row) => ({ date: row.date, value: row[metric] as number }));
}

const BODY_TITLE_MAP: Record<BodyMetricKey, string> = {
  weight: "Мой вес", bmi: "Мой ИМТ",
  chest_cm: "Грудь", waist_cm: "Талия", hips_cm: "Бёдра",
  bicep_left_cm: "Бицепс Л", bicep_right_cm: "Бицепс П",
  neck_cm: "Шея", thigh_cm: "Бедро",
};

function BodyDataSection({ body, onAddWeight, onAddMeasurement }: {
  body: ProgressSummaryV2["body"];
  onAddWeight: () => void;
  onAddMeasurement: () => void;
}) {
  const [selectedMetric, setSelectedMetric] = useState<BodyMetricKey>("weight");
  const [period, setPeriod] = useState<BodyPeriod>("all");
  const [showPicker, setShowPicker] = useState(false);

  const allPoints = getBodyPoints(body, selectedMetric);
  const hasData = allPoints.length >= 2;

  // Filter by period
  const cutoff = new Date();
  const periodDays = BODY_PERIOD_OPTIONS.find((o) => o.key === period)!.days;
  cutoff.setDate(cutoff.getDate() - periodDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let effectivePeriod = period;
  let filteredPoints = period === "all" ? allPoints : allPoints.filter((p) => p.date >= cutoffStr);

  if (filteredPoints.length < 2 && allPoints.length >= 2) {
    const wider = BODY_PERIOD_OPTIONS.find((o) => {
      if (o.key === "all") return true;
      const c2 = new Date();
      c2.setDate(c2.getDate() - o.days);
      return allPoints.filter((p) => p.date >= c2.toISOString().slice(0, 10)).length >= 2;
    });
    if (wider) {
      effectivePeriod = wider.key;
      if (wider.key === "all") filteredPoints = allPoints;
      else {
        const c2 = new Date();
        c2.setDate(c2.getDate() - wider.days);
        filteredPoints = allPoints.filter((p) => p.date >= c2.toISOString().slice(0, 10));
      }
    }
  }

  const metaOpt = BODY_METRIC_OPTIONS.find((o) => o.key === selectedMetric)!;
  const lastVal = filteredPoints.length > 0 ? filteredPoints[filteredPoints.length - 1].value : null;
  const firstVal = filteredPoints.length > 1 ? filteredPoints[0].value : null;
  let deltaVal: number | null = null;
  let deltaPercent: number | null = null;
  if (lastVal != null && firstVal != null && firstVal !== 0) {
    deltaVal = Number((lastVal - firstVal).toFixed(1));
    deltaPercent = Math.round(((lastVal - firstVal) / firstVal) * 100);
  }

  const chartColor = selectedMetric === "bmi" && lastVal != null ? bmiColorFn(lastVal) : "#1e1f22";

  const isMeasurement = selectedMetric !== "weight" && selectedMetric !== "bmi";
  const onPlusClick = () => {
    fireHaptic("light");
    if (isMeasurement) onAddMeasurement();
    else onAddWeight();
  };

  return (
    <Card className="fade6">
      {/* Header: dynamic title + swap + plus */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={18} color="#0f172a" strokeWidth={2.5} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
            {BODY_TITLE_MAP[selectedMetric]}
          </span>
          <SwapBtn onClick={() => setShowPicker(true)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastVal != null && (
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: selectedMetric === "bmi" ? chartColor : "#1e1f22", fontVariantNumeric: "tabular-nums" }}>
                {fmtVal(lastVal)}{metaOpt.unit ? ` ${metaOpt.unit}` : ""}
              </span>
              {deltaPercent != null && deltaPercent !== 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: deltaPercent < 0 ? "#16A34A" : "#EF4444", marginTop: 1 }}>
                  {deltaVal! > 0 ? "+" : ""}{deltaVal}{metaOpt.unit ? ` ${metaOpt.unit}` : ""}
                </div>
              )}
            </div>
          )}
          <button
            onClick={onPlusClick}
            style={{
              border: "none", background: "none", cursor: "pointer",
              fontSize: 22, fontWeight: 400, color: "rgba(15,23,42,0.45)", padding: "0 2px", lineHeight: 1,
            }}
          >+</button>
        </div>
      </div>

      {/* Chart — real or mock */}
      {hasData ? (
        <>
          <ExerciseProgressChart
            points={filteredPoints.length >= 2 ? filteredPoints : allPoints}
            metric="value"
            color={chartColor}
          />
          {/* Period chips below chart — only with real data */}
          <div style={{ marginTop: 12 }}>
            <PeriodChips options={BODY_PERIOD_OPTIONS} active={effectivePeriod} onChange={setPeriod} />
          </div>
        </>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ filter: "blur(3px)", opacity: 0.55, pointerEvents: "none" }}>
            <ExerciseProgressChart points={MOCK_BODY_POINTS} metric="value" />
            <div style={{ marginTop: 10 }}>
              <PeriodChips options={BODY_PERIOD_OPTIONS} active={"all" as BodyPeriod} onChange={() => {}} />
            </div>
          </div>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: 20,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(15,23,42,0.72)", lineHeight: 1.45 }}>
              Запишите данные — здесь появится график изменений
            </span>
          </div>
        </div>
      )}

      {/* Metric picker sheet */}
      {showPicker && (
        <SelectSheet
          title="Что показать"
          options={BODY_METRIC_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          onSelect={(key) => { setSelectedMetric(key); setPeriod("all"); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Card>
  );
}

// ─── Bottom Sheet wrapper ─────────────────────────────────────────────────────

const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER = 380;
const SHEET_EXIT = 260;

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => setEntered(true), 12);
    return () => { document.body.style.overflow = ""; clearTimeout(t); };
  }, []);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setEntered(false);
    setTimeout(onClose, SHEET_EXIT + 20);
  };

  return (
    <>
      <style>{`
        .prog-sheet-list::-webkit-scrollbar { display: none; }
      `}</style>
      {/* Overlay */}
      <div
        onClick={requestClose}
        style={{
          position: "fixed", inset: 0, zIndex: 2400,
          background: "rgba(10,16,28,0.52)",
          opacity: entered && !closing ? 1 : 0,
          transition: `opacity ${entered ? SHEET_ENTER : SHEET_EXIT}ms ease`,
        }}
      />
      {/* Sheet */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2401,
        borderRadius: "24px 24px 0 0",
        background: "linear-gradient(180deg, #fff 0%, #f5f5fa 100%)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
        transform: entered && !closing ? "translateY(0)" : "translateY(100%)",
        transition: `transform ${entered && !closing ? SHEET_ENTER : SHEET_EXIT}ms ${entered && !closing ? SPRING_OPEN : SPRING_CLOSE}`,
        maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.15)" }} />
        </div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 20px 12px" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{title}</h3>
          <button style={s.closeBtn} onClick={requestClose}>✕</button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ─── Horizontal weight scroller (adapted from OnbWeight) ─────────────────────

const WT_MIN = 20, WT_MAX = 200, WT_ITEM_W = 12, WT_TICKS = 5;

function WeightScroller({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<number>(0);
  const suppressSync = useRef(false);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || suppressSync.current) { suppressSync.current = false; return; }
    const idx = (value - WT_MIN) * WT_TICKS;
    list.scrollLeft = idx * WT_ITEM_W;
    lastTick.current = Math.round(idx / WT_TICKS) * WT_TICKS;
  }, [value]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const raw = Math.round(list.scrollLeft / WT_ITEM_W);
    const major = Math.round(raw / WT_TICKS) * WT_TICKS;
    if (lastTick.current !== major) { lastTick.current = major; fireHaptic("light"); }
    clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => {
      const r = Math.round(list.scrollLeft / WT_ITEM_W);
      const m = Math.round(r / WT_TICKS) * WT_TICKS;
      const w = WT_MIN + m / WT_TICKS;
      if (w >= WT_MIN && w <= WT_MAX) { suppressSync.current = true; onChange(w); }
    }, 80);
  };

  const ticks = Array.from({ length: (WT_MAX - WT_MIN) * WT_TICKS + 1 }, (_, i) => ({
    index: i, value: WT_MIN + i / WT_TICKS, isMajor: i % WT_TICKS === 0,
  }));

  const trackW = WT_ITEM_W * WT_TICKS * 5;

  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 18, alignSelf: "center",
      width: trackW,
      border: "1px solid rgba(255,255,255,0.6)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
      backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    }}>
      {/* Indicator triangle */}
      <div style={{
        position: "absolute", left: "50%", top: 8, transform: "translateX(-50%)", pointerEvents: "none",
        width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
        borderTop: "8px solid rgba(15,23,42,0.35)",
      }} />
      {/* Fades */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: WT_ITEM_W * WT_TICKS, background: "linear-gradient(90deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: WT_ITEM_W * WT_TICKS, background: "linear-gradient(270deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)", pointerEvents: "none", zIndex: 1 }} />
      {/* Scrollable list */}
      <div
        ref={listRef}
        className="prog-sheet-list"
        onScroll={handleScroll}
        style={{
          overflowX: "auto", overflowY: "hidden", whiteSpace: "nowrap",
          scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch",
          padding: "16px 0 20px",
          paddingLeft: `calc(50% - ${WT_ITEM_W / 2}px)`,
          paddingRight: `calc(50% - ${WT_ITEM_W / 2}px)`,
          scrollbarWidth: "none",
        }}
      >
        {ticks.map((t) => (
          <button
            key={t.index} type="button"
            style={{
              width: WT_ITEM_W, background: "transparent", display: "inline-flex",
              flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
              gap: 14, border: "none", cursor: "pointer", padding: 0,
              scrollSnapAlign: t.isMajor ? "center" : "none",
            }}
            onClick={() => {
              const m = Math.round(t.index / WT_TICKS) * WT_TICKS;
              const w = WT_MIN + m / WT_TICKS;
              if (w >= WT_MIN && w <= WT_MAX) { suppressSync.current = true; onChange(w); listRef.current?.scrollTo({ left: m * WT_ITEM_W, behavior: "smooth" }); }
            }}
          >
            <div style={{
              fontSize: t.isMajor ? (value === t.value ? 22 : 18) : 0, height: 22,
              color: value === t.value ? "#111" : "rgba(15,23,42,0.45)",
              fontWeight: value === t.value ? 700 : 500,
            }}>
              {t.isMajor ? t.value : ""}
            </div>
            <div style={{ width: "100%", height: 18, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <span style={{
                width: 2, borderRadius: 999,
                height: t.isMajor ? 22 : 12,
                background: value === t.value ? "rgba(15,23,42,0.75)" : "rgba(15,23,42,0.35)",
              }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Vertical cm scroller (adapted from OnbHeight) ───────────────────────────

const CM_MIN = 20, CM_MAX = 200, CM_ITEM_H = 12, CM_TICKS = 5;
const CM_EDGE = CM_ITEM_H * CM_TICKS * 2 - CM_ITEM_H / 2;

function CmScroller({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<number>(0);
  const suppressSync = useRef(false);
  const lastTop = useRef(0);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || suppressSync.current) { suppressSync.current = false; return; }
    const idx = (value - CM_MIN) * CM_TICKS;
    list.scrollTop = idx * CM_ITEM_H;
    lastTick.current = Math.round(idx / CM_TICKS) * CM_TICKS;
  }, [value]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    lastTop.current = list.scrollTop;
    const raw = Math.round(list.scrollTop / CM_ITEM_H);
    const major = Math.round(raw / CM_TICKS) * CM_TICKS;
    if (lastTick.current !== major) { lastTick.current = major; fireHaptic("light"); }
    clearTimeout(stopTimer.current);
    const checkStop = () => {
      const cur = list.scrollTop;
      if (Math.abs(cur - lastTop.current) > 0.5) { lastTop.current = cur; stopTimer.current = window.setTimeout(checkStop, 80); return; }
      const r = Math.round(cur / CM_ITEM_H);
      const m = Math.round(r / CM_TICKS) * CM_TICKS;
      const v = CM_MIN + m / CM_TICKS;
      if (v >= CM_MIN && v <= CM_MAX) { suppressSync.current = true; onChange(v); }
    };
    stopTimer.current = window.setTimeout(checkStop, 80);
  };

  const ticks = Array.from({ length: (CM_MAX - CM_MIN) * CM_TICKS + 1 }, (_, i) => ({
    index: i, value: CM_MIN + i / CM_TICKS, isMajor: i % CM_TICKS === 0,
  }));

  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 18, alignSelf: "center",
      width: "min(140px, 36vw)", height: CM_ITEM_H * CM_TICKS * 4,
      border: "1px solid rgba(255,255,255,0.6)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
      backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    }}>
      {/* Indicator arrow */}
      <div style={{
        position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", pointerEvents: "none",
        width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent",
        borderLeft: "8px solid rgba(15,23,42,0.35)",
      }} />
      {/* Fades */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: CM_ITEM_H * CM_TICKS * 2, background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CM_ITEM_H * CM_TICKS * 2, background: "linear-gradient(0deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)", pointerEvents: "none", zIndex: 1 }} />
      {/* Scrollable list */}
      <div
        ref={listRef}
        className="prog-sheet-list"
        onScroll={handleScroll}
        style={{
          maxHeight: "100%", overflowY: "auto", overflowX: "hidden",
          scrollSnapType: "y proximity", scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ height: CM_EDGE }} />
        {ticks.map((t) => (
          <button
            key={t.index} type="button"
            style={{
              border: "none", background: "transparent", height: CM_ITEM_H,
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", gap: 6,
              scrollSnapAlign: t.isMajor ? "center" : "none",
            }}
            onClick={() => {
              const m = Math.round(t.index / CM_TICKS) * CM_TICKS;
              const v = CM_MIN + m / CM_TICKS;
              if (v >= CM_MIN && v <= CM_MAX) { suppressSync.current = true; onChange(v); listRef.current?.scrollTo({ top: m * CM_ITEM_H, behavior: "smooth" }); }
            }}
          >
            <div style={{
              minWidth: 36, textAlign: "right",
              fontSize: value === t.value ? 22 : (t.isMajor ? 18 : 0),
              color: value === t.value ? "#111" : (t.isMajor ? "rgba(15,23,42,0.45)" : "transparent"),
              fontWeight: value === t.value ? 700 : 500,
            }}>
              {t.isMajor ? t.value : ""}
            </div>
            <div style={{ width: 36, height: 12, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              <span style={{
                height: 2, borderRadius: 999,
                width: t.isMajor ? 22 : 12,
                background: value === t.value ? "rgba(15,23,42,0.75)" : "rgba(15,23,42,0.35)",
              }} />
            </div>
          </button>
        ))}
        <div style={{ height: CM_EDGE }} />
      </div>
    </div>
  );
}

// ─── Weight Bottom Sheet ─────────────────────────────────────────────────────

function WeightModal({ onClose, onSave }: { onClose: () => void; onSave: (p: WeightPayload) => Promise<void> }) {
  const [weight, setWeight] = useState(75);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await onSave({ recordedAt: new Date().toISOString().slice(0, 10), weight });
    setSaving(false);
  };

  return (
    <BottomSheet title="Записать вес" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: "#1e1f22" }}>{weight}</span>
        <span style={{ fontSize: 16, color: "rgba(15,23,42,0.55)" }}>кг</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <WeightScroller value={weight} onChange={setWeight} />
      </div>
      <button style={s.saveBtn} onClick={submit} disabled={saving}>
        {saving ? "Сохраняем..." : "Сохранить"}
      </button>
    </BottomSheet>
  );
}

// ─── Measurement Bottom Sheet ────────────────────────────────────────────────

type MeasurementPayload = {
  recordedAt: string;
  chest_cm?: number;
  waist_cm?: number;
  hips_cm?: number;
  bicep_left_cm?: number;
  bicep_right_cm?: number;
  neck_cm?: number;
  thigh_cm?: number;
};

const MEAS_FIELDS: { key: keyof Omit<MeasurementPayload, "recordedAt">; label: string }[] = [
  { key: "chest_cm", label: "Грудь" },
  { key: "waist_cm", label: "Талия" },
  { key: "hips_cm", label: "Бёдра" },
  { key: "bicep_left_cm", label: "Бицепс Л" },
  { key: "bicep_right_cm", label: "Бицепс П" },
  { key: "neck_cm", label: "Шея" },
  { key: "thigh_cm", label: "Бедро" },
];

function MeasurementModal({ onClose, onSave }: { onClose: () => void; onSave: (p: MeasurementPayload) => Promise<void> }) {
  const [activeField, setActiveField] = useState<keyof Omit<MeasurementPayload, "recordedAt">>("chest_cm");
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const currentVal = values[activeField] ?? 80;

  const submit = async () => {
    if (Object.keys(values).length === 0) { alert("Выберите хотя бы один замер"); return; }
    setSaving(true);
    const payload: MeasurementPayload = { recordedAt: new Date().toISOString().slice(0, 10), ...values };
    await onSave(payload);
    setSaving(false);
  };

  return (
    <BottomSheet title="Записать замеры" onClose={onClose}>
      {/* Field chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {MEAS_FIELDS.map((f) => {
          const active = activeField === f.key;
          const hasValue = values[f.key] != null;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => { fireHaptic("light"); setActiveField(f.key); }}
              style={{
                border: "none", borderRadius: 999,
                padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: active ? "rgba(196,228,178,0.38)" : hasValue ? "rgba(15,23,42,0.06)" : GROOVE_BG,
                boxShadow: active ? "inset 0 2px 3px rgba(78,122,58,0.08)" : hasValue ? "none" : GROOVE_SHADOW,
                color: active ? "#2a5218" : hasValue ? "#0f172a" : "rgba(15,23,42,0.55)",
                transition: "all 200ms ease",
              }}
            >
              {f.label}{hasValue ? ` ${values[f.key]}` : ""}
            </button>
          );
        })}
      </div>

      {/* Value display */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: "#1e1f22" }}>{currentVal}</span>
        <span style={{ fontSize: 16, color: "rgba(15,23,42,0.55)" }}>см</span>
      </div>

      {/* Scroller */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <CmScroller
          value={currentVal}
          onChange={(v) => setValues((prev) => ({ ...prev, [activeField]: v }))}
        />
      </div>

      <button style={s.saveBtn} onClick={submit} disabled={saving}>
        {saving ? "Сохраняем..." : `Сохранить (${Object.keys(values).length})`}
      </button>
    </BottomSheet>
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
  const [showMeasurement, setShowMeasurement] = useState(false);

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

        {summary.body && (
          <BodyDataSection
            body={summary.body}
            onAddWeight={() => setShowWeight(true)}
            onAddMeasurement={() => setShowMeasurement(true)}
          />
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

      {showMeasurement && (
        <MeasurementModal
          onClose={() => setShowMeasurement(false)}
          onSave={async (payload) => {
            await saveMeasurements(payload);
            fireHaptic("medium");
            setShowMeasurement(false);
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
