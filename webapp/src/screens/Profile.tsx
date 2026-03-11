// webapp/src/screens/Profile.tsx — v2
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resetProfileRemote } from "@/api/profile";
import { saveOnboarding } from "@/api/onboarding";
import { NUTRITION_CACHE_KEY } from "@/hooks/useNutritionPlan";
import { getExcludedExerciseDetails, includeExercise } from "@/api/exercises";
import { createPortal } from "react-dom";
import { ArrowLeft, ClipboardList, Heart, Ban, X, Pencil, Calendar, UserRound, Ruler, Scale, Activity, Trash2 } from "lucide-react";
import ProfileEditSheet from "@/components/ProfileEditSheet";

type Summary = any;

// ─── Visual constants (same as Progress/WorkoutResult) ──────────────────────
const GROOVE_BG = "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)";
const GROOVE_SHADOW = "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)";
const FILL_BG = "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)";
const FILL_SHADOW = "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)";

const LOCAL_RESET_KEYS = [
  "onb_summary", "onb_feedback", "onb_feedback_pending", "onb",
  "onboarding_done", "onb_complete", "onb_history",
  "plan_cache_v2", "history_sessions_v1", "current_plan",
  "session_draft", "planned_workout_id", "schedule_cache_v1",
  "last_workout_result_v1", "scheme_selected", "highlight_generate_btn",
  "co2_test_result", "profile",
];

// ─── Data helpers ───────────────────────────────────────────────────────────

function safeNum(x: any, suffix?: string) {
  if (x === null || x === undefined || x === "") return "—";
  const n = Number(x);
  if (Number.isFinite(n)) return suffix ? `${n} ${suffix}` : String(n);
  return suffix ? `${x} ${suffix}` : String(x);
}

function goalRus(g?: string) {
  if (!g) return "—";
  const map: Record<string, string> = {
    lose_weight: "Сбросить лишнее",
    build_muscle: "Набрать мышцы",
    athletic_body: "Быть в форме",
    health_wellness: "Здоровье",
  };
  return map[g] || g;
}

function expRus(e: any) {
  const v = typeof e === "string" ? e : e?.level;
  const map: Record<string, string> = {
    beginner: "Новичок",
    intermediate: "Любитель",
    advanced: "Опытный",
    never_trained: "Новичок",
    long_break: "Новичок",
    training_regularly: "Любитель",
    training_experienced: "Опытный",
  };
  return map[String(v || "")] || v || "—";
}

function placeRus(p?: string) {
  if (!p) return "—";
  const map: Record<string, string> = {
    gym: "Тренажерный зал",
    home_no_equipment: "Дом, без инвентаря",
    home_with_gear: "Дом, с резинками и гантелями",
  };
  return map[p] || p;
}

function activityRus(w?: string) {
  if (!w) return "—";
  const map: Record<string, string> = {
    sedentary: "Мало подвижности",
    balanced: "Иногда двигаюсь",
    on_feet: "Весь день на ногах",
    heavy_work: "Постоянно в движении",
  };
  return map[w] || w;
}

function sexRus(s?: string) {
  if (s === "male") return "Муж";
  if (s === "female") return "Жен";
  return "—";
}

// ─── Card component (same as Progress) ─────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <div style={{ ...s.card, ...style }}>{children}</div>;
}

