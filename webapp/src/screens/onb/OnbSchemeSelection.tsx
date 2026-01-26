// webapp/src/screens/onb/OnbSchemeSelection.tsx
import { useEffect, useState } from "react";
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

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

export default function OnbSchemeSelection({ onComplete, onBack }: Props) {
  const { draft } = useOnboarding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<WorkoutScheme | null>(null);
  const [alternatives, setAlternatives] = useState<WorkoutScheme[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Build user context from onboarding draft
  const userContext: UserContext = {
    goal: (draft.motivation?.goal || "athletic_body") as UserGoal,
    experience: (draft.experience?.level || "beginner") as ExperienceLevel,
    location: (draft.trainingPlace?.place || "gym") as Location,
    sex: draft.ageSex?.sex as "male" | "female" | undefined,
    age: draft.ageSex?.age,
    bmi: draft.body?.weight && draft.body?.height
      ? draft.body.weight / ((draft.body.height / 100) ** 2)
      : undefined,
  };

  useEffect(() => {
    loadRecommendations();
  }, []);

  useEffect(() => {
    if (showTerms) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showTerms]);

  async function loadRecommendations() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSchemeRecommendations();
      setRecommended(data.recommended);
      setAlternatives(data.alternatives);
      setSelectedId(data.recommended.id);
    } catch (err: any) {
      console.error("Failed to load recommendations:", err);
      setError(err.message || "Не удалось загрузить рекомендации");
    } finally {
      setLoading(false);
    }
  }

  const termsSections = [
    {
      title: "1. О приложении",
      body: [
        "Moro — интеллектуальный фитнес-ассистент, создающий персонализированные программы тренировок и питания на основе ваших данных (возраст, вес, цели, опыт, оборудование и др.).",
        "Приложение предназначено для образовательных и информационных целей и помогает структурировать тренировки на основе научных принципов фитнеса.",
      ],
    },
    {
      title: "2. Ограничения технологии",
      body: [
        "ИИ не заменяет очную консультацию врача и полноценное обследование.",
        "ИИ не учитывает скрытые заболевания или состояния, о которых вы не знаете или не указали.",
        "ИИ не заменяет индивидуальную работу с сертифицированным тренером, который наблюдает технику в реальном времени.",
        "Приложение дополняет, но не заменяет медицинское наблюдение и тренерский контроль.",
      ],
    },
    {
      title: "3. Рекомендуем консультацию",
      body: [
        "Перед стартом тренировок желательно проконсультироваться с врачом, особенно если есть хронические заболевания, травмы, приём лекарств, беременность/послеродовый период, возраст 40+ без опыта тренировок или любые сомнения по здоровью.",
      ],
    },
    {
      title: "4. Ваша ответственность",
      body: [
        "Правдиво заполнять анкету о здоровье.",
        "Выбирать адекватную нагрузку и соблюдать технику.",
        "Прекращать тренировку при боли или дискомфорте.",
        "Самостоятельное решение о старте без консультации врача принимаете вы.",
      ],
    },
    {
      title: "5. Признание рисков",
      body: [
        "Любые тренировки связаны с риском травм, результаты индивидуальны.",
        "При неправильной технике или игнорировании сигналов тела возможны травмы.",
        "При неприятных ощущениях (боль, головокружение, тошнота, одышка, учащённый пульс) — немедленно остановитесь и обратитесь к врачу.",
      ],
    },
    {
      title: "6. Ограничение ответственности",
      body: [
        "Разработчики FitAI не несут ответственности за травмы/ухудшение здоровья, неточности рекомендаций из-за неполных данных, тренировки без консультации врача, технические сбои.",
      ],
    },
    {
      title: "7. Не гарантия результатов",
      body: [
        "Нет гарантии конкретных результатов и сроков.",
        "Возможны индивидуальные реакции организма и несоответствия скрытым особенностям здоровья.",
      ],
    },
    {
      title: "8. Актуальность информации",
      body: [
        "Алгоритмы обновляются, но информация может не всегда отражать самые последние исследования.",
      ],
    },
    {
      title: "9. Согласие",
      body: [
        "Используя приложение, вы подтверждаете, что прочитали и приняли условия, понимаете разницу между ИИ и профессиональным сопровождением и берёте ответственность на себя.",
      ],
    },
  ];

  async function handleConfirm() {
    if (!selectedId) return;

    try {
      setSaving(true);
      setError(null);

      await selectScheme(selectedId);

      localStorage.setItem("scheme_selected", "1");

      try {
        window.dispatchEvent(new Event("scheme_selected"));
      } catch {}

      onComplete();
    } catch (err: any) {
      console.error("Failed to select scheme:", err);
      setError(err.message || "Не удалось сохранить выбор");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={s.page}>
        <section style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pill}>Шаг 5 из 5</span>
            <span style={s.pill}>Анкета</span>
          </div>
          <div style={s.heroTitle}>Подбираем схему тренировок...</div>
          <div style={s.heroSubtitle}>Анализируем твои данные</div>

          <div style={{ marginTop: 24, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        </section>
      </div>
    );
  }

  if (error || !recommended) {
    return (
      <div style={s.page}>
        <section style={s.heroCard}>
          <div style={s.heroTitle}>Ошибка</div>
          <div style={s.heroSubtitle}>{error || "Не удалось загрузить рекомендации"}</div>
          <button style={s.primaryBtn} onClick={() => loadRecommendations()}>
            Попробовать снова
          </button>
        </section>
      </div>
    );
  }

  const allSchemes = [recommended, ...alternatives];

  // Get marketing data for recommended scheme
  const recommendedDisplay = getSchemeDisplayData(
    {
      id: recommended.id,
      name: recommended.name,
      splitType: recommended.splitType as SplitType,
      intensity: recommended.intensity,
      daysPerWeek: recommended.daysPerWeek,
      locations: recommended.equipmentRequired as Location[],
    },
    userContext
  );

  return (
    <div style={s.page}>
      <SoftGlowStyles />

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Шаг 5 из 5</span>
          <span style={s.pill}>Анкета</span>
        </div>

        <div style={s.heroKicker}>Схема тренировок</div>
        <div style={s.heroTitle}>Выбери программу</div>
        <div style={s.heroSubtitle}>
          Мы подобрали для тебя 3 варианта на основе твоих данных.
        </div>
      </section>

      {/* Insight Box - Reason */}
      <div style={s.insightBox}>
        <div style={s.insightIcon}>💡</div>
        <div style={s.insightText}>{recommendedDisplay.reason}</div>
      </div>

      {/* Схемы */}
      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
        {allSchemes.map((scheme, i) => (
          <SchemeCard
            key={scheme.id}
            index={i}
            scheme={scheme}
            userContext={userContext}
            isSelected={selectedId === scheme.id}
            onSelect={() => setSelectedId(scheme.id)}
          />
        ))}
      </div>

      {/* Чекбокс условий использования */}
      <button
        type="button"
        onClick={() => setAccepted((v) => !v)}
        className="no-tap-effect"
        style={{
          ...s.termsRow,
          position: "relative",
          cursor: "pointer",
          textAlign: "left",
          outline: "none",
          transition: "none",
          userSelect: "none",
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.6)";
          e.currentTarget.style.opacity = "1";
        }}
        onTouchEnd={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.6)";
          e.currentTarget.style.opacity = "1";
        }}
      >
        <div style={{...s.radioCircle, borderColor: accepted ? "#0f172a" : "rgba(0,0,0,0.1)"}}>
          <div style={{...s.radioDot, transform: accepted ? "scale(1)" : "scale(0)", opacity: accepted ? 1 : 0}} />
        </div>

        <span style={s.termsText}>
          Я ознакомился и согласен с Условиями использования приложения{" "}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowTerms(true);
            }}
            style={s.inlineLink}
          >
            Подробнее
          </button>
        </span>
      </button>

      {/* CTA */}
      <button
        onClick={handleConfirm}
        disabled={!selectedId || !accepted || saving}
        className="soft-glow"
        style={{
          ...s.primaryBtn,
          opacity: !selectedId || !accepted || saving ? 0.6 : 1,
          cursor: !selectedId || !accepted || saving ? "default" : "pointer",
        }}
      >
        {saving ? "Сохраняем..." : "Перейти к тренировкам"}
      </button>

      {onBack && (
        <button type="button" onClick={onBack} style={s.backTextBtn}>
          Назад
        </button>
      )}

      {error && <div style={s.errorText}>{error}</div>}

      {/* Модальное окно с терминами */}
      {showTerms && (
        <div style={s.modalOverlay}>
          <div style={s.modalCard}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Условия использования и политика конфиденциальности</div>
              <button style={s.modalClose} onClick={() => setShowTerms(false)}>
                ✕
              </button>
            </div>
            <div style={s.modalBody}>
              {termsSections.map((section) => (
                <div key={section.title} style={s.termsSection}>
                  <div style={s.termsSectionTitle}>{section.title}</div>
                  <ul style={s.termsSectionList}>
                    {section.body.map((line) => (
                      <li key={line} style={s.termsSectionItem}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 76 }} />
    </div>
  );
}

function SchemeCard({
  scheme,
  userContext,
  isSelected,
  onSelect,
  index,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // Get marketing display data
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

  // Technical name for transparency
  const technicalName = scheme.russianName || scheme.name;

  return (
    <div
      className={`scheme-card scheme-enter ${isSelected ? "selected" : ""}`}
      style={{
        ...s.schemeCard,
        ...(isSelected ? s.schemeCardSelected : {}),
        animationDelay: `${index * 120}ms`,
      }}
      onClick={onSelect}
    >
      {/* Badge */}
      {scheme.isRecommended && (
        <div style={s.recommendedBadge}>
          <span style={{ fontSize: 12 }}>⭐</span>
          <span>Рекомендовано</span>
        </div>
      )}

      {/* Radio button */}
      <div style={{...s.radioCircle, borderColor: isSelected ? "#0f172a" : "rgba(0,0,0,0.1)"}}>
        <div style={{...s.radioDot, transform: isSelected ? "scale(1)" : "scale(0)", opacity: isSelected ? 1 : 0}} />
      </div>

      {/* Marketing Title - Big and Bold */}
      <div style={s.marketingTitle}>{displayData.title}</div>

      {/* Technical Name - Small and Gray */}
      <div style={s.technicalName}>{technicalName}</div>

      {/* Info chips */}
      <div style={s.schemeInfo}>
        <span style={s.infoChip}>📅 {scheme.daysPerWeek} дн/нед</span>
        <span style={s.infoChip}>⏱️ {scheme.minMinutes}-{scheme.maxMinutes} мин</span>
        <span style={s.infoChip}>
          {scheme.intensity === "low" ? "🟢 Лёгкая" :
           scheme.intensity === "moderate" ? "🟡 Средняя" :
           "🔴 Высокая"}
        </span>
      </div>

      {/* Marketing Description */}
      <div style={s.schemeDescription}>{displayData.description}</div>

      {/* Expand button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        style={s.expandBtn}
      >
        {expanded ? "Свернуть детали ▲" : "Показать детали ▼"}
      </button>

      <div style={{
        display: "grid",
        gridTemplateRows: expanded ? "1fr" : "0fr",
        transition: "grid-template-rows 0.3s ease-out",
        overflow: "hidden"
      }}>
        <div style={{ minHeight: 0 }}>
          <div style={s.detailsSection}>
            {/* Days structure */}
            <div style={s.detailBlock}>
              <div style={s.detailTitle}>📋 Структура недели</div>
              <div style={s.daysList}>
                {scheme.dayLabels.map((day, i) => (
                  <div key={i} style={s.dayItem}>
                    <div style={s.dayLabel}>
                      День {day.day}: {day.label}
                    </div>
                    <div style={s.dayFocus}>{day.focus}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Benefits */}
            {scheme.benefits && scheme.benefits.length > 0 && (
              <div style={s.detailBlock}>
                <div style={s.detailTitle}>✨ Преимущества</div>
                <ul style={s.benefitsList}>
                  {scheme.benefits.map((benefit, i) => (
                    <li key={i} style={s.benefitItem}>{benefit}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notes */}
            {scheme.notes && (
              <div style={s.detailBlock}>
                <div style={s.detailTitle}>💬 Примечание</div>
                <div style={s.notesText}>{scheme.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="48" height="48" viewBox="0 0 50 50" style={{ display: "block" }}>
      <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.35)" strokeWidth="6" fill="none" />
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="110"
        strokeDashoffset="80"
        style={{ transformOrigin: "25px 25px", animation: "spin 1.2s linear infinite" }}
      />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
      `}</style>
    </svg>
  );
}

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow{background:linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);background-size:300% 300%;
      animation:glowShift 6s ease-in-out infinite,pulseSoft 3s ease-in-out infinite;transition:background .3s}
      @keyframes glowShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @keyframes pulseSoft{0%,100%{filter:brightness(1) saturate(1);transform:scale(1)}50%{filter:brightness(1.08) saturate(1.05);transform:scale(1.005)}}

      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(24px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .scheme-enter {
        animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      }
      .scheme-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(15,23,42,0.14);
      }
    `}</style>
  );
}

/* ---------- Styles ---------- */
const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },

  heroCard: {
    position: "relative",
    padding: 22,
    borderRadius: 28,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
    marginBottom: 14,
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
  },
  heroKicker: { marginTop: 8, opacity: 0.9, fontSize: 13, color: "rgba(255,255,255,.9)" },
  heroTitle: { fontSize: 26, fontWeight: 850, marginTop: 6, color: "#fff" },
  heroSubtitle: { opacity: 0.92, marginTop: 4, color: "rgba(255,255,255,.85)", lineHeight: 1.4 },

  // Insight Box - The "Lamp" with personalized reason
  insightBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    background: "linear-gradient(135deg, rgba(255,243,205,0.9) 0%, rgba(255,237,179,0.9) 100%)",
    borderRadius: 16,
    border: "1px solid rgba(255,193,7,0.3)",
    boxShadow: "0 2px 8px rgba(255,193,7,0.15)",
    marginTop: 4,
  },
  insightIcon: {
    fontSize: 24,
    lineHeight: 1,
    flexShrink: 0,
  },
  insightText: {
    fontSize: 14,
    fontWeight: 600,
    color: "#78350f",
    lineHeight: 1.5,
  },

  schemeCard: {
    position: "relative",
    padding: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  schemeCardSelected: {
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
    transform: "translateY(-2px)",
  },

  recommendedBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    background: "#0f172a",
    color: "#fff",
    padding: "5px 12px",
    borderRadius: "100px",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 5,
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.3)",
    zIndex: 10,
  },

  radioCircle: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "2px solid rgba(0,0,0,0.1)",
    background: "rgba(255,255,255,0.5)",
    display: "grid",
    placeItems: "center",
    transition: "all 0.3s ease",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#0f172a",
    transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  },

  // Marketing Title - Big and Bold
  marketingTitle: {
    fontSize: 22,
    fontWeight: 850,
    color: "#0f172a",
    marginTop: 0,
    marginLeft: 36,
    marginRight: 0,
    marginBottom: 4,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },

  // Technical Name - Small and Gray
  technicalName: {
    fontSize: 12,
    fontWeight: 500,
    color: "#64748b",
    marginLeft: 36,
    marginBottom: 10,
  },

  schemeInfo: {
    display: "flex",
    gap: 8,
    marginBottom: 14,
    marginLeft: 36,
    flexWrap: "wrap",
  },
  infoChip: {
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    padding: "5px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#334155",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },

  schemeDescription: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.6,
    marginBottom: 14,
    fontWeight: 500,
    marginLeft: 4,
  },

  expandBtn: {
    width: "100%",
    padding: "10px",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  detailsSection: {
    marginTop: 12,
    padding: 14,
    background: "rgba(255,255,255,0.5)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.06)",
    display: "grid",
    gap: 10,
  },

  detailBlock: {
    display: "grid",
    gap: 6,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0B1220",
  },

  daysList: {
    display: "grid",
    gap: 8,
  },
  dayItem: {
    padding: 8,
    background: "rgba(255,255,255,0.6)",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.06)",
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0B1220",
    marginBottom: 2,
  },
  dayFocus: {
    fontSize: 11,
    color: "#4a5568",
    lineHeight: 1.3,
  },

  benefitsList: {
    margin: 0,
    paddingLeft: 18,
    lineHeight: 1.5,
  },
  benefitItem: {
    fontSize: 12,
    color: "#1b1b1b",
    marginBottom: 4,
  },

  notesText: {
    fontSize: 12,
    color: "#4a5568",
    lineHeight: 1.4,
    fontStyle: "italic",
  },

  primaryBtn: {
    marginTop: 16,
    width: "100%",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
    background: "#0f172a",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },

  errorText: {
    marginTop: 10,
    padding: 10,
    background: "rgba(255,102,102,.15)",
    color: "#d24",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 10,
  },

  backTextBtn: {
    marginTop: 10,
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#111827",
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 16px",
    cursor: "pointer",
    textAlign: "center",
  },

  termsRow: {
    marginTop: 16,
    padding: "16px 20px 16px 64px",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
  },
  termsText: {
    fontSize: 13,
    color: "#111827",
    lineHeight: 1.4,
  },
  inlineLink: {
    background: "none",
    border: "none",
    color: "#2563EB",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "grid",
    placeItems: "center",
    zIndex: 999,
    padding: 20,
    backdropFilter: "blur(4px)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "90vh",
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    background: "#f9fafb",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111827",
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.06)",
    fontSize: 18,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: "#111827",
  },
  modalBody: {
    padding: 20,
    overflowY: "auto",
    flex: 1,
  },
  termsSection: {
    marginBottom: 20,
  },
  termsSectionTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#111827",
    marginBottom: 8,
  },
  termsSectionList: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.5,
  },
  termsSectionItem: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 6,
  },
};
