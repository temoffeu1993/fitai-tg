// webapp/src/screens/onb/OnbSchemeSelection.tsx
import { useEffect, useState } from "react";
import type React from "react";
import {
  getSchemeRecommendations,
  selectScheme,
  type WorkoutScheme,
} from "@/api/schemes";

// !!! ЗАМЕНИ пути на свои !!!
import robotHero from "@/assets/onb/robot-hero.png";
import bodyFull from "@/assets/onb/body-full.png";

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
        "Разработчики Moro не несут ответственности за травмы/ухудшение здоровья, неточности рекомендаций из-за неполных данных, тренировки без консультации врача, технические сбои.",
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
      <div
        style={{
          minHeight: "var(--app-height, 100vh)",
          background: "var(--app-gradient-onb-schemes)",
        }}
      >
        <div style={s.page}>
          <NeonStyles />
          <section style={s.loadingCard}>
            <div style={s.stepRow}>
              <span style={s.stepPill}>Шаг 5 из 5</span>
            </div>
            <div style={s.loadingTitle}>Подбираем схему тренировок...</div>
            <div style={s.loadingSubtitle}>Анализируем твои данные</div>
            <div style={{ marginTop: 24, display: "grid", placeItems: "center" }}>
              <Spinner />
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (error || !recommended) {
    return (
      <div
        style={{
          minHeight: "var(--app-height, 100vh)",
          background: "var(--app-gradient-onb-schemes)",
        }}
      >
        <div style={s.page}>
          <NeonStyles />
          <section style={s.loadingCard}>
            <div style={s.loadingTitle}>Ошибка</div>
            <div style={s.loadingSubtitle}>
              {error || "Не удалось загрузить рекомендации"}
            </div>
            <button style={s.primaryBtn} onClick={() => loadRecommendations()}>
              Попробовать снова
            </button>
          </section>
        </div>
      </div>
    );
  }

  const allSchemes = [recommended, ...alternatives];

  return (
    <div
      style={{
        minHeight: "var(--app-height, 100vh)",
        background: "var(--app-gradient-onb-schemes)",
      }}
    >
      <div style={s.page}>
        <NeonStyles />

      {/* HEADER + HERO */}
      <header style={s.header}>
        <div style={s.stepRow}>
          <span style={s.stepPill}>Шаг 5 из 5</span>
          {onBack && (
            <button type="button" onClick={onBack} style={s.backTopBtn}>
              Назад
            </button>
          )}
        </div>

        <div style={s.headerTop}>
          <div>
            <h1 style={s.headerTitle}>Выбери схему тренировок</h1>
            <p style={s.headerSubtitle}>
              Мы уже учли цель, опыт и дни. Осталось выбрать, как именно будешь
              тренироваться.
            </p>
          </div>

          <div style={s.recoBadge}>
            <span style={s.recoDot} />
            <span>Рекомендовано Моро</span>
          </div>
        </div>
      </header>

      <section style={s.heroSection}>
        <div style={s.heroGlow} />
        <div style={s.heroInner}>
          <img src={robotHero} alt="Moro" style={s.heroRobot} />
          <div style={s.heroTextBlock}>
            <p style={s.heroTextMain}>
              Моро уже отобрал лучшие схемы под твой режим.
            </p>
            <div style={s.heroMetaRow}>
              <span style={s.heroMetaChip}>Цель: {getGoalText(recommended)}</span>
              <span style={s.heroMetaChip}>
                {recommended.daysPerWeek} дн/нед
              </span>
              <span style={s.heroMetaChip}>
                {recommended.minMinutes}–{recommended.maxMinutes} мин
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SCHEMES */}
      <section style={s.schemesSection}>
        {/* Основная (рекомендованная) карточка — как Full Body */}
        <article
          style={{
            ...s.schemeCardPrimary,
            ...(selectedId === recommended.id ? s.schemeCardPrimarySelected : {}),
          }}
          className="scheme-enter"
          onClick={() => setSelectedId(recommended.id)}
        >
          <div style={s.schemeCardPrimaryHeader}>
            <div>
              <div style={s.schemeChipPrimary}>Рекомендуется</div>
              <div style={s.schemeTitle}>{recommended.name}</div>
              {recommended.description && (
                <div style={s.schemeTagline}>"{recommended.description}"</div>
              )}
            </div>

            <div style={s.schemeFigure}>
              <img src={bodyFull} alt="Body load" style={s.schemeFigureImg} />
            </div>
          </div>

          <div style={s.schemeMetaRow}>
            <span style={s.metaPill}>
              {recommended.daysPerWeek} дн/неделю
            </span>
            <span style={s.metaPill}>
              {recommended.minMinutes}–{recommended.maxMinutes} мин
            </span>
            {recommended.intensity && (
              <span style={s.metaPill}>
                Интенсивность:{" "}
                {recommended.intensity === "low"
                  ? "низкая"
                  : recommended.intensity === "moderate"
                  ? "средняя"
                  : "высокая"}
              </span>
            )}
          </div>

          <div style={s.schemePrimaryBottomRow}>
            <div style={s.loadBlock}>
              <div style={s.loadTitle}>Нагрузка по мышцам</div>
              <div style={s.loadRow}>
                <span style={s.loadLabel}>Всё тело</span>
                <div style={s.loadBars}>
                  <span
                    style={{ ...s.loadBar, ...s.loadBarMain }}
                  />
                  <span style={s.loadBar} />
                  <span style={s.loadBar} />
                </div>
              </div>
            </div>

            <button
              type="button"
              style={s.selectBtn}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(recommended.id);
              }}
            >
              Выбрать {recommended.name}
            </button>
          </div>
        </article>

        {/* Альтернативы */}
        {alternatives.map((scheme, index) => (
          <AltSchemeCard
            key={scheme.id}
            scheme={scheme}
            index={index}
            isSelected={selectedId === scheme.id}
            onSelect={() => setSelectedId(scheme.id)}
          />
        ))}
      </section>

      {/* Условия */}
      <div style={s.termsRow}>
        <button
          type="button"
          onClick={() => setAccepted((v) => !v)}
          style={{
            ...s.circleCheck,
            ...(accepted ? s.circleCheckOn : {}),
          }}
        >
          {accepted ? "✓" : ""}
        </button>
        <span style={s.termsText}>
          Я ознакомился и согласен с Условиями использования приложения{" "}
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            style={s.inlineLink}
          >
            Подробнее
          </button>
        </span>
      </div>

      {/* CTA */}
      <button
        onClick={handleConfirm}
        disabled={!selectedId || !accepted || saving}
        style={{
          ...s.primaryBtn,
          opacity: !selectedId || !accepted || saving ? 0.6 : 1,
          cursor: !selectedId || !accepted || saving ? "default" : "pointer",
        }}
      >
        {saving ? "Сохраняем..." : "Перейти к тренировкам →"}
      </button>

      {onBack && (
        <button type="button" onClick={onBack} style={s.backBottomBtn}>
          Назад
        </button>
      )}

      {error && <div style={s.errorText}>{error}</div>}

      {/* Модалка с условиями */}
      {showTerms && (
        <div style={s.modalOverlay}>
          <div style={s.modalCard}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>
                Условия использования и политика конфиденциальности
              </div>
              <button
                style={s.modalClose}
                onClick={() => setShowTerms(false)}
              >
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

        <div style={{ height: 72 }} />
      </div>
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

function AltSchemeCard({
  scheme,
  isSelected,
  onSelect,
  index,
}: {
  scheme: WorkoutScheme;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  return (
    <article
      className="scheme-enter"
      style={{
        ...s.altCard,
        ...(isSelected ? s.altCardSelected : {}),
        animationDelay: `${index * 90}ms`,
      }}
      onClick={onSelect}
    >
      <div style={s.altHeaderRow}>
        <div>
          <div style={s.altTitle}>{scheme.name}</div>
          {scheme.description && (
            <div style={s.altTagline}>{scheme.description}</div>
          )}
        </div>
        <div style={s.altChip}>Тоже подходит</div>
      </div>

      <div style={s.altMetaRow}>
        <span style={s.metaPill}>
          {scheme.daysPerWeek} дн/неделю
        </span>
        <span style={s.metaPill}>
          {scheme.minMinutes}–{scheme.maxMinutes} мин
        </span>
      </div>

      {scheme.reason && (
        <div style={s.altFootnote}>{scheme.reason}</div>
      )}
    </article>
  );
}

function Spinner() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 50 50"
      style={{ display: "block" }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke="rgba(148,163,184,.35)"
        strokeWidth="6"
        fill="none"
      />
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke="#e5e7eb"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="110"
        strokeDashoffset="80"
        style={{
          transformOrigin: "25px 25px",
          animation: "spin 1.2s linear infinite",
        }}
      />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
      `}</style>
    </svg>
  );
}

function NeonStyles() {
  return (
    <style>{`
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(32px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .scheme-enter {
        animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      }
      @keyframes cardFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
    `}</style>
  );
}

/* ---------- inline styles ---------- */

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 420,
    margin: "0 auto",
    minHeight: "var(--app-height, 100vh)",
    padding: "16px 16px 24px",
    boxSizing: "border-box",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif",
    color: "#F9FAFB",
  },

  header: {
    marginBottom: 16,
  },
  stepRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stepPill: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.4)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#9CA3AF",
    background: "rgba(15,23,42,0.8)",
  },
  backTopBtn: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "none",
    fontSize: 12,
    background: "rgba(15,23,42,0.8)",
    color: "#E5E7EB",
    cursor: "pointer",
  },

  headerTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
    margin: "0 0 6px",
    lineHeight: 1.15,
    fontWeight: 800,
  },
  headerSubtitle: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: "#9CA3AF",
  },
  recoBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    background:
      "linear-gradient(120deg, rgba(68,224,194,0.16), rgba(122,92,255,0.18)), rgba(10,14,26,0.9)",
    border: "1px solid rgba(165,180,252,0.4)",
    backdropFilter: "blur(14px)",
    whiteSpace: "nowrap",
  },
  recoDot: {
    width: 8,
    height: 8,
    borderRadius: "999px",
    background:
      "radial-gradient(circle, #7a5cff 0%, #44e0c2 70%, transparent 100%)",
  },

  heroSection: {
    position: "relative",
    marginBottom: 18,
    borderRadius: 26,
    overflow: "hidden",
    border: "1px solid rgba(148,163,184,0.3)",
    background:
      "radial-gradient(circle at 50% 0, #111827 0, #020617 60%, #020308 100%)",
  },
  heroGlow: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 50% 10%, rgba(68,224,194,0.28), transparent 60%)",
    opacity: 0.9,
    pointerEvents: "none",
  },
  heroInner: {
    position: "relative",
    padding: "24px 16px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  heroRobot: {
    height: 150,
    objectFit: "contain",
    marginBottom: 4,
    filter: "drop-shadow(0 0 32px rgba(56,189,248,0.6))",
  },
  heroTextBlock: {
    textAlign: "center",
    maxWidth: 320,
  },
  heroTextMain: {
    margin: 0,
    fontSize: 14,
    color: "#E5E7EB",
  },
  heroMetaRow: {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  heroMetaChip: {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    background: "rgba(15,23,42,0.85)",
    color: "#9CA3AF",
  },

  schemesSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 16,
  },

  schemeCardPrimary: {
    position: "relative",
    padding: 14,
    borderRadius: 24,
    background:
      "linear-gradient(145deg, rgba(68,224,194,0.06), rgba(122,92,255,0.14)), rgba(15,23,42,0.92)",
    border: "1px solid rgba(148,163,184,0.5)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.65)",
    cursor: "pointer",
  },
  schemeCardPrimarySelected: {
    boxShadow:
      "0 22px 60px rgba(34,197,235,0.4), 0 0 0 1px rgba(56,189,248,0.8)",
  },
  schemeCardPrimaryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  schemeChipPrimary: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    background:
      "linear-gradient(120deg, rgba(68,224,194,0.32), rgba(122,92,255,0.38))",
    color: "#F9FAFB",
    marginBottom: 6,
  },
  schemeTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 2,
  },
  schemeTagline: {
    fontSize: 13,
    color: "#E5E7EB",
    opacity: 0.85,
  },
  schemeFigure: {
    flexShrink: 0,
  },
  schemeFigureImg: {
    width: 80,
    height: "auto",
    filter: "drop-shadow(0 0 24px rgba(56,189,248,0.6))",
  },

  schemeMetaRow: {
    marginTop: 10,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    background: "rgba(15,23,42,0.9)",
    color: "#CBD5F5",
  },

  schemePrimaryBottomRow: {
    marginTop: 12,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  loadBlock: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  loadTitle: {
    marginBottom: 4,
  },
  loadRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  loadLabel: {
    minWidth: 60,
  },
  loadBars: {
    display: "flex",
    gap: 3,
  },
  loadBar: {
    width: 14,
    height: 8,
    borderRadius: 999,
    background:
      "linear-gradient(135deg, rgba(31,41,55,1), rgba(15,23,42,1))",
  },
  loadBarMain: {
    background:
      "linear-gradient(135deg, #44e0c2, #7a5cff)",
  },

  selectBtn: {
    border: "none",
    borderRadius: 999,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#020617",
    background:
      "linear-gradient(120deg, #44e0c2, #7a5cff)",
    boxShadow: "0 0 18px rgba(56,189,248,0.8)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  // Альтернативные схемы
  altCard: {
    position: "relative",
    padding: 14,
    borderRadius: 22,
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(55,65,81,0.9)",
    boxShadow: "0 14px 32px rgba(0,0,0,0.6)",
    cursor: "pointer",
  },
  altCardSelected: {
    boxShadow:
      "0 18px 44px rgba(79,70,229,0.5), 0 0 0 1px rgba(129,140,248,0.9)",
  },
  altHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  altTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 4,
  },
  altTagline: {
    fontSize: 13,
    color: "#E5E7EB",
    opacity: 0.9,
  },
  altChip: {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(56,189,248,0.7)",
    color: "#A5F3FC",
    whiteSpace: "nowrap",
  },
  altMetaRow: {
    marginTop: 10,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  altFootnote: {
    marginTop: 8,
    fontSize: 12,
    color: "#9CA3AF",
  },

  // terms / CTA / modal
  termsRow: {
    marginTop: 16,
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid rgba(55,65,81,0.8)",
    background: "rgba(15,23,42,0.9)",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  circleCheck: {
    width: 22,
    height: 22,
    minWidth: 22,
    borderRadius: "50%",
    border: "2px solid rgba(148,163,184,0.7)",
    background: "rgba(15,23,42,0.9)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    fontSize: 12,
    color: "#F9FAFB",
  },
  circleCheckOn: {
    background:
      "linear-gradient(135deg,#44e0c2,#7a5cff)",
    border: "2px solid transparent",
  },
  termsText: {
    fontSize: 12,
    color: "#E5E7EB",
    lineHeight: 1.5,
  },
  inlineLink: {
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    color: "#38BDF8",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  },

  primaryBtn: {
    marginTop: 14,
    width: "100%",
    borderRadius: 18,
    border: "none",
    padding: "13px 16px",
    fontSize: 15,
    fontWeight: 700,
    background:
      "linear-gradient(135deg,#44e0c2,#7a5cff)",
    color: "#020617",
    boxShadow: "0 0 26px rgba(56,189,248,0.9)",
  },
  backBottomBtn: {
    marginTop: 10,
    width: "100%",
    border: "none",
    padding: 10,
    borderRadius: 999,
    background: "transparent",
    color: "#9CA3AF",
    fontSize: 14,
    cursor: "pointer",
  },

  errorText: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    background: "rgba(248,113,113,0.18)",
    color: "#fecaca",
    fontSize: 13,
  },

  loadingCard: {
    marginTop: 40,
    padding: 20,
    borderRadius: 24,
    background: "rgba(15,23,42,0.95)",
    border: "1px solid rgba(55,65,81,0.9)",
    boxShadow: "0 18px 44px rgba(0,0,0,0.7)",
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginTop: 10,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.8)",
    display: "grid",
    placeItems: "center",
    zIndex: 50,
    padding: 16,
    backdropFilter: "blur(4px)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "90vh",
    background: "#0b1120",
    borderRadius: 22,
    border: "1px solid rgba(148,163,184,0.8)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.9)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "14px 18px",
    borderBottom: "1px solid rgba(51,65,85,0.9)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background:
      "linear-gradient(135deg, rgba(15,23,42,1), rgba(30,64,175,0.7))",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#E5E7EB",
  },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "none",
    background: "rgba(15,23,42,0.9)",
    color: "#E5E7EB",
    cursor: "pointer",
  },
  modalBody: {
    padding: 16,
    overflowY: "auto",
    color: "#E5E7EB",
  },
  termsSection: {
    marginBottom: 16,
  },
  termsSectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 6,
  },
  termsSectionList: {
    margin: 0,
    paddingLeft: 18,
    lineHeight: 1.5,
  },
  termsSectionItem: {
    fontSize: 12,
    marginBottom: 4,
  },
};