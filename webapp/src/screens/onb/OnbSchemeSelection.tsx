// webapp/src/screens/onb/OnbSchemeSelection.tsx
// Experience-based scheme selection:
// - Beginner: locked alternatives with blur + unlock text
// - Intermediate/Advanced: selectable alternatives with split explanations
// Visual style: matches OnbAnalysis (mascot 140px, bubble 18px, glass cards)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSchemeRecommendations, selectScheme, type WorkoutScheme } from "@/api/schemes";
import { useOnboarding } from "@/app/OnboardingProvider";
import {
  getSchemeDisplayData,
  type UserContext,
  type SplitType,
  type Location,
  type UserGoal,
  type ExperienceLevel,
} from "@/utils/getSchemeDisplayData";
import maleRobotImg from "@/assets/robonew.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

// ============================================================================
// SPLIT TYPE EXPLANATIONS
// ============================================================================

const SPLIT_EXPLANATIONS: Record<string, string> = {
  full_body: "Прокачиваем всё тело за одну тренировку — просто и мощно 💪",
  upper_lower: "Один день — верх, другой — низ. Баланс и восстановление ⚖️",
  push_pull_legs: "Отдельная группа мышц на каждой тренировке — прицельная работа 🎯",
  conditioning: "Круговые тренировки в высоком темпе — жир плавится 🔥",
  bro_split: "Каждый день — одна мышца под микроскопом. Для продвинутых 🔬",
};

// Title emojis per split type
const SPLIT_TITLE_EMOJI: Record<string, string> = {
  full_body: "🏋️", upper_lower: "⬆️⬇️", push_pull_legs: "🎯",
  conditioning: "⚡", bro_split: "💎",
};

// Difficulty per split type (1-3, like intensity bars in Analysis)
const SPLIT_DIFFICULTY: Record<string, number> = {
  full_body: 1, conditioning: 1, upper_lower: 2, push_pull_legs: 2, bro_split: 3,
};

// Day emoji by title content
function getDayEmoji(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("всё тело")) return "🔥";
  if (t.includes("жим") || t.includes("грудь")) return "💥";
  if (t.includes("тяга") || t.includes("спина")) return "🦾";
  if (t.includes("ноги") || t.includes("ягодиц")) return "🦵";
  if (t.includes("плечи")) return "🎯";
  if (t.includes("руки") || t.includes("бицепс") || t.includes("трицепс")) return "💪";
  if (t.includes("кор") || t.includes("пресс")) return "🧱";
  if (t.includes("верх")) return "⬆️";
  if (t.includes("низ")) return "⬇️";
  if (t.includes("функционал") || t.includes("кардио")) return "⚡";
  return "🏋️";
}

// ============================================================================
// DAY TIMELINE (Recommended card)
// ============================================================================

type DayTimelineItem = {
  day: number;
  title: string;
  description: string;
  icon: string;
};

const FALLBACK_DAY_TITLES: Record<string, string[]> = {
  full_body: ["Всё тело", "Всё тело", "Всё тело", "Всё тело", "Всё тело", "Всё тело", "Всё тело"],
  upper_lower: ["Верх", "Низ", "Верх", "Низ", "Верх", "Низ", "Верх"],
  push_pull_legs: ["Жим", "Тяга", "Ноги", "Жим", "Тяга", "Ноги", "Жим"],
  conditioning: ["Функционал", "Функционал", "Функционал", "Функционал", "Функционал", "Функционал", "Функционал"],
  bro_split: ["Грудь + Трицепс", "Спина + Бицепс", "Ноги", "Плечи + Пресс", "Руки + Кор", "Грудь", "Спина"],
};

function normalizeDayTitle(label: string): string {
  let text = label.trim();
  if (!text) return text;
  text = text.replace(/\s*&\s*/g, " + ");

  const replacements: Array<[RegExp, string]> = [
    [/\bfull body\b/gi, "Всё тело"],
    [/\bpush\b/gi, "Жим"],
    [/\bpull\b/gi, "Тяга"],
    [/\blegs?\b/gi, "Ноги"],
    [/\bupper\b/gi, "Верх"],
    [/\blower\b/gi, "Низ"],
    [/\bglutes?\b/gi, "Ягодицы"],
    [/\bchest\b/gi, "Грудь"],
    [/\bback\b/gi, "Спина"],
    [/\bshoulders?\b/gi, "Плечи"],
    [/\barms?\b/gi, "Руки"],
    [/\bcore\b/gi, "Кор"],
    [/\bconditioning\b/gi, "Функционал"],
    [/\bcardio\b/gi, "Кардио"],
    [/\bheavy\b/gi, "силовой"],
    [/\bvolume\b/gi, "объём"],
    [/\bgentle\b/gi, "мягкий"],
    [/\brebuild\b/gi, "восстановление"],
  ];

  for (const [re, value] of replacements) {
    text = text.replace(re, value);
  }

  return text.replace(/\s+/g, " ").trim();
}

