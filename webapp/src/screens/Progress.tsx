// Progress — полный редизайн в стиле WorkoutResult
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProgressSummary, saveBodyMetric, saveMeasurements,
  readProgressCache, type ProgressSummaryV2, type BodyMeasurement,
} from "@/api/progress";
import NavBar from "@/components/NavBar";
import mascotImg from "@/assets/robonew.webp";
import morobotImg from "@/assets/morobot.webp";
import {
  Flame, Dumbbell, TrendingUp, Target, Trophy, Scale,
  CalendarDays, BarChart3, Moon, Award, Zap, Brain, Check,
} from "lucide-react";

// ─── Shared visual constants (from WorkoutResult) ───────────────────────────

const GROOVE_BG = "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)";
const GROOVE_SHADOW = "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)";
const FILL_BG = "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)";
const FILL_SHADOW = "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)";

const MUSCLE_COLORS: Record<string, string> = {
  "Грудь": "#3B82F6", "Плечи": "#8B5CF6", "Трицепс": "#EC4899",
  "Бицепс": "#F59E0B", "Широчайшие": "#10B981", "Верх спины": "#14B8A6",
  "Квадрицепсы": "#EF4444", "Ягодицы": "#F97316", "Бицепс бедра": "#D946EF",
  "Икры": "#6366F1", "Пресс": "#0EA5E9", "Поясница": "#64748B", "Предплечья": "#84CC16",
};

// ─── Haptic ───────────────────────────────────────────────────────────────────

function fireHaptic(style: "light" | "medium" = "light") {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
    else if (navigator.vibrate) navigator.vibrate(style === "light" ? 30 : 60);
  } catch { }
}

// ─── CSS styles injected once ─────────────────────────────────────────────────

