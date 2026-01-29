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
  full_body: "Каждая тренировка — всё тело целиком",
  upper_lower: "Чередование верха и низа",
  push_pull_legs: "Три типа дней: жим, тяга, ноги",
  conditioning: "Круговые и функциональные тренировки",
  bro_split: "Каждый день — своя мышца",
};

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
    const description = (day.focus || scheme.description || "").trim();
    return {
      day: day.day || idx + 1,
      title,
      description,
      icon: String(day.day || idx + 1),
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
    return "Готово! Вот схема тренировок, которая идеально подходит под твой профиль";
  }
  if (experience === "intermediate" || experience === "advanced") {
    return "Готово! Выбери схему тренировок: всё тело за раз или делим по мышцам?";
  }
  return schemesCount > 1
    ? "Готово! Выбери схему тренировок: всё тело за раз или делим по мышцам?"
    : "Готово! Вот схема тренировок, которая идеально подходит под твой профиль";
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
    setBubbleText("Подбираю схемы тренировок...");
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
  const bubbleDisplayText = loading ? "Подбираю схемы тренировок..." : (bubbleText || "\u00A0");

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
// RECOMMENDED CARD (glass, active state)
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
  const dayTimeline = buildDayTimeline(scheme);
  return (
    <div
      style={{
        ...s.recommendedCard,
        ...(isActive ? undefined : s.recommendedCardInactive),
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
      <div style={s.schemeHeader}>
        <span style={s.schemeHeaderIcon}>⭐</span>
        <span style={s.schemeHeaderLabel}>Рекомендованная схема</span>
      </div>
      <div style={s.cardTitle}>{displayData.title}</div>
      <p style={s.cardDescription}>{displayData.description}</p>
      <div className={`scheme-roll${isActive ? "" : " collapsed"}`}>
        <div style={s.rollContent}>
          {dayTimeline.length > 0 && (
            <div style={s.dayTimeline}>
              <div style={s.timelineList}>
                {dayTimeline.map((item, idx) => (
                  <div key={`${item.day}-${idx}`} style={s.timelineItem}>
                    <div style={s.timelineLeft}>
                  <div style={s.timelineIcon}>{item.icon}</div>
                      {idx < dayTimeline.length - 1 && (
                        <div style={s.timelineLine} />
                      )}
                    </div>
                    <div style={s.timelineRight}>
                      <div style={s.timelineTitle}>{item.title}</div>
                      {item.description && (
                        <p style={s.timelineDesc}>{item.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SELECTABLE CARD (for intermediate / advanced)
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
  const dayTimeline = buildDayTimeline(scheme);

  return (
    <button
      type="button"
      className="scheme-card"
      style={{ ...s.glassCard, ...(isActive ? s.schemeCardActive : s.schemeCardInactive) }}
      onClick={onSelect}
    >
      <div style={s.cardTitle}>{displayData.title}</div>
      <p style={s.cardDescription}>{displayData.description}</p>
      <div className={`scheme-roll${isActive ? "" : " collapsed"}`}>
        <div style={s.rollContent}>
          {dayTimeline.length > 0 && (
            <div style={s.dayTimeline}>
              <div style={s.timelineList}>
                {dayTimeline.map((item, idx) => (
                  <div key={`${item.day}-${idx}`} style={s.timelineItem}>
                    <div style={s.timelineLeft}>
                      <div style={s.timelineIcon}>{item.icon}</div>
                      {idx < dayTimeline.length - 1 && (
                        <div style={s.timelineLine} />
                      )}
                    </div>
                    <div style={s.timelineRight}>
                      <div style={s.timelineTitle}>{item.title}</div>
                      {item.description && (
                        <p style={s.timelineDesc}>{item.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
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
        opacity: 1;
        transform: translateY(0);
        transition: max-height 320ms ease, opacity 220ms ease, transform 320ms ease;
        will-change: max-height, opacity, transform;
      }
      .scheme-roll.collapsed {
        max-height: 0;
        opacity: 0;
        transform: translateY(-6px);
      }
      .scheme-card {
        appearance: none; outline: none; cursor: pointer;
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

  // Glass card (matches OnbMotivation 3D glassmorphism)
  glassCard: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.4)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "#1e1f22",
    padding: "20px 18px",
    textAlign: "left",
    position: "relative",
    width: "100%",
  },
  schemeCardActive: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    color: "#1e1f22",
  },
  schemeCardInactive: {
    opacity: 0.55,
    filter: "saturate(0.9)",
  },

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
  },
  recommendedCardInactive: {
    opacity: 0.55,
    filter: "saturate(0.9)",
  },
  cardClickable: {
    cursor: "pointer",
  },
  schemeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  schemeHeaderIcon: {
    fontSize: 20,
  },
  schemeHeaderLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(30,31,34,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  cardTitle: {
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: -0.5,
    color: "#1e1f22",
  },
  splitExplanation: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(30,31,34,0.5)",
    marginTop: 4,
    lineHeight: 1.3,
  },
  cardDescription: {
    margin: "10px 0 0",
    fontSize: 15,
    lineHeight: 1.5,
    color: "rgba(30,31,34,0.6)",
  },
  rollContent: {
    paddingTop: 8,
  },

  // Day timeline inside recommended card
  dayTimeline: {
    marginTop: 12,
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
    width: 30,
  },
  timelineIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "rgba(30,31,34,0.04)",
    border: "1px solid rgba(30,31,34,0.16)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    color: "#1e1f22",
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 16,
    background: "rgba(30,31,34,0.1)",
    margin: "4px 0",
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 14,
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
    color: "rgba(30,31,34,0.6)",
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