function getFallbackDayTitle(splitType: string, index: number): string {
  const list = FALLBACK_DAY_TITLES[splitType];
  if (!list || list.length === 0) return `День ${index + 1}`;
  return list[index % list.length];
}

function buildDayTimeline(scheme: WorkoutScheme): DayTimelineItem[] {
  const labels = Array.isArray(scheme.dayLabels) ? scheme.dayLabels : [];
  const limit = scheme.daysPerWeek || labels.length;
  const base = labels.length
    ? labels.slice(0, limit)
    : Array.from({ length: limit }, (_, idx) => ({
        day: idx + 1,
        label: getFallbackDayTitle(scheme.splitType, idx),
        focus: "",
      }));

  return base.map((day, idx) => {
    const fallbackTitle = getFallbackDayTitle(scheme.splitType, idx);
    const title = normalizeDayTitle(day.label || fallbackTitle) || fallbackTitle;
    const description = (day.focus || "").trim();
    return {
      day: day.day || idx + 1,
      title,
      description,
      icon: getDayEmoji(title),
    };
  });
}

// ============================================================================
// LOCKED CARD CONTENT (for beginner)
// Each locked alternative gets a motivational unlock message
// ============================================================================

function getLockedCardContent(scheme: WorkoutScheme): { unlockWeeks: number; motivationText: string } {
  const split = scheme.splitType;
  if (split === "upper_lower") {
    return { unlockWeeks: 8, motivationText: "Когда освоишь базу — усложним" };
  }
  if (split === "push_pull_legs") {
    return { unlockWeeks: 12, motivationText: "Для детальной проработки" };
  }
  if (split === "bro_split") {
    return { unlockWeeks: 12, motivationText: "Для детальной проработки" };
  }
  // Default
  return {
    unlockWeeks: scheme.intensity === "high" ? 12 : 8,
    motivationText: "Когда будешь готов к новому уровню",
  };
}

// ============================================================================
// BUBBLE TEXT PER EXPERIENCE
// ============================================================================

function getBubbleText(experience: ExperienceLevel, schemesCount: number): string {
  if (experience === "beginner") {
    return "Готово! Вот план тренировок, который идеально подходит под твой профиль";
  }
  if (experience === "intermediate" || experience === "advanced") {
    return "Готово! Выбери план тренировок: всё тело за раз или делим по мышцам?";
  }
  return schemesCount > 1
    ? "Готово! Выбери план тренировок: всё тело за раз или делим по мышцам?"
    : "Готово! Вот план тренировок, который идеально подходит под твой профиль";
}

