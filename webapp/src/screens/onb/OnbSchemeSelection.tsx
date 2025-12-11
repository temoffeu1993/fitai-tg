// webapp/src/screens/onb/OnbSchemeSelection.tsx
import { useEffect, useState } from "react";
import { getSchemeRecommendations, selectScheme, type WorkoutScheme } from "@/api/schemes";
import roboShemImg from "../../assets/roboshem.png";
import siluetShemImg from "../../assets/siluetshem.png";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

export default function OnbSchemeSelection({ onComplete, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<WorkoutScheme | null>(null);
  const [alternatives, setAlternatives] = useState<WorkoutScheme[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

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
      // По умолчанию выбираем рекомендованную
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
      
      // Сохраняем флаг в localStorage
      localStorage.setItem("scheme_selected", "1");
      
      // Оповещаем систему
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
          <div style={{ marginTop: 24, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
          <div style={{ ...s.heroTitle, marginTop: 20, textAlign: "center" }}>
            Подбираем схему тренировок...
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

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      
      {/* HERO с роботом */}
      <section style={s.heroCard}>
        {/* Робот */}
        <div style={s.robotContainer}>
          <img src={roboShemImg} alt="Moro" style={s.robotImg} />
          
          {/* Бейдж рекомендовано Моро */}
          <div style={s.moroRecommendedBadge}>
            <div style={s.pawIcon}>🐾</div>
            <div style={s.badgeText}>
              <div style={s.badgeTitle}>Рекомендовано</div>
              <div style={s.badgeSubtitle}>Moro</div>
            </div>
          </div>
        </div>

        {/* Заголовок */}
        <div style={s.heroTitle}>Выбери схему тренировок</div>
        <div style={s.heroSubtitle}>
          Мы уже учли цель, опыт и дни. Осталось выбрать, как именно будешь тренироваться.
        </div>

        {/* Инфо блок Moro */}
        <div style={s.moroInfoBlock}>
          <div style={s.moroInfoText}>Moro уже отобрал лучшие схемы под твой режим.</div>
          
          {/* Параметры */}
          <div style={s.paramsRow}>
            <span style={s.paramItem}>Цель: {getGoalText(recommended)}</span>
            <span style={s.paramDot}>•</span>
            <span style={s.paramItem}>{recommended.daysPerWeek} дня</span>
            <span style={s.paramDot}>•</span>
            <span style={s.paramItem}>{recommended.minMinutes}-{recommended.maxMinutes} мин</span>
            <span style={s.snowflake}>❄️</span>
          </div>
        </div>
      </section>

      {/* Схемы */}
      <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
        {allSchemes.map((scheme, i) => (
          <SchemeCard
            key={scheme.id}
            index={i}
            scheme={scheme}
            isSelected={selectedId === scheme.id}
            isRecommended={i === 0}
            onSelect={() => setSelectedId(scheme.id)}
          />
        ))}
      </div>

      {/* Чекбокс условий использования */}
      <div style={s.termsRow}>
        <button
          type="button"
          onClick={() => setAccepted((v) => !v)}
          style={{ ...s.circleCheck, ...(accepted ? s.circleCheckOn : {}) }}
        >
          {accepted ? "✓" : ""}
        </button>
        <span style={s.termsText}>
          Я ознакомился и согласен с Условиями использования приложения{" "}
          <button type="button" onClick={() => setShowTerms(true)} style={s.inlineLink}>
            Подробнее
          </button>
        </span>
      </div>

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
        {saving ? "Сохраняем..." : "Перейти к тренировкам →"}
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

function getGoalText(scheme: WorkoutScheme): string {
  if (scheme.goals.includes("mass") || scheme.goals.includes("muscle_gain")) return "масса";
  if (scheme.goals.includes("strength")) return "сила";
  if (scheme.goals.includes("fat_loss") || scheme.goals.includes("weight_loss")) return "похудение";
  if (scheme.goals.includes("endurance")) return "выносливость";
  return "фитнес";
}

function SchemeCard({
  scheme,
  isSelected,
  isRecommended,
  onSelect,
  index,
}: {
  scheme: WorkoutScheme;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
  index: number;
}) {
  const displayName = scheme.name;

  // Определяем нагрузку на группы мышц
  const muscleLoad = getMuscleLoad(scheme);

  return (
    <div
      className={`scheme-card scheme-enter`}
      style={{
        ...s.schemeCard,
        animationDelay: `${index * 120}ms`,
      }}
    >
      {/* Бейдж сверху */}
      <div style={isRecommended ? s.recommendedLabel : s.alternativeLabel}>
        {isRecommended ? "Рекомендуется" : "Тоже подходит"}
      </div>

      {/* Основное содержимое карточки */}
      <div style={s.schemeContent}>
        {/* Левая часть - текст и кнопка */}
        <div style={s.schemeLeft}>
          {/* Название */}
          <div style={s.schemeNameNew}>{displayName}</div>
          
          {/* Подзаголовок */}
          <div style={s.schemeTagline}>«{getTagline(displayName)}»</div>

          {/* Параметры */}
          <div style={s.schemeParams}>
            {scheme.daysPerWeek} дн{scheme.daysPerWeek <= 4 ? 'я' : 'ей'} в неделю • {scheme.minMinutes}-{scheme.maxMinutes} мин • фокус: {getFocusText(scheme)}
          </div>

          {/* Кнопка выбора */}
          <button
            style={{
              ...s.selectButton,
              ...(isSelected ? s.selectButtonActive : {}),
            }}
            onClick={onSelect}
          >
            {isSelected ? `✓ Выбрано` : `Выбрать ${displayName}`}
          </button>

          {/* Нагрузка на мышцы */}
          <div style={s.muscleSection}>
            <div style={s.muscleSectionTitle}>Нагрузка по мышц.ам</div>
            <div style={s.muscleGrid}>
              {muscleLoad.map((muscle) => (
                <div key={muscle.name} style={s.muscleColumn}>
                  <div style={s.muscleBar}>
                    <div 
                      style={{
                        ...s.muscleBarFill,
                        height: `${muscle.level * 33.33}%`,
                        background: getMuscleColor(muscle.level)
                      }}
                    />
                  </div>
                  <div style={s.muscleLabel}>{muscle.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Правая часть - силуэт */}
        <div style={s.schemeRight}>
          <img src={siluetShemImg} alt="" style={s.silhouetteImg} />
        </div>
      </div>
    </div>
  );
}

function getTagline(schemeName: string): string {
  if (schemeName.toLowerCase().includes("full body")) return "Всё тело за одну тренировку";
  if (schemeName.toLowerCase().includes("upper") || schemeName.toLowerCase().includes("lower")) 
    return "Разделяем верх и низ тела";
  if (schemeName.toLowerCase().includes("push") || schemeName.toLowerCase().includes("pull")) 
    return "Разделяем по типу движений";
  return "Эффективная схема тренировок";
}

function getFocusText(scheme: WorkoutScheme): string {
  if (scheme.splitType === "full_body") return "база + техника";
  if (scheme.splitType === "upper_lower") return "ноги и верх";
  if (scheme.splitType === "push_pull_legs") return "жимы и тяги";
  return "комплексно";
}

function getMuscleLoad(scheme: WorkoutScheme): Array<{ name: string; level: number }> {
  // Упрощенная логика - для Full Body все высоко, для split - по-разному
  if (scheme.splitType === "full_body") {
    return [
      { name: "Верх", level: 3 },
      { name: "Низ", level: 3 },
      { name: "Core", level: 2 },
      { name: "Push", level: 3 },
      { name: "Pull", level: 3 },
    ];
  } else if (scheme.splitType === "upper_lower") {
    return [
      { name: "Верх", level: 2 },
      { name: "Низ", level: 2 },
      { name: "Core", level: 3 },
      { name: "Push", level: 2 },
      { name: "Pull", level: 2 },
    ];
  } else {
    return [
      { name: "Верх", level: 1 },
      { name: "Низ", level: 2 },
      { name: "Core", level: 2 },
      { name: "Push", level: 3 },
      { name: "Pull", level: 2 },
    ];
  }
}

function getMuscleColor(level: number): string {
  if (level === 1) return "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)";
  if (level === 2) return "linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)";
  return "linear-gradient(90deg, #6366f1 0%, #818cf8 100%)";
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
        from { opacity: 0; transform: translateY(40px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .scheme-enter {
        animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      }
      .scheme-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 48px rgba(0,0,0,0.2);
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
    minHeight: "100vh",
  },

  heroCard: {
    position: "relative",
    padding: "32px 24px 28px",
    borderRadius: 28,
    boxShadow: "0 4px 24px rgba(0,0,0,.12)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
    marginBottom: 20,
  },

  robotContainer: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },

  robotImg: {
    width: 280,
    height: "auto",
    display: "block",
    margin: "0 auto",
  },

  moroRecommendedBadge: {
    position: "absolute",
    top: "50%",
    right: 16,
    transform: "translateY(-50%)",
    background: "rgba(139, 92, 246, 0.2)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1.5px solid rgba(167, 139, 250, 0.4)",
    borderRadius: 16,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: "0 8px 24px rgba(139, 92, 246, 0.2)",
  },

  pawIcon: {
    fontSize: 24,
  },

  badgeText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },

  badgeTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },

  badgeSubtitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#fff",
  },

  heroTitle: {
    fontSize: 32,
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1.1,
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },

  heroSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,.75)",
    lineHeight: 1.5,
    marginBottom: 20,
  },

  moroInfoBlock: {
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.15)",
  },

  moroInfoText: {
    fontSize: 14,
    color: "#fff",
    marginBottom: 12,
    lineHeight: 1.4,
  },

  paramsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  paramItem: {
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
    fontWeight: 600,
  },

  paramDot: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },

  snowflake: {
    fontSize: 16,
    marginLeft: 4,
  },

  schemeCard: {
    position: "relative",
    borderRadius: 24,
    background: "#0f172a",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
    transition: "all 0.3s ease",
  },

  recommendedLabel: {
    background: "rgba(139, 92, 246, 0.2)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 700,
    color: "#a78bfa",
    textAlign: "center",
    borderBottom: "1px solid rgba(167, 139, 250, 0.2)",
  },

  alternativeLabel: {
    background: "rgba(100, 116, 139, 0.15)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  },

  schemeContent: {
    display: "flex",
    gap: 16,
    padding: 24,
    alignItems: "flex-start",
  },

  schemeLeft: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  schemeNameNew: {
    fontSize: 28,
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  },

  schemeTagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontStyle: "italic",
    marginTop: -4,
  },

  schemeParams: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 1.5,
  },

  selectButton: {
    padding: "12px 20px",
    borderRadius: 12,
    border: "2px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginTop: 4,
  },

  selectButtonActive: {
    background: "#fff",
    color: "#0f172a",
    border: "2px solid #fff",
  },

  muscleSection: {
    marginTop: 16,
    padding: 16,
    background: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
  },

  muscleSectionTitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 12,
    fontWeight: 600,
  },

  muscleGrid: {
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
  },

  muscleColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },

  muscleLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    fontWeight: 600,
    textAlign: "center",
    order: 2,
  },

  muscleBar: {
    width: "100%",
    height: 64,
    background: "rgba(255,255,255,0.1)",
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
    display: "flex",
    alignItems: "flex-end",
    order: 1,
  },

  muscleBarFill: {
    width: "100%",
    borderRadius: 6,
    transition: "height 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
  },

  schemeRight: {
    width: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  silhouetteImg: {
    width: "100%",
    height: "auto",
    display: "block",
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
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.06)",
  },
  circleCheck: {
    width: 24,
    height: 24,
    minWidth: 24,
    borderRadius: "50%",
    border: "2px solid rgba(0,0,0,0.2)",
    background: "rgba(255,255,255,0.9)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    fontSize: 14,
    color: "#fff",
    transition: "all .15s ease",
  },
  circleCheckOn: {
    background: "#0f172a",
    border: "2px solid #0f172a",
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
