// webapp/src/screens/onb/OnbSchemeSelection.tsx
// Redesigned: Mascot + bubble, large selected card, compact alternatives
// Uses workout slots (train cars) instead of week calendar
import { useEffect, useMemo, useState } from "react";
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
import { BodyIcon, getDayHighlight } from "@/components/BodyIcon";
import maleRobotImg from "@/assets/robonew.webp";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

export default function OnbSchemeSelection({ onComplete, onBack }: Props) {
  const { draft } = useOnboarding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<WorkoutScheme[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bubbleText, setBubbleText] = useState("");
  const [mascotReady, setMascotReady] = useState(false);

  // Build user context from onboarding draft
  const userContext: UserContext = useMemo(() => ({
    goal: (draft.motivation?.goal || "athletic_body") as UserGoal,
    experience: (draft.experience?.level || "beginner") as ExperienceLevel,
    location: (draft.trainingPlace?.place || "gym") as Location,
    sex: draft.ageSex?.sex as "male" | "female" | undefined,
    age: draft.ageSex?.age,
    bmi: draft.body?.weight && draft.body?.height
      ? draft.body.weight / ((draft.body.height / 100) ** 2)
      : undefined,
  }), [draft]);

  // Preload mascot image
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = maleRobotImg;
    const done = () => { if (!cancelled) setMascotReady(true); };
    if (typeof (img as any).decode === "function") {
      (img as any).decode().then(done).catch(() => { img.onload = done; });
    } else {
      img.onload = done;
    }
    return () => { cancelled = true; };
  }, []);

  // Load recommendations
  useEffect(() => {
    loadRecommendations();
  }, []);

  // Typing effect for bubble
  useEffect(() => {
    if (!selectedId || schemes.length === 0) return;

    const selected = schemes.find(s => s.id === selectedId);
    if (!selected) return;

    const displayData = getSchemeDisplayData(
      {
        id: selected.id,
        name: selected.name,
        splitType: selected.splitType as SplitType,
        intensity: selected.intensity,
        daysPerWeek: selected.daysPerWeek,
        locations: selected.equipmentRequired as Location[],
      },
      userContext
    );

    const targetText = displayData.reason;
    setBubbleText("");

    let index = 0;
    const typeInterval = setInterval(() => {
      index++;
      setBubbleText(targetText.slice(0, index));
      if (index >= targetText.length) clearInterval(typeInterval);
    }, 20);

    return () => clearInterval(typeInterval);
  }, [selectedId, schemes, userContext]);

  async function loadRecommendations() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSchemeRecommendations();
      const allSchemes = [data.recommended, ...data.alternatives];
      setSchemes(allSchemes);
      setSelectedId(data.recommended.id);
    } catch (err: any) {
      console.error("Failed to load recommendations:", err);
      setError(err.message || "Не удалось загрузить рекомендации");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!selectedId) return;
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
    } finally {
      setSaving(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.mascotRow}>
          <img src={maleRobotImg} alt="Mascot" style={{ ...s.mascotImg, opacity: mascotReady ? 1 : 0 }} />
          <div style={s.bubble} className="speech-bubble">
            <span style={s.bubbleText}>Подбираю программу...</span>
          </div>
        </div>
        <div style={{ display: "grid", placeItems: "center", marginTop: 40 }}>
          <Spinner />
        </div>
        <BubbleStyles />
      </div>
    );
  }

  // Error state
  if (error || schemes.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.mascotRow}>
          <img src={maleRobotImg} alt="Mascot" style={s.mascotImg} />
          <div style={s.bubble} className="speech-bubble">
            <span style={s.bubbleText}>Упс, что-то пошло не так...</span>
          </div>
        </div>
        <div style={s.errorCard}>
          <p>{error || "Не удалось загрузить рекомендации"}</p>
          <button style={s.retryBtn} onClick={loadRecommendations}>Попробовать снова</button>
        </div>
        <BubbleStyles />
      </div>
    );
  }

  const selectedScheme = schemes.find(s => s.id === selectedId)!;
  const alternatives = schemes.filter(s => s.id !== selectedId);

  return (
    <div style={s.page}>
      <BubbleStyles />

      {/* Mascot + Bubble */}
      <div style={s.mascotRow}>
        <img
          src={maleRobotImg}
          alt="Mascot"
          style={{ ...s.mascotImg, opacity: mascotReady ? 1 : 0 }}
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>{bubbleText || "..."}</span>
        </div>
      </div>

      {/* Selected Scheme - Large Card */}
      <SelectedSchemeCard
        scheme={selectedScheme}
        userContext={userContext}
      />

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div style={s.alternativesSection}>
          <div style={s.alternativesLabel}>Другие варианты</div>
          <div style={alternatives.length === 2 ? s.alternativesGridTwo : s.alternativesGridOne}>
            {alternatives.map(scheme => (
              <AlternativeCard
                key={scheme.id}
                scheme={scheme}
                userContext={userContext}
                onSelect={() => setSelectedId(scheme.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && <div style={s.errorText}>{error}</div>}

      {/* Actions */}
      <div style={s.actions}>
        <button
          type="button"
          style={s.primaryBtn}
          className="primary-btn"
          onClick={handleConfirm}
          disabled={!selectedId || saving}
        >
          {saving ? "Сохраняем..." : "Выбрать программу"}
        </button>
        {onBack && (
          <button type="button" style={s.backBtn} onClick={onBack}>
            Назад
          </button>
        )}
      </div>

      <div style={{ height: 160 }} />
    </div>
  );
}

// ============================================================================
// SELECTED SCHEME CARD (Large, dark)
// ============================================================================

function SelectedSchemeCard({
  scheme,
  userContext,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
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
    userContext
  );

  return (
    <div style={s.selectedCard}>
      {scheme.isRecommended && (
        <div style={s.recommendedBadge}>
          <span>⭐</span>
          <span>Рекомендовано</span>
        </div>
      )}

      <div style={s.selectedTitle}>{displayData.title}</div>

      {/* Info chips */}
      <div style={s.selectedChips}>
        <span style={s.selectedChip}>📅 {scheme.daysPerWeek} дн/нед</span>
        <span style={s.selectedChip}>⏱️ {scheme.minMinutes}-{scheme.maxMinutes} мин</span>
        <span style={s.selectedChip}>
          {scheme.intensity === "low" ? "🟢 Лёгкая" :
           scheme.intensity === "moderate" ? "🟡 Средняя" : "🔴 Высокая"}
        </span>
      </div>

      {/* Workout Slots (Train Cars) */}
      <div style={s.slotsSection}>
        <div style={s.slotsLabel}>ТВОЯ НЕДЕЛЯ</div>
        <div style={s.slotsContainer}>
          {scheme.dayLabels.map((d, i) => {
            const highlight = getDayHighlight(scheme.splitType, d.label);
            return (
              <div key={i} style={s.slotCard}>
                <div style={s.slotIconWrap}>
                  <BodyIcon highlight={highlight} size={36} />
                </div>
                <div style={s.slotLabel}>{d.label}</div>
                <div style={s.slotDay}>День {d.day}</div>
              </div>
            );
          })}
        </div>
      </div>

      <p style={s.selectedDescription}>{displayData.description}</p>
    </div>
  );
}

// ============================================================================
// ALTERNATIVE CARD (Small, light)
// ============================================================================

function AlternativeCard({
  scheme,
  userContext,
  onSelect,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
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
    userContext
  );

  return (
    <button type="button" style={s.altCard} onClick={onSelect}>
      <div style={s.altTitle}>{displayData.title}</div>
      <div style={s.altMeta}>
        {scheme.daysPerWeek} дн/нед • {scheme.minMinutes}-{scheme.maxMinutes} мин
      </div>
    </button>
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
        stroke="#0f172a"
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
// BUBBLE STYLES (Speech bubble arrow)
// ============================================================================

function BubbleStyles() {
  return (
    <style>{`
      .speech-bubble:before {
        content: "";
        position: absolute;
        left: -8px;
        top: 18px;
        width: 0;
        height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid rgba(255,255,255,0.95);
        filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.08));
      }
      .primary-btn {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: transform 120ms ease, opacity 120ms ease;
      }
      .primary-btn:active:not(:disabled) {
        transform: scale(0.98);
        opacity: 0.9;
      }
      @media (prefers-reduced-motion: reduce) {
        .primary-btn { transition: none; }
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
    color: "#0f172a",
  },

  // Mascot Row
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: 100,
    height: "auto",
    objectFit: "contain",
    transition: "opacity 0.3s ease",
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  bubbleText: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "#0f172a",
  },

  // Selected Card (Large, dark)
  selectedCard: {
    position: "relative",
    padding: "24px 20px",
    borderRadius: 20,
    background: "#0f172a",
    color: "#fff",
    boxShadow: "0 12px 32px rgba(15,23,42,0.25)",
  },
  recommendedBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    background: "#fbbf24",
    color: "#78350f",
    padding: "5px 12px",
    borderRadius: 100,
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 5,
    boxShadow: "0 2px 8px rgba(251,191,36,0.4)",
  },
  selectedTitle: {
    fontSize: 26,
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  selectedChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  selectedChip: {
    padding: "6px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.1)",
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(255,255,255,0.9)",
  },

  // Workout Slots (Train Cars)
  slotsSection: {
    marginBottom: 16,
  },
  slotsLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    marginBottom: 10,
  },
  slotsContainer: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  slotCard: {
    flex: "0 0 auto",
    minWidth: 80,
    padding: "12px 10px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  slotIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    display: "grid",
    placeItems: "center",
  },
  slotLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    textAlign: "center",
    lineHeight: 1.2,
    maxWidth: 70,
  },
  slotDay: {
    fontSize: 10,
    fontWeight: 600,
    color: "rgba(255,255,255,0.4)",
  },

  selectedDescription: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.75)",
  },

  // Alternatives Section
  alternativesSection: {
    marginTop: 8,
  },
  alternativesLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(15,23,42,0.5)",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  alternativesGridTwo: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  alternativesGridOne: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },

  // Alternative Card (Small, light)
  altCard: {
    padding: "16px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s ease",
  },
  altTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 4,
    lineHeight: 1.2,
  },
  altMeta: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(15,23,42,0.5)",
  },

  // Actions
  actions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 8,
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
    zIndex: 10,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 600,
    fontSize: 17,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(15,23,42,0.2)",
  },
  backBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 16px",
    cursor: "pointer",
    textAlign: "center",
  },

  // Error states
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
    background: "#0f172a",
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