export default function OnbSchemeSelection({ onComplete, onBack }: Props) {
  const { draft } = useOnboarding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<WorkoutScheme[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [bubbleText, setBubbleText] = useState("");
  const [mascotReady, setMascotReady] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [reveal, setReveal] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  const experience = (draft.experience?.level || draft.experience || "beginner") as ExperienceLevel;
  const isBeginner = experience === "beginner";

  const userContext: UserContext = useMemo(() => ({
    goal: (draft.motivation?.goal || "athletic_body") as UserGoal,
    experience,
    location: (draft.trainingPlace?.place || "gym") as Location,
    sex: draft.ageSex?.sex as "male" | "female" | undefined,
    age: draft.ageSex?.age,
    bmi: draft.body?.weight && draft.body?.height
      ? draft.body.weight / ((draft.body.height / 100) ** 2)
      : undefined,
  }), [draft]);

  const bubbleTarget = useMemo(
    () => getBubbleText(experience, schemes.length),
    [experience, schemes.length],
  );
  const isReady = !loading && schemes.length > 0;

  // Preload mascot
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = maleRobotImg;
    const done = () => { if (!cancelled) setMascotReady(true); };
    const anyImg = img as any;
    if (typeof anyImg.decode === "function") {
      anyImg.decode().then(done).catch(() => { img.onload = done; img.onerror = done; });
    } else {
      img.onload = done;
      img.onerror = done;
    }
    return () => { cancelled = true; };
  }, []);

  // Keep the same screen while loading: only update bubble text
  useEffect(() => {
    if (!loading) return;
    setBubbleText("Подбираю план тренировок...");
    setShowContent(false);
  }, [loading]);

  // Scroll to top
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Cleanup leave timer
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // Load recommendations
  useEffect(() => {
    loadRecommendations();
  }, []);

  // Staggered reveal + bubble typing
  useEffect(() => {
    if (loading || schemes.length === 0) return;

    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setReveal(true);
      setShowContent(true);
      setBubbleText(bubbleTarget);
      return;
    }
    const t1 = window.setTimeout(() => setReveal(true), 30);
    const t2 = window.setTimeout(() => setShowContent(true), 600);

    let index = 0;
    setBubbleText("");
    const typeInterval = window.setInterval(() => {
      index += 1;
      setBubbleText(bubbleTarget.slice(0, index));
      if (index >= bubbleTarget.length) window.clearInterval(typeInterval);
    }, 20);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(typeInterval);
    };
  }, [loading, schemes, bubbleTarget]);

  async function loadRecommendations() {
    const start = performance.now();
    try {
      setLoading(true);
      setError(null);
      const data = await getSchemeRecommendations();
      const allSchemes = [data.recommended, ...data.alternatives];
      setSchemes(allSchemes);
      setSelectedId(data.recommended.id);
      setRecommendedId(data.recommended.id);
      const minLoadingMs = 900;
      const elapsed = performance.now() - start;
      if (elapsed < minLoadingMs) {
        await new Promise((resolve) => window.setTimeout(resolve, minLoadingMs - elapsed));
      }
      setLoading(false);
    } catch (err: any) {
      console.error("Failed to load recommendations:", err);
      setError(err.message || "Не удалось загрузить рекомендации");
      setLoading(false);
    }
  }

  const handleNext = () => {
    if (isLeaving || !selectedId) return;
    fireHapticImpact("rigid");
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const doSelect = async () => {
      try {
        setSaving(true);
        setError(null);
        await selectScheme(selectedId);
        localStorage.setItem("scheme_selected", "1");
        try { window.dispatchEvent(new Event("scheme_selected")); } catch {}
        onComplete();
      } catch (err: any) {
        console.error("Failed to select scheme:", err);
        setError(err.message || "Не удалось сохранить выбор");
        setSaving(false);
        setIsLeaving(false);
      }
    };

    if (prefersReduced) {
      doSelect();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(doSelect, 220);
  };

  const handleBack = () => {
    if (isLeaving || !onBack) return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) { onBack(); return; }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onBack(), 220);
  };

  // Error state
  if (error && schemes.length === 0) {
    return (
      <div style={s.page}>
        <ScreenStyles />
        <div style={{ ...s.mascotRow, opacity: 1 }}>
          <img src={maleRobotImg} alt="" style={s.mascotImg} />
          <div style={s.bubble} className="speech-bubble">
            <span style={s.bubbleText}>Упс, что-то пошло не так...</span>
          </div>
        </div>
        <div style={s.errorCard}>
          <p>{error}</p>
          <button style={s.retryBtn} onClick={loadRecommendations}>Попробовать снова</button>
        </div>
      </div>
    );
  }

  const recommendedScheme = isReady ? schemes.find(s => s.id === recommendedId) || null : null;
  const alternatives = isReady ? schemes.filter(s => s.id !== recommendedId) : [];
  const activeId = selectedId || recommendedId;
  const bubbleDisplayText = loading ? "Подбираю план тренировок..." : (bubbleText || "\u00A0");

  return (
    <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
      <ScreenStyles />

      {/* Mascot + Bubble */}
      <div
        style={s.mascotRow}
      >
        <img
          src={maleRobotImg}
          alt=""
          style={{ ...s.mascotImg, ...(mascotReady ? undefined : s.mascotHidden) }}
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>{bubbleDisplayText}</span>
        </div>
      </div>

      {/* Cards */}
      <div style={s.cardsContainer}>
        {loading && (
          <div style={{ display: "grid", placeItems: "center", marginTop: 24 }}>
            <Spinner />
          </div>
        )}
        {/* Recommended Scheme Card */}
        {recommendedScheme && (
          <div className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}>
            <RecommendedCard
              scheme={recommendedScheme}
              userContext={userContext}
              isActive={activeId === recommendedScheme.id}
              onSelect={!isBeginner ? () => setSelectedId(recommendedScheme.id) : undefined}
            />
          </div>
        )}

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div
            style={s.altSection}
            className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
          >
            {isBeginner ? (
              alternatives.map(scheme => (
                <LockedCard key={scheme.id} scheme={scheme} userContext={userContext} />
              ))
            ) : (
              alternatives.map(scheme => (
                <SelectableCard
                  key={scheme.id}
                  scheme={scheme}
                  userContext={userContext}
                  isActive={scheme.id === activeId}
                  onSelect={() => setSelectedId(scheme.id)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Error inline */}
      {error && <div style={s.errorText}>{error}</div>}

      {/* Actions */}
      {recommendedScheme && (
        <div
          style={s.actions}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-4" : ""}`}
        >
          <button
            type="button"
            style={s.primaryBtn}
            className="intro-primary-btn"
            onClick={handleNext}
            disabled={!selectedId || saving || isLeaving}
          >
            {saving ? "Сохраняем..." : isBeginner ? "Начать тренировки" : "Выбрать программу"}
          </button>
          {onBack && (
            <button type="button" style={s.backBtn} onClick={handleBack}>
              Назад
            </button>
          )}
        </div>
      )}

      <div aria-hidden className={`analysis-blackout${reveal ? " reveal" : ""}`} />
    </div>
  );
}

// ============================================================================
// DIFFICULTY BARS (like intensity in OnbAnalysis)
// ============================================================================

function DifficultyBars({ splitType }: { splitType: string }) {
  const level = SPLIT_DIFFICULTY[splitType] ?? 1;
  return (
    <div style={s.difficultyRow}>
      <span style={s.difficultyLabel}>Сложность</span>
      <div style={s.difficultyBars}>
        <div style={{ ...s.diffBar, ...s.diffBar1, background: level >= 1 ? "#1e1f22" : "#e5e7eb" }} />
        <div style={{ ...s.diffBar, ...s.diffBar2, background: level >= 2 ? "#1e1f22" : "#e5e7eb" }} />
        <div style={{ ...s.diffBar, ...s.diffBar3, background: level >= 3 ? "#1e1f22" : "#e5e7eb" }} />
      </div>
    </div>
  );
}

// ============================================================================
// SHARED CARD BODY — title + difficulty + description + timeline
// ============================================================================

function SchemeCardBody({
  scheme,
  userContext,
  showTimeline,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  showTimeline: boolean;
}) {
  const displayData = getSchemeDisplayData(
    {
      id: scheme.id,
      name: scheme.name,
      splitType: scheme.splitType as SplitType,
      intensity: scheme.intensity,
      daysPerWeek: scheme.daysPerWeek,
      locations: scheme.equipmentRequired as Location[],
    },
    userContext,
  );
  const splitEmoji = SPLIT_TITLE_EMOJI[scheme.splitType] || "🏋️";
  const splitDesc = SPLIT_EXPLANATIONS[scheme.splitType] || displayData.description;
  const dayTimeline = buildDayTimeline(scheme);

  return (
    <>
      <div style={s.cardTitle}>
        <span style={s.titleEmoji}>{splitEmoji}</span>
        {displayData.title}
      </div>

      <DifficultyBars splitType={scheme.splitType} />

      <p style={s.cardDescription}>{splitDesc}</p>

      {showTimeline && dayTimeline.length > 0 && (
        <div style={s.dayTimeline}>
          <div style={s.weekPlanHeader}>
            <span>📋</span>
            <span style={s.weekPlanText}>План недели</span>
          </div>
          <div style={s.timelineList}>
            {dayTimeline.map((item, idx) => (
              <div key={`${item.day}-${idx}`} style={s.timelineItem}>
                <div style={s.timelineLeft}>
                  <div style={s.timelineIcon}>{item.icon}</div>
                  {idx < dayTimeline.length - 1 && <div style={s.timelineLine} />}
                </div>
                <div style={s.timelineRight}>
                  <div style={s.timelineWeek}>День {item.day}</div>
                  <div style={s.timelineTitle}>{item.title}</div>
                  {item.description && <p style={s.timelineDesc}>{item.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// RECOMMENDED CARD — glass card with badge overlay
// ============================================================================

function RecommendedCard({
  scheme,
  userContext,
  isActive,
  onSelect,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  isActive: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      className="scheme-card"
      style={{
        ...s.recommendedCard,
        ...(isActive ? undefined : s.cardInactive),
        ...(onSelect ? s.cardClickable : {}),
      }}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Badge — "sticker" overlay top-right */}
      <div style={s.badge}>
        <span style={s.badgeIcon}>⚡</span>
        <span style={s.badgeText}>Рекомендую</span>
      </div>

      <SchemeCardBody scheme={scheme} userContext={userContext} showTimeline={isActive} />
    </div>
  );
}

// ============================================================================
// SELECTABLE CARD (for intermediate / advanced)
// Same content as recommended, but no badge, collapsed when inactive
// ============================================================================

function SelectableCard({
  scheme,
  userContext,
  isActive,
  onSelect,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="scheme-card"
      style={{ ...s.recommendedCard, ...(isActive ? undefined : s.cardInactive) }}
      onClick={onSelect}
    >
      <SchemeCardBody scheme={scheme} userContext={userContext} showTimeline={isActive} />
    </button>
  );
}

// ============================================================================
// LOCKED CARD (for beginner — blurred with lock overlay)
// ============================================================================

function LockedCard({
  scheme,
  userContext,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
}) {
  const splitExplanation = SPLIT_EXPLANATIONS[scheme.splitType] || "";
  const { unlockWeeks, motivationText } = getLockedCardContent(scheme);

  return (
    <div style={s.lockedCardWrap}>
      {/* Blurred background content */}
      <div style={s.lockedBlurLayer} />

      {/* Lock content on top */}
      <div style={s.lockedContent}>
        <div style={s.lockedLockRow}>
          <span style={s.lockedLockEmoji}>🔒</span>
          <span style={s.lockedUnlockText}>Откроется через {unlockWeeks} недель</span>
        </div>
        {splitExplanation && (
          <div style={s.lockedSplitText}>«{splitExplanation}»</div>
        )}
        <div style={s.lockedMotivation}>{motivationText}</div>
      </div>
    </div>
  );
}

// ============================================================================
// SPINNER
// ============================================================================

function Spinner() {
  return (
    <svg width="48" height="48" viewBox="0 0 50 50">
      <circle cx="25" cy="25" r="20" stroke="rgba(15,23,42,0.15)" strokeWidth="5" fill="none" />
      <circle
        cx="25" cy="25" r="20"
        stroke="#1e1f22"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="100"
        strokeDashoffset="75"
        style={{ transformOrigin: "center", animation: "spin 1s linear infinite" }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

// ============================================================================
// SCREEN STYLES (animations, bubble, button)
// ============================================================================

function ScreenStyles() {
  return (
    <style>{`
      @keyframes onbFadeUp {
        0% { opacity: 0; transform: translateY(16px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes onbFadeDown {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(12px); }
      }
      .onb-fade-target { opacity: 0; }
      .onb-fade { animation: onbFadeUp 520ms ease-out both; }
      .onb-fade-delay-1 { animation-delay: 220ms; }
      .onb-fade-delay-2 { animation-delay: 600ms; }
      .onb-fade-delay-3 { animation-delay: 900ms; }
      .onb-fade-delay-4 { animation-delay: 1200ms; }
      .onb-leave { animation: onbFadeDown 220ms ease-in both; }
      .analysis-blackout {
        position: fixed; inset: 0; background: #000;
        opacity: 1; pointer-events: none; z-index: 30;
        transition: opacity 420ms ease;
      }
      .analysis-blackout.reveal { opacity: 0; }
      .speech-bubble:before {
        content: ""; position: absolute;
        left: -8px; top: 18px; width: 0; height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid rgba(255,255,255,0.9);
        filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
      }
      .intro-primary-btn {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation; user-select: none;
        transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }
      .intro-primary-btn:active:not(:disabled) {
        transform: translateY(1px) scale(0.99) !important;
        background-color: #141619 !important;
      }
      .scheme-roll {
        overflow: hidden;
        max-height: 1200px;
        transform: translateY(0);
        transition: max-height 320ms ease, transform 320ms ease;
        will-change: max-height, transform;
      }
      .scheme-roll.collapsed {
        max-height: 0;
        transform: translateY(-6px);
      }
      .scheme-card {
        appearance: none; outline: none; cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
        transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
        will-change: transform, background, border-color;
      }
      .scheme-card:active:not(:disabled) {
        transform: translateY(1px) scale(0.99);
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .analysis-blackout { transition: none !important; }
        .intro-primary-btn, .scheme-card, .scheme-roll { transition: none !important; }
      }
    `}</style>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 160px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
  },

  // Mascot Row — same as OnbAnalysis
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: 140,
    height: "auto",
    objectFit: "contain",
  },
  mascotHidden: {
    opacity: 0,
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#1e1f22",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#1e1f22",
    whiteSpace: "pre-line",
  },

  // Cards
  cardsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 4,
  },

  // Card base (active state — full glass 3D)
  recommendedCard: {
    borderRadius: 20,
    padding: "20px 18px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    position: "relative",
    width: "100%",
    textAlign: "left",
    display: "block",
    overflow: "visible",
  },
  // Inactive card — more transparent, keep 3D depth
  cardInactive: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.28) 100%)",
    border: "1px solid rgba(255,255,255,0.3)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)",
  },
  cardClickable: {
    cursor: "pointer",
  },

  // Badge — "sticker" overlay top-right
  badge: {
    position: "absolute",
    top: -10,
    right: 16,
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px 5px 9px",
    borderRadius: 12,
    background: "linear-gradient(135deg, #1e1f22 0%, #2d2e33 100%)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    zIndex: 2,
  },
  badgeIcon: {
    fontSize: 14,
    lineHeight: 1,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: 0.3,
    lineHeight: 1,
  },

  // Title with emoji
  cardTitle: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: -0.5,
    color: "#1e1f22",
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  titleEmoji: {
    fontSize: 26,
    lineHeight: 1,
    flexShrink: 0,
  },

  // Difficulty bars (like intensity in OnbAnalysis)
  difficultyRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  difficultyLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1,
    paddingBottom: 0,
    transform: "translateY(2px)",
  },
  difficultyBars: {
    display: "flex",
    alignItems: "flex-end",
    gap: 3,
  },
  diffBar: {
    width: 6,
    borderRadius: 2,
  },
  diffBar1: {
    height: 8,
  },
  diffBar2: {
    height: 14,
  },
  diffBar3: {
    height: 20,
  },

  // Description (Duolingo-style)
  cardDescription: {
    margin: "8px 0 0",
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(30,31,34,0.55)",
    fontWeight: 500,
  },

  // "План недели" section header
  weekPlanHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  weekPlanText: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1e1f22",
    letterSpacing: -0.2,
  },

  // Day timeline
  dayTimeline: {
    marginTop: 16,
  },
  timelineList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  timelineItem: {
    display: "flex",
    gap: 12,
  },
  timelineLeft: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: 32,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(30,31,34,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 14,
    background: "rgba(30,31,34,0.08)",
    margin: "4px 0",
    borderRadius: 1,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineWeek: {
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(30,31,34,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1e1f22",
    marginTop: 2,
  },
  timelineDesc: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "rgba(30,31,34,0.5)",
    lineHeight: 1.4,
  },

  // Alternatives section
  altSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  // Locked card (beginner)
  lockedCardWrap: {
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    width: "100%",
  },
  lockedBlurLayer: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.15) 100%)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 18,
  },
  lockedContent: {
    position: "relative",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  lockedLockRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  lockedLockEmoji: {
    fontSize: 16,
  },
  lockedUnlockText: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(30,31,34,0.45)",
  },
  lockedSplitText: {
    fontSize: 16,
    fontWeight: 600,
    color: "rgba(30,31,34,0.55)",
    lineHeight: 1.3,
  },
  lockedMotivation: {
    fontSize: 13,
    fontWeight: 500,
    color: "rgba(30,31,34,0.35)",
    lineHeight: 1.4,
  },

  // Actions — same as OnbAnalysis
  actions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 10,
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
    zIndex: 10,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  backBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 16,
    fontWeight: 600,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
  },

  // Error
  errorCard: {
    padding: 24,
    textAlign: "center",
    color: "rgba(15, 23, 42, 0.7)",
  },
  retryBtn: {
    marginTop: 16,
    padding: "12px 24px",
    borderRadius: 12,
    border: "none",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  errorText: {
    padding: 12,
    background: "rgba(255,102,102,0.15)",
    color: "#dc2626",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 10,
    textAlign: "center",
  },
};
