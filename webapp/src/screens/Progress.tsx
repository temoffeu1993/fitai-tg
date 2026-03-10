// Progress — product-ready, beginner-friendly
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProgressSummary, saveBodyMetric,
  readProgressCache, type ProgressSummaryV2,
} from "@/api/progress";
import NavBar from "@/components/NavBar";
import mascotImg from "@/assets/morobot.webp";
import { Clock3, Weight, Flame, Target, Trophy, Scale, Award, Check, Zap, Dumbbell, CalendarDays } from "lucide-react";

// ─── Visual constants (WorkoutResult-consistent) ────────────────────────────

const GROOVE_BG = "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)";
const GROOVE_SHADOW = "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)";
const FILL_BG = "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)";
const FILL_SHADOW = "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)";

const MUSCLE_FOCUS_COLORS: Record<string, string> = {
  "Грудь":    "#3B82F6",
  "Спина":    "#10B981",
  "Ноги":     "#EF4444",
  "Ягодицы":  "#F97316",
  "Плечи":    "#8B5CF6",
  "Руки":     "#EC4899",
  "Пресс":    "#0EA5E9",
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
      @keyframes resFadeUp {
        from { transform: translateY(12px); opacity: 0 }
        to   { transform: translateY(0); opacity: 1 }
      }
      @keyframes milePulse {
        0%,100% { transform: scale(1); box-shadow: ${GROOVE_SHADOW} }
        50%     { transform: scale(1.18); box-shadow: ${GROOVE_SHADOW}, 0 0 0 4px rgba(59,130,246,0.2) }
      }
      @keyframes shimmer {
        0%   { background-position: -200% 0 }
        100% { background-position:  200% 0 }
      }
      .fade0 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 0ms   both }
      .fade1 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 80ms  both }
      .fade2 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 150ms both }
      .fade3 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 220ms both }
      .fade4 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 290ms both }
      .fade5 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 360ms both }
      .fade6 { animation: resFadeUp 360ms cubic-bezier(0.22,1,0.36,1) 430ms both }
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
        <img src={mascotImg} alt="Моро" style={s.avatarImg} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Zap size={17} strokeWidth={2.5} color="#1e1f22" fill="#1e1f22" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#1e1f22", lineHeight: 1.2 }}>
            {dayLabel(d)}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 400, color: "rgba(15,23,42,0.5)", marginTop: 3, lineHeight: 1.45 }}>
          Твой прогресс
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

function ActivitySection({ activity }: { activity: ProgressSummaryV2["activity"] }) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayMap = new Map((activity.days ?? []).map((d) => [d.date, d.completed]));

  // Build 12-week grid (Mon–Sun columns)
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 77); // 12 weeks back to Monday

  const weeks: { date: string; completed: boolean }[][] = [];
  for (let w = 0; w < 12; w++) {
    const col: { date: string; completed: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + w * 7 + d);
      const iso = dt.toISOString().slice(0, 10);
      col.push({ date: iso, completed: dayMap.get(iso) ?? false });
    }
    weeks.push(col);
  }

  const DAY_LABELS = ["Пн", "", "Ср", "", "Пт", "", "Вс"];
  const streak = activity.dayStreakCurrent;
  const weekDone = activity.completedThisWeek;
  const weekGoal = activity.weeklyGoal;

  return (
    <Card className="fade3">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarDays size={17} color="#0f172a" strokeWidth={2.5} />
          <span style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>Активность</span>
        </div>
        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: FILL_BG, boxShadow: FILL_SHADOW }} />
          <span style={{ fontSize: 9, color: "rgba(15,23,42,0.38)", fontWeight: 500 }}>тренировка</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2, paddingRight: 4 }}>
        {/* Day labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 1, flexShrink: 0 }}>
          {DAY_LABELS.map((label, i) => (
            <div key={i} style={{ height: 14, width: 16, fontSize: 9, color: "rgba(15,23,42,0.38)", lineHeight: "14px" }}>{label}</div>
          ))}
        </div>
        {/* Heatmap columns */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
            {week.map((day) => (
              <div
                key={day.date}
                style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: day.completed ? FILL_BG : GROOVE_BG,
                  boxShadow: day.date === todayIso
                    ? `${day.completed ? FILL_SHADOW : GROOVE_SHADOW}, 0 0 0 2px rgba(59,130,246,0.55)`
                    : day.completed ? FILL_SHADOW : GROOVE_SHADOW,
                  transition: "background 300ms",
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div style={s.actChip}>
          <div style={{ fontSize: 10, color: "rgba(15,23,42,0.5)", fontWeight: 500 }}>🔥 Серия</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e1f22", marginTop: 1 }}>
            {streak === 0 ? "—" : `${streak} ${ruForm(streak, "день", "дн.", "дн.")}`}
          </div>
        </div>
        <div style={s.actChip}>
          <div style={{ fontSize: 10, color: "rgba(15,23,42,0.5)", fontWeight: 500 }}>Эта неделя</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e1f22", marginTop: 1 }}>
            {weekGoal && weekGoal > 0 ? `${weekDone}/${weekGoal}` : weekDone}
          </div>
        </div>
        <div style={s.actChip}>
          <div style={{ fontSize: 10, color: "rgba(15,23,42,0.5)", fontWeight: 500 }}>Всего</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e1f22", marginTop: 1 }}>
            {activity.totalAllTime}
          </div>
        </div>
      </div>
    </Card>
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
                fontWeight: 400,
                lineHeight: 1.45,
                cursor: enabled ? "pointer" : "default",
                opacity: enabled ? 1 : 0.38,
                background: active ? "rgba(196,228,178,0.38)" : "transparent",
                boxShadow: active
                  ? "inset 0 2px 3px rgba(78,122,58,0.08), inset 0 -1px 0 rgba(255,255,255,0.22)"
                  : "none",
                color: active ? "#2a5218" : "rgba(15,23,42,0.5)",
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
              fontSize: 15, fontWeight: 600, color: "#1e1f22", lineHeight: 1.25,
              whiteSpace: "nowrap",
            }}>
              {item.muscle}
            </span>
            <div style={{ height: 16, borderRadius: 10, background: "#F1F5F9", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.max(8, Math.round((item.percent / maxPercent) * 100))}%`,
                background: MUSCLE_FOCUS_COLORS[item.muscle] || "#94A3B8",
                borderRadius: 10,
                transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
              }} />
            </div>
            <span style={{
              fontSize: 15, fontWeight: 600, color: "#1e1f22", lineHeight: 1.25,
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

        {summary.activity && (
          <ActivitySection activity={summary.activity} />
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

  // Activity chips
  actChip: {
    background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    borderRadius: 14, padding: "9px 12px", flex: 1, minWidth: 60,
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
