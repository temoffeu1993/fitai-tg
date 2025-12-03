// webapp/src/screens/onb/OnbMotivation.tsx
import { useEffect, useMemo, useState } from "react";

export type Goal =
  | "lose_weight"
  | "build_muscle"
  | "athletic_body"
  | "lower_body_focus"
  | "strength"
  | "health_wellness";
const MOTIVES = [
  { key: "health", label: "Здоровье" },
  { key: "energy", label: "Энергия" },
  { key: "confidence", label: "Уверенность" },
  { key: "sport", label: "Спорт-результаты" },
] as const;

export type OnbMotivationData = {
  motivation: {
    goal: Goal;
  };
  goals: {
    primary: Goal;
  };
};

type Props = {
  initial?: Partial<OnbMotivationData>;
  loading?: boolean;
  onSubmit: (patch: OnbMotivationData) => void;
  onBack?: () => void;
};

export default function OnbMotivation({ initial, loading, onSubmit, onBack }: Props) {
  // Цель
  const [goal, setGoal] = useState<Goal>(initial?.motivation?.goal ?? "lose_weight");
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const canNext = useMemo(() => accepted, [accepted]);
  useEffect(() => {
    if (showTerms) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showTerms]);
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
  const goalInfo: Record<Goal, string[]> = {
    lose_weight: ["похудеть и улучшить композицию тела", "сбросить лишний вес, подтянуть фигуру"],
    build_muscle: ["набрать мышечную массу всего тела", "увеличить объём мышц равномерно"],
    athletic_body: ["спортивное подтянутое тело", "улучшить рельеф и тонус мышц"],
    lower_body_focus: [
      "акцент на развитие ног и ягодиц",
      "сильная и красивая нижняя часть тела в составе сбалансированных тренировок",
    ],
    strength: ["стать сильнее и выносливее", "повысить силовые показатели и функциональность"],
    health_wellness: ["улучшить здоровье и самочувствие", "больше энергии, здоровые суставы и спина"],
  };

  function handleNext() {
    if (!canNext || loading) return;

    // === МГНОВЕННЫЙ ФЛАГ И ОПОВЕЩЕНИЕ ДЛЯ НАВБАРА ===
    try { localStorage.setItem("onb_complete", "1"); } catch {}
    try { new BroadcastChannel("onb").postMessage("onb_complete"); } catch {}
    try { window.dispatchEvent(new Event("onb_updated")); } catch {}

    onSubmit({
      motivation: {
        goal,
      },
      goals: {
        primary: goal,
      },
    });
  }

  return (
    <div style={st.page}>
      <SoftGlowStyles />

      {/* HERO — чёрный, как на остальных онбординг-экранах */}
      <section style={st.heroCard}>
        <div style={st.heroHeader}>
          <span style={st.pill}>Шаг 4 из 4</span>
        <span style={st.pill}>Анкета</span>
        </div>

        <div style={st.heroKicker}>Мотивация</div>
        <div style={st.heroTitle}>Мотивация и цель 🎯</div>
        <div style={st.heroSubtitle}>Понимание целей поможет точнее настроить план.</div>
      </section>

      {/* Цель — стеклянная карточка */}
      <section style={st.cardGlass}>
        <div style={st.blockTitle}>Какая у тебя цель?</div>
        <div style={st.wrapGridEven}>
          <Chip label="🏃 Похудеть" active={goal === "lose_weight"} onClick={() => setGoal("lose_weight")} />
          <Chip label="💪 Набрать массу" active={goal === "build_muscle"} onClick={() => setGoal("build_muscle")} />
          <Chip label="⚡️ Спортивное тело (рельеф)" active={goal === "athletic_body"} onClick={() => setGoal("athletic_body")} />
          <Chip label="🍑 Ноги и ягодицы" active={goal === "lower_body_focus"} onClick={() => setGoal("lower_body_focus")} />
          <Chip label="🏋️‍♂️ Стать сильнее" active={goal === "strength"} onClick={() => setGoal("strength")} />
          <Chip label="🩺 Здоровье и самочувствие" active={goal === "health_wellness"} onClick={() => setGoal("health_wellness")} />
        </div>

        <div style={st.goalInfo}>
          <div style={st.goalInfoTitle}>Что это значит</div>
          <div style={st.goalInfoList}>
            {goalInfo[goal].map((t) => (
              <div key={t} style={st.goalInfoItem}>
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={st.termsRow}>
        <button
          type="button"
          onClick={() => setAccepted((v) => !v)}
          style={{ ...st.circleCheck, ...(accepted ? st.circleCheckOn : {}) }}
        >
          {accepted ? "✓" : ""}
        </button>
        <span style={st.termsText}>
          Я ознакомился и согласен с Условиями использования приложения{" "}
          <button type="button" onClick={() => setShowTerms(true)} style={st.inlineLink}>
            Подробнее
          </button>
        </span>
      </div>

      {/* CTA — увеличенный размер как просили */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canNext || !!loading}
        className="soft-glow"
        style={{
          ...st.primaryBtn,
          opacity: !canNext || loading ? 0.6 : 1,
          cursor: !canNext || loading ? "default" : "pointer",
        }}
      >
        {loading ? "Сохранение…" : "Перейти к тренировкам →"}
      </button>

      {onBack && (
        <button type="button" onClick={onBack} style={st.backTextBtn}>
          Назад
        </button>
      )}

      <div style={{ height: 76 }} />

      {showTerms && (
        <div style={st.modalOverlay}>
          <div style={st.modalCard}>
            <div style={st.modalHeader}>
              <div style={st.modalTitle}>Условия использования и политика конфиденциальности</div>
              <button style={st.modalClose} onClick={() => setShowTerms(false)}>
                ✕
              </button>
            </div>
            <div style={st.modalBody}>
              {termsSections.map((section) => (
                <div key={section.title} style={st.termsSection}>
                  <div style={st.termsSectionTitle}>{section.title}</div>
                  <ul style={st.termsSectionList}>
                    {section.body.map((line) => (
                      <li key={line} style={st.termsSectionItem}>
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
    </div>
  );
}

/* --- UI primitives --- */
function Chip({
  label,
  active,
  onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...st.chip, ...(active ? st.chipActive : {}) }}>
      <span style={{ ...st.chipText, ...(active ? st.chipTextActive : {}) }}>{label}</span>
    </button>
  );
}

/* --- Shared soft glow for CTA --- */
function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow{background:linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);background-size:300% 300%;
      animation:glowShift 6s ease-in-out infinite,pulseSoft 3s ease-in-out infinite;transition:background .3s}
      @keyframes glowShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @keyframes pulseSoft{0%,100%{filter:brightness(1) saturate(1);transform:scale(1)}50%{filter:brightness(1.08) saturate(1.05);transform:scale(1.005)}}
    `}</style>
  );
}

/* --- Styles (единый фирменный стиль + увеличенные кнопки) --- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const GRAD = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },

  /* HERO чёрный */
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
  heroSubtitle: { opacity: 0.92, marginTop: 4, color: "rgba(255,255,255,.85)" },

  /* Стеклянные карточки */
  cardGlass: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
    backdropFilter: "blur(10px)",
  },

  blockTitle: { fontSize: 15, fontWeight: 800, color: "#0B1220", marginBottom: 10 },

  wrapGridEven: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 8,
    alignItems: "stretch",
    justifyItems: "stretch",
    marginTop: 8,
  },

  /* Чипы: увеличенные как просили */
  chip: {
    padding: "14px 14px",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    cursor: "pointer",
    fontWeight: 800,
    textAlign: "center" as const,
    transition: "transform .06s ease",
  },
  chipActive: {
    background: GRAD,
    color: "#000",
    border: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  chipText: { color: "#111827", letterSpacing: 0.3, fontSize: 13 },
  chipTextActive: { color: "#000", fontSize: 13, fontWeight: 900 },

  /* Поля ввода — стекло */
  inputGlass: {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: "12px",
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter: "blur(6px)",
    fontSize: 16,
    color: "#111",
    display: "block",
  },

  /* CTA — больше высота и шрифт */
  primaryBtn: {
    marginTop: 16,
    width: "100%",
    border: "none",
    borderRadius: 18,
    padding: "16px 20px",
    fontSize: 17,
    fontWeight: 850,
    color: "#000",
    background: GRAD,
    boxShadow: "0 2px 6px rgba(0,0,0,.12)",
    cursor: "pointer",
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
    textAlign: "center" as const,
  },
  goalInfo: {
    marginTop: 12,
    padding: "12px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.8)",
    border: "1px solid rgba(0,0,0,0.05)",
    color: "#0B1220",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
  },
  goalInfoTitle: { fontSize: 13, fontWeight: 800, marginBottom: 6, opacity: 0.8 },
  goalInfoList: { margin: 0, padding: 0, lineHeight: 1.4, fontSize: 13 },
  goalInfoItem: { marginBottom: 4 },

  termsRow: {
    marginTop: 32,
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  termsText: {
    fontSize: 12.5,
    color: "#0B1220",
    lineHeight: 1.35,
    display: "block",
    width: "100%",
  },
  inlineLink: {
    border: "none",
    background: "transparent",
    color: "#0B1220",
    textDecoration: "underline",
    fontSize: 12.5,
    padding: 0,
    margin: 0,
    cursor: "pointer",
  },

  circleCheck: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "2px solid rgba(148,163,184,.5)",
    background: "rgba(255,255,255,.85)",
    color: "#6b7280",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
    transition: "all .15s ease",
  },
  circleCheckOn: {
    borderColor: "transparent",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#1b1b1b",
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px 16px 56px",
    zIndex: 9999,
    overscrollBehavior: "contain" as const,
  },
  modalCard: {
    width: "100%",
    maxWidth: 780,
    maxHeight: "calc(100vh - 80px)",
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 12px 40px rgba(0,0,0,.2)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  modalHeader: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(0,0,0,.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: 800, color: "#0B1220" },
  modalClose: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    color: "#111",
  },
  modalBody: {
    padding: "12px 16px 24px",
    overflowY: "auto" as const,
    lineHeight: 1.5,
    color: "#111",
    fontSize: 14,
    overscrollBehavior: "contain" as const,
  },
  termsSection: { marginBottom: 12 },
  termsSectionTitle: { fontWeight: 800, marginBottom: 6, fontSize: 14.5 },
  termsSectionList: { margin: 0, paddingLeft: 16 },
  termsSectionItem: { marginBottom: 4 },
};