function ProgressStyles() {
  return (
    <style>{`
      @keyframes resFadeUp {
        from { transform: translateY(14px); opacity: 0 }
        to   { transform: translateY(0); opacity: 1 }
      }
      @keyframes progPulse {
        0%,100% { transform: scale(1); opacity: 1 }
        50% { transform: scale(1.25); opacity: 0.7 }
      }
      @keyframes shimmer {
        0% { background-position: -200% 0 }
        100% { background-position: 200% 0 }
      }
      .res-fade { animation: resFadeUp 380ms cubic-bezier(0.22,1,0.36,1) both }
      .res-d0 { animation-delay: 0ms }
      .res-d1 { animation-delay: 80ms }
      .res-d2 { animation-delay: 160ms }
      .res-d3 { animation-delay: 220ms }
      .res-d4 { animation-delay: 280ms }
      .res-d5 { animation-delay: 340ms }
      .res-d6 { animation-delay: 400ms }
      .res-d7 { animation-delay: 460ms }
      .res-d8 { animation-delay: 520ms }
      .res-d9 { animation-delay: 580ms }
      .res-d10 { animation-delay: 640ms }
      .prog-pulse { animation: progPulse 1.4s ease-in-out infinite }
      .shimmer-box {
        background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s ease-in-out infinite;
        border-radius: 16px;
      }
      @media (prefers-reduced-motion: reduce) {
        .res-fade, .prog-pulse, .shimmer-box { animation: none }
      }
    `}</style>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className="shimmer-box" style={{ height, marginBottom: 0 }} />;
}

// ─── Shared card component ────────────────────────────────────────────────────

function GlassCard({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <div style={{ ...s.glassCard, ...style }}>{children}</div>;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={s.sectionTitle}>
      {icon}
      <span>{title}</span>
    </div>
  );
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

function TabSwitcher({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={s.tabWrap}>
      {tabs.map((t) => (
        <button key={t} style={active === t ? s.tabActive : s.tabBtn}
          onClick={() => { fireHaptic("light"); onChange(t); }}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Groove bar (horizontal progress) ────────────────────────────────────────

function GrooveBar({ percent, height = 8 }: { percent: number; height?: number }) {
  return (
    <div style={{ borderRadius: 999, height, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, percent))}%`, background: FILL_BG, boxShadow: FILL_SHADOW, borderRadius: 999, transition: "width 600ms ease" }} />
    </div>
  );
}

// ─── Groove box (small metric card) ──────────────────────────────────────────

function GrooveBox({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ borderRadius: 20, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 14, ...style }}>
      {children}
    </div>
  );
}

// ─── Delta badge ─────────────────────────────────────────────────────────────

function Delta({ value }: { value: number | null }) {
  if (value == null || value === 0) return null;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, position: "relative", top: -3, color: value > 0 ? "#16A34A" : "#EF4444" }}>
      {value > 0 ? "+" : ""}{value}
    </span>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
function fmtWeekStart(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// ─── 1.1 Header ──────────────────────────────────────────────────────────────

function ProgressHeader({ level, daysWithApp }: { level: number; daysWithApp: number }) {
  return (
    <div style={s.headerRow} className="res-fade res-d0">
      <div style={s.avatarCircle}>
        <img src={mascotImg} alt="Моро" style={s.avatarImg} />
      </div>
      <div>
        <div style={s.headerTitle}>Твой прогресс</div>
        <div style={s.headerSub}>Уровень {level} · {daysWithApp} {daysWord(daysWithApp)} с Моро</div>
      </div>
    </div>
  );
}

function daysWord(n: number) {
  const abs = Math.abs(n);
  if (abs % 10 === 1 && abs % 100 !== 11) return "день";
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return "дня";
  return "дней";
}

// ─── 1.2 Stat Pill ───────────────────────────────────────────────────────────

function StatPill({ weekStreak, workoutsTotal, tonnageDelta30d }: { weekStreak: number; workoutsTotal: number; tonnageDelta30d: number | null }) {
  const tonnageText = tonnageDelta30d != null ? `${tonnageDelta30d > 0 ? "+" : ""}${tonnageDelta30d.toLocaleString("ru")} кг` : "— кг";
  return (
    <div style={s.statPill} className="res-fade res-d1">
      <span style={s.statChip}><Flame size={18} color="rgba(255,255,255,0.88)" strokeWidth={2} />{weekStreak} нед. подряд</span>
      <span style={s.statChipDiv} />
      <span style={s.statChip}><Dumbbell size={18} color="rgba(255,255,255,0.88)" strokeWidth={2} />{workoutsTotal} трен.</span>
      <span style={s.statChipDiv} />
      <span style={s.statChip}><TrendingUp size={18} color="rgba(255,255,255,0.88)" strokeWidth={2} />{tonnageText} за 30д</span>
    </div>
  );
}

// ─── 1.3 AI Insight ──────────────────────────────────────────────────────────

function AiInsight({ text, onCoachClick }: { text: string; onCoachClick?: () => void }) {
  return (
    <GlassCard style={{ paddingBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "flex-start" }}>
        <img src={morobotImg} alt="Моро" style={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div style={s.speechBubble}>
          <div style={{ fontSize: 15, fontWeight: 400, color: "#1e1f22", lineHeight: 1.5 }}>{text}</div>
        </div>
      </div>
      {onCoachClick && (
        <button style={s.coachBtn} onClick={onCoachClick}>Спросить Моро →</button>
      )}
    </GlassCard>
  );
}

// ─── 1.4 Goal Journey ────────────────────────────────────────────────────────

function GoalJourney({ journey }: { journey: ProgressSummaryV2["goalJourney"] }) {
  const ms = journey.milestones;
  const currentIdx = ms.findIndex((m) => m.current);
  const lineWidth = ms.length <= 1 ? 100 : 100 / (ms.length - 1);

  return (
    <GlassCard>
      <SectionTitle icon={<Target size={18} color="#0f172a" strokeWidth={2.5} />} title="Путь к цели" />
      {/* Road */}
      <div style={{ position: "relative", paddingTop: 8, paddingBottom: 28 }}>
        {/* Background line */}
        <div style={{ position: "absolute", top: 22, left: `${lineWidth / 2}%`, right: `${lineWidth / 2}%`, height: 6, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, borderRadius: 999 }} />
        {/* Fill line up to current */}
        {currentIdx > 0 && (
          <div style={{ position: "absolute", top: 22, left: `${lineWidth / 2}%`, width: `calc(${lineWidth * currentIdx}%)`, height: 6, background: FILL_BG, boxShadow: FILL_SHADOW, borderRadius: 999, transition: "width 600ms ease" }} />
        )}
        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
          {ms.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <div
                className={m.current ? "prog-pulse" : ""}
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: m.completed ? FILL_BG : GROOVE_BG,
                  boxShadow: m.completed ? FILL_SHADOW : GROOVE_SHADOW,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1, position: "relative",
                }}
              >
                {m.completed ? (
                  <Check size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                ) : m.current ? (
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3a3b40" }} />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(15,23,42,0.2)" }} />
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: m.completed ? "#0f172a" : "rgba(15,23,42,0.45)", textAlign: "center", maxWidth: 52, lineHeight: 1.2 }}>
                {m.emoji} {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)" }}>{journey.nextGoalText}</div>
    </GlassCard>
  );
}

// ─── 1.5 Muscle Accent ────────────────────────────────────────────────────────

function MuscleAccent({ muscleAccent }: { muscleAccent: ProgressSummaryV2["muscleAccent"] }) {
  const [period, setPeriod] = useState<"all" | "30d" | "7d">("all");
  const data = period === "all" ? muscleAccent.all : period === "30d" ? muscleAccent.last30d : muscleAccent.last7d;

  if (muscleAccent.all.length === 0) return null;

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionTitle icon={<Flame size={18} color="#0f172a" strokeWidth={2.5} />} title="Акцент по мышцам" />
        <TabSwitcher tabs={["Всё", "30д", "7д"]} active={period === "all" ? "Всё" : period === "30d" ? "30д" : "7д"}
          onChange={(t) => setPeriod(t === "Всё" ? "all" : t === "30д" ? "30d" : "7d")} />
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.45)", textAlign: "center", padding: "12px 0" }}>Нет данных за период</div>
      ) : (
        <>
          <div style={{ display: "flex", height: 16, borderRadius: 10, overflow: "hidden", width: "100%", background: "#F1F5F9", marginBottom: 12 }}>
            {data.map((item) => (
              <div key={item.muscle} style={{ width: `${item.percent}%`, height: "100%", background: MUSCLE_COLORS[item.muscle] || "#94A3B8", transition: "width 600ms ease" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.map((item) => (
              <div key={item.muscle} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: MUSCLE_COLORS[item.muscle] || "#94A3B8", flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)" }}>{item.muscle} {item.percent}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}

// ─── 1.6 Personal Records ─────────────────────────────────────────────────────

function PersonalRecords({ records }: { records: ProgressSummaryV2["personalRecords"] }) {
  if (records.length === 0) return null;
  return (
    <GlassCard>
      <SectionTitle icon={<Trophy size={18} color="#0f172a" strokeWidth={2.5} />} title="Личные рекорды" />
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginTop: 2 }}>
        {records.map((pr) => (
          <div key={pr.name} style={s.prCard}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e1f22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{pr.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: "#1e1f22", fontVariantNumeric: "tabular-nums" }}>{pr.bestWeight}</span>
              <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)" }}>кг</span>
              {!pr.isFirst && pr.delta != null && <Delta value={pr.delta} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", marginTop: 2 }}>× {pr.bestReps} повт.</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: "rgba(15,23,42,0.45)", marginTop: 4 }}>
              {pr.isFirst ? "🏅 Первый результат!" : `~${pr.estimated1RM} кг (1RM)`}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── 1.7 Body Transformation ──────────────────────────────────────────────────

type WeightPayload = { weight: number; recordedAt: string; notes?: string };

function BodyTransformation({
  body, onAddWeight, onAddMeasurements,
}: {
  body: ProgressSummaryV2["body"];
  onAddWeight: () => void;
  onAddMeasurements: () => void;
}) {
  const [tab, setTab] = useState<"weight" | "measurements">("weight");
  const w = body.currentWeight;
  const delta = body.weightDelta;
  const bmi = body.bmi;
  const m = body.measurements.latest;
  const dm = body.measurements.deltaFromFirst;

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionTitle icon={<Scale size={18} color="#0f172a" strokeWidth={2.5} />} title="Трансформация" />
        <TabSwitcher tabs={["Вес", "Замеры"]} active={tab === "weight" ? "Вес" : "Замеры"} onChange={(t) => setTab(t === "Вес" ? "weight" : "measurements")} />
      </div>
      {tab === "weight" ? (
        <WeightTab w={w} delta={delta} bmi={bmi} weightSource={body.weightSource} onAddWeight={onAddWeight} />
      ) : (
        <MeasurementsTab m={m} dm={dm} onAddMeasurements={onAddMeasurements} />
      )}
    </GlassCard>
  );
}

function WeightTab({ w, delta, bmi, weightSource, onAddWeight }: {
  w: number | null; delta: number | null; bmi: number | null; weightSource: "metrics" | "onboarding"; onAddWeight: () => void;
}) {
  if (w == null) {
    return (
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.55)" }}>Нет данных о весе</div>
        <button style={s.ctaBtn} onClick={onAddWeight}>+ Записать вес</button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: "#1e1f22", fontVariantNumeric: "tabular-nums" }}>{Number(w).toFixed(1)}</span>
        <span style={{ fontSize: 16, color: "rgba(15,23,42,0.62)" }}>кг</span>
        {delta != null && <Delta value={delta} />}
      </div>
      {weightSource === "onboarding" && (
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.45)", marginTop: 4 }}>Вес из анкеты — запиши актуальный!</div>
      )}
      {bmi != null && (
        <div style={{ marginTop: 8, fontSize: 13, color: "rgba(15,23,42,0.62)" }}>
          ИМТ: <strong>{bmi}</strong> {bmiLabel(bmi)}
        </div>
      )}
      <button style={{ ...s.ctaBtn, marginTop: 12 }} onClick={onAddWeight}>+ Записать вес</button>
    </div>
  );
}

function bmiLabel(bmi: number) {
  if (bmi < 18.5) return "(дефицит)";
  if (bmi < 25) return "(норма ✓)";
  if (bmi < 30) return "(избыток)";
  return "(ожирение)";
}

function MeasurementsTab({ m, dm, onAddMeasurements }: {
  m: BodyMeasurement | null;
  dm: Partial<Omit<BodyMeasurement, "recorded_at" | "notes">> | null;
  onAddMeasurements: () => void;
}) {
  if (!m) {
    return (
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.55)", marginBottom: 8 }}>Запиши обхваты для отслеживания трансформации</div>
        <button style={s.ctaBtn} onClick={onAddMeasurements}>+ Записать замеры</button>
      </div>
    );
  }

  const fields: Array<{ key: keyof typeof m; label: string }> = [
    { key: "chest_cm", label: "Грудь" }, { key: "waist_cm", label: "Талия" }, { key: "hips_cm", label: "Бёдра" },
    { key: "bicep_left_cm", label: "Бицепс Л" }, { key: "bicep_right_cm", label: "Бицепс П" },
    { key: "neck_cm", label: "Шея" }, { key: "thigh_cm", label: "Бедро" },
  ];
  const filled = fields.filter((f) => m[f.key] != null);
  if (filled.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.55)" }}>Нет заполненных замеров</div>
        <button style={s.ctaBtn} onClick={onAddMeasurements}>+ Добавить замеры</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {filled.map((f) => {
          const val = m[f.key] as number;
          const d = dm ? (dm as any)[f.key] as number | undefined : undefined;
          return (
            <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
              <span style={{ fontSize: 13, color: "rgba(15,23,42,0.62)" }}>{f.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1e1f22" }}>
                {val} см {d != null && d !== 0 ? <Delta value={d} /> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "rgba(15,23,42,0.4)", marginBottom: 8 }}>Замер от {fmtDate(m.recorded_at)}</div>
      <button style={s.ctaBtn} onClick={onAddMeasurements}>+ Обновить замеры</button>
    </div>
  );
}

// ─── 1.8 Activity Heatmap ─────────────────────────────────────────────────────

function ActivityHeatmap({ activity }: { activity: ProgressSummaryV2["activity"] }) {
  // Show last 12 weeks (84 days)
  const today = new Date();
  const days = activity.days ?? [];

  // Build 12-week grid from oldest to newest
  const rows: Array<{ date: string; completed: boolean }[]> = [];
  const dayMap = new Map(days.map((d) => [d.date, d.completed]));

  // Start from the Monday 12 weeks ago
  const startDate = new Date(today);
  const dayOfWeek = (startDate.getDay() + 6) % 7; // Mon=0
  startDate.setDate(startDate.getDate() - dayOfWeek - 77); // 12 weeks = 84 days, start on Monday

  for (let week = 0; week < 12; week++) {
    const weekDays: { date: string; completed: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(startDate);
      dt.setDate(startDate.getDate() + week * 7 + d);
      const iso = dt.toISOString().slice(0, 10);
      weekDays.push({ date: iso, completed: dayMap.get(iso) ?? false });
    }
    rows.push(weekDays);
  }

  const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const todayIso = today.toISOString().slice(0, 10);

  return (
    <GlassCard>
      <SectionTitle icon={<CalendarDays size={18} color="#0f172a" strokeWidth={2.5} />} title="Активность" />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginTop: 4 }}>
        {/* Day labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 2 }}>
          {dayLabels.map((d) => (
            <div key={d} style={{ height: 14, fontSize: 9, color: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center" }}>{d}</div>
          ))}
        </div>
        {/* Weeks */}
        {rows.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            {week.map((day) => (
              <div
                key={day.date}
                style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: day.completed ? FILL_BG : GROOVE_BG,
                  boxShadow: day.completed ? FILL_SHADOW : GROOVE_SHADOW,
                  outline: day.date === todayIso ? "2px solid #3B82F6" : "none",
                  outlineOffset: 1,
                }}
                title={day.date}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {[
          { label: "Серия", value: `${activity.dayStreakCurrent} дн.` },
          { label: "Рекорд", value: `${activity.dayStreakBest} дн.` },
          { label: "Эта неделя", value: activity.weeklyGoal ? `${activity.completedThisWeek}/${activity.weeklyGoal}` : `${activity.completedThisWeek}` },
          { label: "Месяц", value: `${activity.completedThisMonth}` },
        ].map(({ label, value }) => (
          <div key={label} style={s.actStat}>
            <div style={{ fontSize: 11, color: "rgba(15,23,42,0.55)", fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e1f22", marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── 1.9 Volume Trend ────────────────────────────────────────────────────────

function VolumeTrend({ volumeTrend }: { volumeTrend: ProgressSummaryV2["volumeTrend"] }) {
  const weeks = volumeTrend.weeks.filter((w) => w.tonnage > 0 || w.weekStart >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  if (weeks.length === 0) return null;

  const maxTonnage = Math.max(...weeks.map((w) => w.tonnage), 1);

  return (
    <GlassCard>
      <SectionTitle icon={<BarChart3 size={18} color="#0f172a" strokeWidth={2.5} />} title="Объём нагрузки" />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginTop: 12, overflowX: "auto" }}>
        {weeks.map((week) => {
          const pct = maxTonnage > 0 ? (week.tonnage / maxTonnage) * 100 : 0;
          const label = fmtWeekStart(week.weekStart);
          return (
            <div key={week.weekStart} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 36, flex: 1 }}>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 80 }}>
                <div style={{ borderRadius: 999, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, position: "relative", width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ width: "100%", background: FILL_BG, boxShadow: FILL_SHADOW, borderRadius: 999, height: `${pct}%`, minHeight: pct > 0 ? 4 : 0, transition: "height 600ms ease" }} />
                </div>
              </div>
              <div style={{ fontSize: 9, color: "rgba(15,23,42,0.4)", textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
            </div>
          );
        })}
      </div>
      {/* Average line indicator */}
      {volumeTrend.avgTonnage != null && (
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "rgba(15,23,42,0.62)" }}>
            Средний тоннаж: <strong>{volumeTrend.avgTonnage.toLocaleString("ru")} кг</strong>
          </span>
          {volumeTrend.trendPercent != null && (
            <span style={{ fontSize: 13, color: volumeTrend.trendPercent > 0 ? "#16A34A" : volumeTrend.trendPercent < -5 ? "#EF4444" : "rgba(15,23,42,0.62)" }}>
              {volumeTrend.trendPercent > 0 ? "↑" : volumeTrend.trendPercent < 0 ? "↓" : "→"} {Math.abs(volumeTrend.trendPercent)}%
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ─── 1.10 Recovery Trends ────────────────────────────────────────────────────

function RecoveryTrends({ recovery }: { recovery: ProgressSummaryV2["recovery"] }) {
  if (!recovery.hasEnoughData) {
    return (
      <GlassCard>
        <SectionTitle icon={<Moon size={18} color="#0f172a" strokeWidth={2.5} />} title="Восстановление" />
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.55)", lineHeight: 1.5, marginTop: 4 }}>
          Заполняй чек-ин перед тренировкой — Моро проанализирует как сон и стресс влияют на результаты.
        </div>
        <div style={{ fontSize: 11, color: "rgba(15,23,42,0.35)", marginTop: 8 }}>
          {recovery.checkInCount} / 3 чек-инов собрано
        </div>
        <GrooveBar percent={(recovery.checkInCount / 3) * 100} height={6} />
      </GlassCard>
    );
  }

  const items = [
    { icon: <Moon size={18} color="#6366F1" strokeWidth={2} />, value: recovery.avgSleep != null ? `${recovery.avgSleep} ч` : "—", label: "Сон", trend: recovery.sleepTrend },
    { icon: <Zap size={18} color="#F59E0B" strokeWidth={2} />, value: recovery.avgEnergy ?? "—", label: "Энергия", trend: recovery.energyTrend },
    { icon: <Brain size={18} color="#EC4899" strokeWidth={2} />, value: recovery.avgStress ?? "—", label: "Стресс", trend: recovery.stressTrend },
  ];

  const trendIcon = (t: string | null) => t === "improving" ? "↑" : t === "declining" ? "↓" : t === "stable" ? "→" : "";
  const trendColor = (t: string | null) => t === "improving" ? "#16A34A" : t === "declining" ? "#EF4444" : "rgba(15,23,42,0.4)";

  return (
    <GlassCard>
      <SectionTitle icon={<Moon size={18} color="#0f172a" strokeWidth={2.5} />} title="Восстановление" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 4 }}>
        {items.map((item) => (
          <GrooveBox key={item.label} style={{ textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e1f22" }}>
              {item.value}
              {item.trend && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 3, color: trendColor(item.trend) }}>{trendIcon(item.trend)}</span>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(15,23,42,0.55)", marginTop: 2 }}>{item.label}</div>
          </GrooveBox>
        ))}
      </div>
      {recovery.insight && (
        <div style={{ marginTop: 12, fontSize: 13, color: "rgba(15,23,42,0.62)", lineHeight: 1.5 }}>
          💡 {recovery.insight}
        </div>
      )}
    </GlassCard>
  );
}

// ─── 1.11 Achievements ───────────────────────────────────────────────────────

function AchievementsPreview({ achievements }: { achievements: ProgressSummaryV2["achievements"] }) {
  const { earned, upcoming } = achievements;
  return (
    <GlassCard>
      <SectionTitle icon={<Award size={18} color="#0f172a" strokeWidth={2.5} />} title="Достижения" />
      {/* Earned */}
      {earned.length > 0 && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
          {earned.map((a) => (
            <div key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 56 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: FILL_BG, boxShadow: FILL_SHADOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                {a.icon}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: "#1e1f22", textAlign: "center", maxWidth: 56, lineHeight: 1.2 }}>{a.title}</span>
            </div>
          ))}
        </div>
      )}
      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {upcoming.map((u) => (
            <div key={u.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{u.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#1e1f22" }}>{u.title}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(15,23,42,0.55)" }}>{u.current}/{u.target}</span>
              </div>
              <GrooveBar percent={u.percent} height={8} />
            </div>
          ))}
        </div>
      )}
      {earned.length === 0 && upcoming.length === 0 && (
        <div style={{ fontSize: 13, color: "rgba(15,23,42,0.45)", textAlign: "center", padding: "12px 0" }}>Продолжай тренироваться!</div>
      )}
    </GlassCard>
  );
}

// ─── Weight Modal ─────────────────────────────────────────────────────────────

function WeightModal({ onClose, onSave }: { onClose: () => void; onSave: (payload: WeightPayload) => Promise<void> }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const numericWeight = Number(weight.replace(",", "."));
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) { alert("Введи корректный вес."); return; }
    setSaving(true);
    await onSave({ recordedAt: date, weight: numericWeight, notes: notes.trim() || undefined });
    setSaving(false);
  };

  return (
    <div style={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modalCard}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Записать вес</h3>
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <label style={s.modalLabel}><span>Дата</span>
          <input style={s.modalInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={s.modalLabel}><span>Вес (кг)</span>
          <input style={s.modalInput} type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Например, 80.5" />
        </label>
        <label style={s.modalLabel}><span>Заметка (опц.)</span>
          <textarea style={{ ...s.modalInput, height: 72, resize: "vertical" as const }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button style={s.modalSaveBtn} onClick={handleSubmit} disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</button>
      </div>
    </div>
  );
}

// ─── Measurements Modal ───────────────────────────────────────────────────────

type MeasurementsPayload = {
  recordedAt: string; chest_cm?: number; waist_cm?: number; hips_cm?: number;
  bicep_left_cm?: number; bicep_right_cm?: number; neck_cm?: number; thigh_cm?: number; notes?: string;
};

function MeasurementsModal({ onClose, onSave }: { onClose: () => void; onSave: (p: MeasurementsPayload) => Promise<void> }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fieldDefs = [
    { key: "chest_cm", label: "Грудь (см)" }, { key: "waist_cm", label: "Талия (см)" },
    { key: "hips_cm", label: "Бёдра (см)" }, { key: "bicep_left_cm", label: "Бицепс Л (см)" },
    { key: "bicep_right_cm", label: "Бицепс П (см)" }, { key: "neck_cm", label: "Шея (см)" },
    { key: "thigh_cm", label: "Бедро (см)" },
  ];

  const handleSubmit = async () => {
    setSaving(true);
    const payload: MeasurementsPayload = { recordedAt: date, notes: notes.trim() || undefined };
    for (const f of fieldDefs) {
      const v = Number(fields[f.key]?.replace(",", "."));
      if (Number.isFinite(v) && v > 0) (payload as any)[f.key] = v;
    }
    await onSave(payload);
    setSaving(false);
  };

  return (
    <div style={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modalCard, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Замеры тела</h3>
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <label style={s.modalLabel}><span>Дата</span>
          <input style={s.modalInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {fieldDefs.map((f) => (
          <label key={f.key} style={s.modalLabel}><span>{f.label}</span>
            <input style={s.modalInput} type="number" step="0.1" value={fields[f.key] ?? ""} placeholder="—"
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))} />
          </label>
        ))}
        <label style={s.modalLabel}><span>Заметка (опц.)</span>
          <textarea style={{ ...s.modalInput, height: 60, resize: "vertical" as const }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button style={s.modalSaveBtn} onClick={handleSubmit} disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</button>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Progress() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProgressSummaryV2 | null>(() => readProgressCache());
  const [loading, setLoading] = useState(summary === null);
  const [error, setError] = useState<string | null>(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false);

  useEffect(() => {
    fireHaptic("light");
    load();
  }, []);

  const load = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const data = await getProgressSummary();
      setSummary(data);
      setError(null);
    } catch (err) {
      console.error(err);
      if (!summary) setError("Не удалось загрузить прогресс");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !summary) {
    return (
      <div style={page.outer}>
        <ProgressStyles />
        <div style={page.inner}>
          <SkeletonCard height={72} />
          <SkeletonCard height={56} />
          <SkeletonCard height={110} />
          <SkeletonCard height={140} />
          <SkeletonCard height={160} />
        </div>
        <NavBar current="none" onChange={(t) => {
          if (t === "home") navigate("/");
          if (t === "plan") navigate("/schedule");
          if (t === "coach") navigate("/coach");
          if (t === "profile") navigate("/profile");
        }} />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div style={page.outer}>
        <ProgressStyles />
        <div style={page.inner}>
          <GlassCard><div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 14, color: "#EF4444", marginBottom: 12 }}>{error}</div>
            <button style={s.ctaBtn} onClick={() => load(true)}>Повторить</button>
          </div></GlassCard>
        </div>
        <NavBar current="none" onChange={(t) => {
          if (t === "home") navigate("/");
          if (t === "plan") navigate("/schedule");
          if (t === "coach") navigate("/coach");
          if (t === "profile") navigate("/profile");
        }} />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div style={page.outer}>
      <ProgressStyles />
      <div style={page.inner}>
        <ProgressHeader level={summary.level ?? 1} daysWithApp={summary.daysWithApp ?? summary.stats?.daysWithApp ?? 1} />

        <StatPill
          weekStreak={summary.weekStreak ?? summary.stats?.planSeriesCurrent ?? 0}
          workoutsTotal={summary.workoutsTotal ?? summary.stats?.workoutsTotal ?? 0}
          tonnageDelta30d={summary.tonnageDelta30d ?? null}
        />

        {summary.aiInsight && (
          <div className="res-fade res-d2">
            <AiInsight text={summary.aiInsight.text} />
          </div>
        )}

        {summary.goalJourney && (
          <div className="res-fade res-d3">
            <GoalJourney journey={summary.goalJourney} />
          </div>
        )}

        {summary.muscleAccent && (
          <div className="res-fade res-d4">
            <MuscleAccent muscleAccent={summary.muscleAccent} />
          </div>
        )}

        {summary.personalRecords && summary.personalRecords.length > 0 && (
          <div className="res-fade res-d5">
            <PersonalRecords records={summary.personalRecords} />
          </div>
        )}

        {summary.body && (
          <div className="res-fade res-d6">
            <BodyTransformation
              body={summary.body}
              onAddWeight={() => setShowWeightModal(true)}
              onAddMeasurements={() => setShowMeasurementsModal(true)}
            />
          </div>
        )}

        {summary.activity && (
          <div className="res-fade res-d7">
            <ActivityHeatmap activity={summary.activity} />
          </div>
        )}

        {summary.volumeTrend && (
          <div className="res-fade res-d8">
            <VolumeTrend volumeTrend={summary.volumeTrend} />
          </div>
        )}

        {summary.recovery && (
          <div className="res-fade res-d9">
            <RecoveryTrends recovery={summary.recovery} />
          </div>
        )}

        {summary.achievements && (
          <div className="res-fade res-d10">
            <AchievementsPreview achievements={
              // Handle both v1 (array) and v2 (object) formats
              Array.isArray(summary.achievements)
                ? { earned: [], upcoming: [] }
                : summary.achievements as { earned: any[]; upcoming: any[] }
            } />
          </div>
        )}

        <div style={{ height: 88 }} />
      </div>

      <NavBar current="none" onChange={(t) => {
        if (t === "home") navigate("/");
        if (t === "plan") navigate("/schedule");
        if (t === "coach") navigate("/coach");
        if (t === "profile") navigate("/profile");
      }} />

      {showWeightModal && (
        <WeightModal
          onClose={() => setShowWeightModal(false)}
          onSave={async (payload) => {
            try {
              await saveBodyMetric(payload);
              fireHaptic("medium");
              setShowWeightModal(false);
              load();
            } catch { alert("Не удалось сохранить замер"); }
          }}
        />
      )}

      {showMeasurementsModal && (
        <MeasurementsModal
          onClose={() => setShowMeasurementsModal(false)}
          onSave={async (payload) => {
            try {
              await saveMeasurements(payload);
              fireHaptic("medium");
              setShowMeasurementsModal(false);
              load();
            } catch { alert("Не удалось сохранить замеры"); }
          }}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const page: Record<string, CSSProperties> = {
  outer: { minHeight: "100vh", width: "100%", padding: "16px 16px 0", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif" },
  inner: {
    maxWidth: 720, margin: "0 auto",
    display: "flex", flexDirection: "column", gap: 14,
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
  },
};

const s: Record<string, CSSProperties> = {
  // Header
  headerRow: { display: "flex", alignItems: "center", gap: 12 },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 999, flexShrink: 0,
    background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 2,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" as const, objectPosition: "center 10%", borderRadius: 999 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: "#1e1f22", lineHeight: 1.2 },
  headerSub: { fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", marginTop: 2 },

  // Stat pill
  statPill: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderRadius: 24, padding: "14px 18px",
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "0 16px 32px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.08)",
  },
  statChip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" },
  statChipDiv: { width: 1, height: 18, background: "rgba(255,255,255,0.15)" },

  // Glass card
  glassCard: {
    borderRadius: 24, padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
  },

  // Section title
  sectionTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 14 },

  // Tab switcher
  tabWrap: { display: "flex", gap: 2, background: GROOVE_BG, boxShadow: GROOVE_SHADOW, padding: 3, borderRadius: 999 },
  tabBtn: { border: "none", background: "transparent", padding: "5px 10px", borderRadius: 999, fontWeight: 600, fontSize: 11, color: "rgba(15,23,42,0.55)", cursor: "pointer" },
  tabActive: { border: "none", background: FILL_BG, boxShadow: FILL_SHADOW, padding: "5px 10px", borderRadius: 999, fontWeight: 700, fontSize: 11, color: "rgba(255,255,255,0.9)", cursor: "pointer" },

  // Speech bubble
  speechBubble: {
    background: "rgba(255,255,255,0.7)", borderRadius: 16,
    padding: "12px 14px", flex: 1, position: "relative",
    border: "1px solid rgba(255,255,255,0.6)",
  },

  // Coach button
  coachBtn: {
    marginTop: 10, marginLeft: 84, border: "none",
    background: FILL_BG, boxShadow: FILL_SHADOW,
    color: "rgba(255,255,255,0.88)", borderRadius: 20, padding: "8px 16px",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
  },

  // PR card
  prCard: {
    minWidth: 150, borderRadius: 20, background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    padding: "14px 12px", flexShrink: 0,
  },

  // CTA button
  ctaBtn: {
    border: "none", background: FILL_BG, boxShadow: FILL_SHADOW,
    color: "rgba(255,255,255,0.88)", borderRadius: 20, padding: "10px 18px",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
  },

  // Activity stat chip
  actStat: {
    background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    borderRadius: 14, padding: "8px 12px", flex: 1, minWidth: 70,
  },

  // Modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 1000 },
  modalCard: {
    width: "min(420px, 100%)", background: "#fff", borderRadius: 24, padding: 22,
    boxShadow: "0 28px 50px rgba(15,23,42,0.4)", display: "grid", gap: 14,
  },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" },
  modalClose: { border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" },
  modalLabel: { display: "grid", gap: 5, fontSize: 12, fontWeight: 600, color: "#1f2937" },
  modalInput: {
    borderRadius: 14, border: "1px solid rgba(114,135,255,.2)", padding: "11px 14px",
    fontSize: 14, fontWeight: 500, color: "#0f172a", background: "#f8fafc", outline: "none",
  },
  modalSaveBtn: {
    border: "none", borderRadius: 20, padding: "13px 14px", fontWeight: 700, cursor: "pointer",
    background: FILL_BG, boxShadow: FILL_SHADOW, color: "rgba(255,255,255,0.9)",
    fontSize: 15,
  },
};