function InfoRow({ label, value, isLast }: { label: string; value: React.ReactNode; isLast?: boolean }) {
  return (
    <>
      <div style={s.infoRow}>
        <span style={s.infoLabel}>{label}</span>
        <span style={s.infoValue}>{typeof value === "string" || typeof value === "number" ? value : value}</span>
      </div>
      {!isLast && <div style={s.infoDivider} />}
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Profile() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tgProfile, setTgProfile] = useState<any>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Array<{ exerciseId: string; name: string }>>([]);
  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excludedError, setExcludedError] = useState<string | null>(null);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [editSheet, setEditSheet] = useState<"hero" | "plan" | "lifestyle" | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // ─── Data loading ───────────────────────────────────────────────────────

  function readAll() {
    try {
      const raw = localStorage.getItem("onb_summary");
      if (raw) setSummary(JSON.parse(raw));
      else setSummary(null);
    } catch { setSummary(null); }

    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        setTgProfile({
          id: tg.initDataUnsafe.user.id,
          first_name: tg.initDataUnsafe.user.first_name,
          last_name: tg.initDataUnsafe.user.last_name,
          username: tg.initDataUnsafe.user.username,
          photo_url: tg.initDataUnsafe.user.photo_url,
        });
      } else setTgProfile(null);
    } catch { setTgProfile(null); }
  }

  useEffect(() => {
    readAll();
    setLoaded(true);
    const onFocus = () => readAll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ─── Excluded exercises logic ───────────────────────────────────────────

  const loadExcluded = async () => {
    setExcludedLoading(true);
    setExcludedError(null);
    try {
      const list = await getExcludedExerciseDetails();
      setExcluded(Array.isArray(list) ? list : []);
    } catch {
      setExcludedError("Не удалось загрузить исключённые упражнения.");
    } finally {
      setExcludedLoading(false);
    }
  };

  useEffect(() => { void loadExcluded(); }, []);

  const removeExcluded = async (exerciseId: string) => {
    try {
      await includeExercise({ exerciseId });
      await loadExcluded();
    } catch { setExcludedError("Не удалось вернуть упражнение."); }
  };

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleResetProfile = async () => {
    if (resetting) return;
    try {
      setResetting(true);
      setResetError(null);
      await resetProfileRemote();
      [...LOCAL_RESET_KEYS, NUTRITION_CACHE_KEY].forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
      setSummary(null);
      window.location.replace("/");
    } catch {
      setResetError("Не удалось удалить профиль. Попробуй ещё раз.");
    } finally {
      setResetting(false);
    }
  };

  // ─── Edit sheet save handler ────────────────────────────────────────────

  const handleEditSave = async (updatedSummary: any) => {
    try {
      localStorage.setItem("onb_summary", JSON.stringify(updatedSummary));
      setSummary(updatedSummary);
      await saveOnboarding(updatedSummary);
    } catch {
      // localStorage is already updated; API failure is non-blocking
    }
  };

  // ─── Derived data ───────────────────────────────────────────────────────

  const onb = summary || {};
  const avatarUrl = tgProfile?.photo_url;
  const rawName = onb?.profile?.name || onb?.name;
  const name = (rawName && rawName !== "Спортсмен") ? rawName : tgProfile?.first_name || rawName || "—";
  const sex = onb?.ageSex?.sex || onb?.sex;
  const age = onb?.ageSex?.age ?? onb?.age;
  const height = onb?.body?.height ?? onb?.height;
  const weight = onb?.body?.weight ?? onb?.weight;
  const experience = onb?.experience;
  const perWeek = onb?.schedule?.perWeek ?? onb?.schedule?.daysPerWeek ?? onb?.daysPerWeek ?? onb?.perWeek;
  const minutes = onb?.schedule?.minutesPerSession ?? onb?.schedule?.minutes ?? onb?.schedule?.sessionMinutes ?? onb?.minutes ?? onb?.minutesPerSession;
  const place = onb?.trainingPlace?.place || onb?.environment?.location;
  const goal = onb?.motivation?.goal || onb?.goals?.primary;
  const workStyle = onb?.lifestyle?.workStyle;

  const dietRestr: string[] = onb?.dietPrefs?.restrictions || [];
  const dietStyles: string[] = onb?.dietPrefs?.styles || [];

  const bmi = useMemo(() => {
    const h = Number(height);
    const w = Number(weight);
    if (!h || !w || h < 100) return null;
    return w / ((h / 100) ** 2);
  }, [height, weight]);

  const bmiColor = useMemo(() => {
    if (!bmi) return "rgba(255,255,255,0.88)";
    if (bmi < 18.5) return "#60a5fa";  // underweight — blue
    if (bmi < 25) return "#4ade80";    // normal — green
    if (bmi < 30) return "#fbbf24";    // overweight — amber
    return "#f87171";                   // obese — red
  }, [bmi]);

  const initials = useMemo(() => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  }, [name]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.outer}>
      <div style={s.inner}>

        {/* ── Hero: Avatar + Name + Chips (like WorkoutResult) ── */}
        <div style={s.headerRow}>
          <div style={s.avatarCircle}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} style={s.avatarImg} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span style={s.avatarText}>{initials}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.headerTitle}>{name}</div>
            <div style={s.headerSubRow}>
              <span style={s.headerSubChip}>
                <Calendar size={15} strokeWidth={2.2} color="rgba(30,31,34,0.7)" />
                {safeNum(age)} лет
              </span>
              <span style={s.headerSubChip}>
                <UserRound size={15} strokeWidth={2.2} color="rgba(30,31,34,0.7)" />
                {sexRus(sex)}
              </span>
              <button
                type="button"
                aria-label="Редактировать"
                onClick={() => setEditSheet("hero")}
                style={{ ...s.editBtn, marginRight: 18 }}
              >
                <Pencil size={18} strokeWidth={2} color="#1e1f22" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Stat pill: Height, Weight, BMI (like WorkoutResult) ── */}
        <div style={s.statPill}>
          <span style={s.statChip}>
            <Ruler size={15} strokeWidth={2.2} color="rgba(255,255,255,0.88)" />
            {safeNum(height, "см")}
          </span>
          <span style={s.statChip}>
            <Scale size={15} strokeWidth={2.2} color="rgba(255,255,255,0.88)" />
            {safeNum(weight, "кг")}
          </span>
          <span style={{ ...s.statChip, color: bmiColor }}>
            <Activity size={15} strokeWidth={2.2} color={bmiColor} />
            {bmi ? `${bmi.toFixed(1)} имт` : "—"}
          </span>
        </div>

        {/* ── Тренировки ── */}
        <Card>
          <div style={s.sectionHeader}>
            <ClipboardList size={18} color="#0f172a" strokeWidth={2.5} />
            <span style={s.sectionTitle}>Мой план</span>
            <button type="button" aria-label="Редактировать" onClick={() => setEditSheet("plan")} style={s.editBtn}>
              <Pencil size={18} strokeWidth={2} color="#1e1f22" />
            </button>
          </div>
          <div style={s.infoGrid}>
            <InfoRow label="Цель" value={goalRus(goal)} />
            <InfoRow label="Опыт" value={expRus(experience)} />
            <InfoRow label="Частота" value={safeNum(perWeek, "раз/нед")} />
            <InfoRow label="Длительность" value={safeNum(minutes, "мин")} />
            <InfoRow label="Место" value={placeRus(place)} isLast />
          </div>
        </Card>

        {/* ── Образ жизни ── */}
        <Card>
          <div style={s.sectionHeader}>
            <Heart size={18} color="#0f172a" strokeWidth={2.5} />
            <span style={s.sectionTitle}>Образ жизни</span>
            <button type="button" aria-label="Редактировать" onClick={() => setEditSheet("lifestyle")} style={s.editBtn}>
              <Pencil size={18} strokeWidth={2} color="#1e1f22" />
            </button>
          </div>
          <div style={s.infoGrid}>
            {dietStyles.length > 0 && (
              <InfoRow label="Стиль питания" value={dietStyles.join(", ")} />
            )}
            <InfoRow label="Ограничения" value={dietRestr.length > 0 ? dietRestr.join(", ") : "Нет"} />
            <InfoRow label="Активность" value={activityRus(workStyle)} isLast />
          </div>
        </Card>

        {/* ── Исключённые упражнения ── */}
        <Card>
          <button
            type="button"
            onClick={() => setExcludedOpen(true)}
            style={s.excludedHeaderBtn}
          >
            <div style={s.sectionHeader}>
              <Ban size={18} color="#0f172a" strokeWidth={2.5} />
              <span style={s.sectionTitle}>Исключённые упражнения</span>
            </div>
            <span style={s.excludedArrow}>→</span>
          </button>
          <span style={s.accordionSub}>
            Упражнения, которые не будут предлагаться в&nbsp;тренировках
          </span>
        </Card>

        {/* ── Сброс профиля ── */}
        <Card style={s.resetCard}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>Удалить профиль</span>
          </div>
          <p style={s.resetText}>
            Удалим анкету, планы питания и тренировок, расписание и историю. Вернёшься на стартовый экран.
          </p>
          {resetError && <div style={s.errorNote}>{resetError}</div>}
          <button
            type="button"
            style={{ ...s.resetBtn, opacity: resetting ? 0.5 : 1 }}
            onClick={() => setResetConfirmOpen(true)}
            disabled={resetting}
          >
            <span>{resetting ? "Удаляю…" : "Удалить"}</span>
            <span style={s.resetBtnIconWrap}>
              <Trash2 size={16} strokeWidth={2.2} color="#b91c1c" />
            </span>
          </button>
        </Card>

        <div style={{ height: 8 }} />
      </div>

      <ProfileEditSheet
        section={editSheet}
        summary={summary}
        onSave={(updated) => { void handleEditSave(updated); }}
        onClose={() => setEditSheet(null)}
      />

      {excludedOpen && (
        <ExcludedSheet
          excluded={excluded}
          excludedLoading={excludedLoading}
          excludedError={excludedError}
          onRemove={removeExcluded}
          onClose={() => setExcludedOpen(false)}
        />
      )}

      {resetConfirmOpen && (
        <ResetConfirmSheet
          resetting={resetting}
          onConfirm={handleResetProfile}
          onClose={() => setResetConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Excluded Exercises Sheet ─────────────────────────────────────────────────

const EX_SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const EX_SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const EX_SPRING_CONTENT = "cubic-bezier(0.36, 0.66, 0.04, 1)";
const EX_ENTER_MS = 380;
const EX_EXIT_MS = 260;
const EX_CONTENT_ANIM_MS = 280;

function ExcludedSheet({
  excluded, excludedLoading, excludedError,
  onRemove, onClose,
}: {
  excluded: Array<{ exerciseId: string; name: string }>;
  excludedLoading: boolean;
  excludedError: string | null;
  onRemove: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ exerciseId: string; name: string } | null>(null);
  const [slideDir, setSlideDir] = useState<"forward" | "backward">("forward");
  const [prevPage, setPrevPage] = useState<string | null>(null);
  const [pageAnimating, setPageAnimating] = useState(false);
  const pageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setEntered(true);
      const t2 = setTimeout(() => setAnimDone(true), EX_ENTER_MS + 50);
      return () => clearTimeout(t2);
    }, 12);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    return () => { if (pageTimerRef.current != null) window.clearTimeout(pageTimerRef.current); };
  }, []);

  const goToPage = (direction: "forward" | "backward") => {
    if (pageTimerRef.current != null) window.clearTimeout(pageTimerRef.current);
    setPrevPage("snapshot");
    setSlideDir(direction);
    setPageAnimating(true);
    pageTimerRef.current = window.setTimeout(() => {
      setPrevPage(null);
      setPageAnimating(false);
      pageTimerRef.current = null;
    }, EX_CONTENT_ANIM_MS + 20);
  };

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setAnimDone(false);
    setEntered(false);
    setTimeout(onClose, EX_EXIT_MS + 20);
  };

  const openConfirm = (ex: { exerciseId: string; name: string }) => {
    setConfirmTarget(ex);
    goToPage("forward");
  };

  const goBackToList = () => {
    setConfirmTarget(null);
    goToPage("backward");
  };

  const handleConfirmRemove = async () => {
    if (!confirmTarget) return;
    await onRemove(confirmTarget.exerciseId);
    goBackToList();
  };

  const headerTitle = confirmTarget ? "Вернуть упражнение" : "Исключённые упражнения";

  return createPortal(
    <>
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(10,16,28,0.52)",
          opacity: entered && !closing ? 1 : 0,
          transition: `opacity ${entered ? EX_ENTER_MS : EX_EXIT_MS}ms ease`,
        }}
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2001,
          borderRadius: "24px 24px 0 0",
          background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,242,247,0.95) 100%)",
          boxShadow: "0 -8px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
          maxHeight: "85vh",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "0 16px 16px",
          transform: animDone ? "none" : (entered && !closing ? "translateY(0)" : "translateY(100%)"),
          transition: animDone ? "none" : `transform ${entered && !closing ? EX_ENTER_MS : EX_EXIT_MS}ms ${entered && !closing ? EX_SPRING_OPEN : EX_SPRING_CLOSE}`,
          willChange: animDone ? "auto" : "transform",
        }}
      >
        <style>{`
          @keyframes exsh-in-right { from { opacity: 0; transform: translate3d(44px, 0, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
          @keyframes exsh-in-left { from { opacity: 0; transform: translate3d(-44px, 0, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
          @keyframes exsh-out-left { from { opacity: 1; transform: translate3d(0, 0, 0); } to { opacity: 0; transform: translate3d(-44px, 0, 0); } }
          @keyframes exsh-out-right { from { opacity: 1; transform: translate3d(0, 0, 0); } to { opacity: 0; transform: translate3d(44px, 0, 0); } }
        `}</style>

        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.18)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 8px 8px", flexShrink: 0 }}>
          {confirmTarget ? (
            <button
              type="button"
              onClick={goBackToList}
              aria-label="Назад"
              style={{
                width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", borderRadius: 999, color: "rgba(15,23,42,0.62)",
                cursor: "pointer", padding: 0, flexShrink: 0,
              }}
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
          ) : (
            <div style={{ width: 32, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, textAlign: "center" }}>
            {headerTitle}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            style={{
              width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent", borderRadius: 999, color: "rgba(15,23,42,0.62)",
              cursor: "pointer", padding: 0, flexShrink: 0,
            }}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        {/* Content with page animations */}
        <div style={{ display: "grid", flex: 1, minHeight: 0 }}>
          {pageAnimating && prevPage ? (
            <div
              style={{
                gridArea: "1 / 1",
                display: "flex",
                flexDirection: "column" as const,
                animation: `${slideDir === "forward" ? "exsh-out-left" : "exsh-out-right"} ${EX_CONTENT_ANIM_MS}ms ${EX_SPRING_CONTENT} both`,
                pointerEvents: "none" as const,
              }}
            />
          ) : null}
          <div
            style={{
              gridArea: "1 / 1",
              display: "flex",
              flexDirection: "column" as const,
              ...(pageAnimating
                ? { animation: `${slideDir === "forward" ? "exsh-in-right" : "exsh-in-left"} ${EX_CONTENT_ANIM_MS}ms ${EX_SPRING_CONTENT} both` }
                : null),
            }}
          >
            {!confirmTarget ? (
              /* ── Page 1: List ── */
              <div>
                {excludedError && (
                  <div style={{ ...s.errorNote, marginBottom: 10 }}>{excludedError}</div>
                )}

                {excludedLoading ? (
                  <span style={{ ...s.muted, display: "block", padding: "8px 2px" }}>Загружаю…</span>
                ) : excluded.length === 0 ? (
                  <div style={exSh.row}>
                    <span style={{ ...exSh.name, color: "rgba(15,23,42,0.45)" }}>Пока пусто</span>
                  </div>
                ) : (
                  excluded.slice(0, 80).map((x, idx) => (
                    <div key={x.exerciseId}>
                      {idx > 0 && <div style={exSh.divider} />}
                      <div style={exSh.row}>
                        <span style={exSh.name}>{x.name}</span>
                        <button
                          type="button"
                          aria-label="Убрать из исключённых"
                          style={exSh.removeXBtn}
                          onClick={() => openConfirm(x)}
                        >
                          <X size={16} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* ── Page 2: Confirm removal ── */
              <div style={{ padding: "20px 8px", display: "flex", flexDirection: "column" as const, gap: 16 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: "rgba(15,23,42,0.7)", lineHeight: 1.45, textAlign: "center" }}>
                  «{confirmTarget.name}» снова будет предлагаться в&nbsp;тренировках
                </p>
                <div style={{ display: "grid", gap: 0 }}>
                  <button
                    type="button"
                    style={exSh.confirmBtn}
                    onClick={() => void handleConfirmRemove()}
                  >
                    Вернуть
                  </button>
                  <div style={exSh.divider} />
                  <button
                    type="button"
                    style={exSh.cancelBtn}
                    onClick={goBackToList}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

const exSh: Record<string, CSSProperties> = {
  row: {
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    lineHeight: 1.3,
    flex: 1,
    minWidth: 0,
  },
  divider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginRight: -18,
  },
  removeXBtn: {
    width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: "none", background: "transparent", borderRadius: 999, color: "rgba(15,23,42,0.45)",
    cursor: "pointer", padding: 0, flexShrink: 0,
  },
  confirmBtn: {
    padding: "14px 18px", border: "none", background: "transparent",
    fontSize: 18, fontWeight: 500, color: "#b91c1c", cursor: "pointer",
    textAlign: "left" as const,
  },
  cancelBtn: {
    padding: "14px 18px", border: "none", background: "transparent",
    fontSize: 18, fontWeight: 500, color: "#1e1f22", cursor: "pointer",
    textAlign: "left" as const,
  },
};

// ─── Reset Confirm Sheet ───────────────────────────────────────────────────────

function ResetConfirmSheet({
  resetting, onConfirm, onClose,
}: {
  resetting: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setEntered(true);
      const t2 = setTimeout(() => setAnimDone(true), EX_ENTER_MS + 50);
      return () => clearTimeout(t2);
    }, 12);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setAnimDone(false);
    setEntered(false);
    setTimeout(onClose, EX_EXIT_MS + 20);
  };

  return createPortal(
    <>
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(10,16,28,0.52)",
          opacity: entered && !closing ? 1 : 0,
          transition: `opacity ${entered ? EX_ENTER_MS : EX_EXIT_MS}ms ease`,
        }}
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2001,
          borderRadius: "24px 24px 0 0",
          background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,242,247,0.95) 100%)",
          boxShadow: "0 -8px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
          maxHeight: "85vh",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "0 16px 16px",
          transform: animDone ? "none" : (entered && !closing ? "translateY(0)" : "translateY(100%)"),
          transition: animDone ? "none" : `transform ${entered && !closing ? EX_ENTER_MS : EX_EXIT_MS}ms ${entered && !closing ? EX_SPRING_OPEN : EX_SPRING_CLOSE}`,
          willChange: animDone ? "auto" : "transform",
        }}
      >
        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.18)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 8px 8px", flexShrink: 0 }}>
          <div style={{ width: 32, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, textAlign: "center" }}>
            Удалить профиль
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            style={{
              width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent", borderRadius: 999, color: "rgba(15,23,42,0.62)",
              cursor: "pointer", padding: 0, flexShrink: 0,
            }}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px 8px", display: "flex", flexDirection: "column" as const, gap: 16 }}>
          <p style={{ margin: 0, fontSize: 15, color: "rgba(15,23,42,0.62)", lineHeight: 1.45, textAlign: "center", padding: "0 16px" }}>
            Удалим анкету, планы питания и&nbsp;тренировок, расписание и&nbsp;историю. Вернёшься на&nbsp;стартовый экран.
          </p>
          <div style={{ display: "grid", gap: 0 }}>
            <button
              type="button"
              style={{ ...exSh.confirmBtn, opacity: resetting ? 0.5 : 1 }}
              onClick={() => void onConfirm()}
              disabled={resetting}
            >
              {resetting ? "Удаляю…" : "Удалить"}
            </button>
            <div style={exSh.divider} />
            <button
              type="button"
              style={exSh.cancelBtn}
              onClick={requestClose}
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Styles (consistent with Progress screen) ───────────────────────────────

const s: Record<string, CSSProperties> = {
  outer: {
    minHeight: "100vh", width: "100%", padding: "16px 16px 0",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  },
  inner: {
    maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14,
    paddingTop: "calc(env(safe-area-inset-top,0px) + 6px)",
  },

  // Card — same as Progress
  card: {
    borderRadius: 24, padding: 18,
    background: "linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
  },

  // Hero — like WorkoutResult header
  headerRow: {
    display: "flex", alignItems: "center", gap: 12,
    marginTop: 8, marginBottom: 12,
  },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 999, flexShrink: 0,
    background: GROOVE_BG, boxShadow: GROOVE_SHADOW,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", padding: 2,
  },
  avatarImg: {
    width: "100%", height: "100%", objectFit: "cover" as const,
    objectPosition: "center top", borderRadius: 999,
  },
  avatarText: { fontSize: 18, fontWeight: 700, color: "rgba(15,23,42,0.55)" },
  headerTitle: { fontSize: 18, fontWeight: 700, color: "#1e1f22", lineHeight: 1.2 },
  headerSubRow: {
    display: "flex", alignItems: "center", gap: 16,
    marginTop: 3, flexWrap: "wrap" as const,
  },
  headerSubChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 15, fontWeight: 500, color: "rgba(30,31,34,0.7)", lineHeight: 1.4,
  },
  editBtn: {
    border: "none", background: "none", cursor: "pointer",
    padding: 4, marginLeft: "auto",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },

  // Stat pill — dark, like WorkoutResult
  statPill: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderRadius: 24, padding: "14px 18px",
    background: FILL_BG,
    boxShadow: "0 16px 32px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.08)",
  },
  statChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 15, fontWeight: 600, lineHeight: 1.25,
    color: "rgba(255,255,255,0.88)",
  },

  // Section header — same as Progress section titles
  sectionHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 },

  // Info rows
  infoGrid: { display: "grid", gap: 0 },
  infoRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 0",
  },
  infoDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginRight: -18,
  },
  infoLabel: { fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)" },
  infoValue: { fontSize: 15, fontWeight: 600, color: "#1e1f22", textAlign: "right" as const },

  // Excluded exercises header
  excludedHeaderBtn: {
    width: "100%", border: "none", background: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: 0, marginBottom: 0,
  },
  excludedArrow: {
    fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1,
  },
  accordionSub: {
    fontSize: 13, fontWeight: 400, color: "rgba(15,23,42,0.5)", lineHeight: 1.4,
    marginTop: -4,
  },

  // Excluded exercises
  searchInput: {
    width: "100%", padding: "10px 14px", borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.6)",
    fontSize: 14, fontWeight: 500, outline: "none",
    fontFamily: "inherit",
  },
  exRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    padding: "10px 12px", borderRadius: 14,
    background: "rgba(15,23,42,0.03)",
    border: "1px solid rgba(15,23,42,0.06)",
  },
  exName: { fontSize: 14, fontWeight: 500, color: "#1e1f22" },
  exBtnAdd: {
    border: "none", borderRadius: 12, padding: "8px 12px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
    background: FILL_BG, color: "rgba(255,255,255,0.9)",
    boxShadow: FILL_SHADOW,
  },
  exBtnRemove: {
    border: "1px solid rgba(15,23,42,0.12)", borderRadius: 12,
    padding: "8px 12px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", flexShrink: 0,
    background: "rgba(15,23,42,0.03)", color: "#1e1f22",
  },
  subLabel: { fontSize: 13, fontWeight: 600, color: "rgba(15,23,42,0.5)", marginTop: 4 },
  muted: { fontSize: 13, fontWeight: 400, color: "rgba(15,23,42,0.45)" },

  // Error
  errorNote: {
    padding: "10px 12px", borderRadius: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
    color: "#b91c1c", fontSize: 13, fontWeight: 500,
  },

  // Reset section
  resetCard: {
    background: "linear-gradient(180deg, rgba(255,240,240,0.95) 0%, rgba(255,230,230,0.92) 100%)",
    border: "1px solid rgba(239,68,68,0.12)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
  },
  resetText: {
    margin: "-4px 0 0", fontSize: 14, fontWeight: 400,
    color: "rgba(15,23,42,0.62)", lineHeight: 1.5,
  },
  resetBtn: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 50,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid rgba(239,68,68,0.18)",
    background: "rgba(239,68,68,0.12)",
    color: "#b91c1c",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    transition: "opacity 0.2s ease",
    marginTop: 4,
  },
  resetBtnIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "rgba(239,68,68,0.10)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
    boxShadow: "inset 0 2px 3px rgba(185,28,28,0.12), inset 0 -1px 0 rgba(255,255,255,0.6)",
  },
};
