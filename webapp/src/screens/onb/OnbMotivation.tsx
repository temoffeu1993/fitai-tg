// webapp/src/screens/onb/OnbMotivation.tsx
import { useMemo, useState } from "react";

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
          Я ознакомился и согласен с Условиями использования приложения и политикой конфиденциальности.
        </span>
        <button type="button" onClick={() => setShowTerms(true)} style={st.linkBtn}>
          Подробнее
        </button>
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
{`ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ

1. О ПРИЛОЖЕНИИ
Moro — это интеллектуальный фитнес-ассистент, который создает 
персонализированные программы тренировок и питания на основе данных, 
которые вы предоставляете (возраст, вес, цели, опыт тренировок, 
доступное оборудование и другие параметры).

Приложение предназначено для образовательных и информационных целей 
и помогает структурировать ваши тренировки на основе научных принципов 
фитнеса.

2. ОГРАНИЧЕНИЯ ТЕХНОЛОГИИ
Несмотря на то, что наши алгоритмы учитывают предоставленную вами 
информацию и создают адаптированные программы:

- ИИ не является заменой очной консультации с врачом, который может 
  провести полноценное медицинское обследование
- ИИ не может учитывать скрытые заболевания или состояния, о которых 
  вы не знаете или не указали в анкете
- ИИ работает на основе общих принципов тренировок и не заменяет 
  индивидуальную работу с сертифицированным тренером, который может 
  наблюдать за техникой выполнения упражнений в реальном времени

Приложение дополняет, но не заменяет профессиональное медицинское 
наблюдение и тренерский контроль.

3. РЕКОМЕНДАЦИЯ: КОНСУЛЬТАЦИЯ СО СПЕЦИАЛИСТАМИ
Мы настоятельно рекомендуем (но не требуем обязательно) 
проконсультироваться с врачом перед началом программы тренировок, 
особенно если:
- Вы давно не занимались спортом
- У вас есть хронические заболевания
- Вы принимаете лекарства на постоянной основе
- У вас были травмы опорно-двигательного аппарата
- Вы беременны или в послеродовом периоде
- Вам более 40 лет и вы начинаете тренировки впервые
- У вас есть любые сомнения относительно своего здоровья

4. ВАША ОТВЕТСТВЕННОСТЬ
Используя приложение, вы принимаете на себя ответственность за:
- Честное и полное заполнение анкеты о состоянии здоровья
- Выбор адекватного уровня нагрузки
- Соблюдение правильной техники выполнения упражнений
- Прекращение тренировки при появлении боли или дискомфорта
- Решение о начале тренировок без консультации врача 
  (если вы это решите)

5. ПРИЗНАНИЕ РИСКОВ
Вы понимаете и признаете, что:
- Физические упражнения сопряжены с определенными рисками, включая 
  риск травм, независимо от того, занимаетесь вы с тренером, 
  по приложению или самостоятельно
- Результаты тренировок индивидуальны и зависят от множества факторов
- При неправильном выполнении упражнений или игнорировании сигналов 
  тела возможны травмы

ВАЖНО: При любых неприятных ощущениях (боль, головокружение, тошнота, 
одышка, учащенное сердцебиение) необходимо немедленно прекратить 
тренировку и обратиться к врачу.

6. ОГРАНИЧЕНИЕ ОТВЕТСТВЕННОСТИ
Разработчики FitAI, его владельцы и партнеры не несут ответственности за:
- Травмы или ухудшение здоровья, возникшие во время или в результате 
  тренировок по программам приложения
- Неточности в рекомендациях, возникшие из-за неполных или неверных 
  данных, указанных пользователем
- Последствия тренировок без предварительной консультации с врачом
- Технические сбои или ошибки в работе приложения

7. НЕ ГАРАНТИЯ РЕЗУЛЬТАТОВ
Мы создаем научно обоснованные программы, однако не гарантируем:
- Достижение конкретных результатов в определенные сроки
- Отсутствие индивидуальных реакций организма
- Полное соответствие программы вашим скрытым особенностям здоровья

8. АКТУАЛЬНОСТЬ ИНФОРМАЦИИ
Мы регулярно обновляем алгоритмы на основе актуальных научных данных 
в области фитнеса и спортивной медицины, однако не можем гарантировать, 
что вся информация всегда отражает самые последние исследования.

9. СОГЛАСИЕ
Используя приложение, вы подтверждаете, что:
- Прочитали и поняли данные условия
- Принимаете их и соглашаетесь с ними
- Понимаете разницу между ИИ-помощником и профессиональным 
  медицинским/тренерским сопровождением
- Берете на себя ответственность за использование приложения

Приложение создано для того, чтобы помочь вам достичь ваших 
фитнес-целей безопасно и эффективно, но окончательная ответственность 
за ваше здоровье всегда остается за вами.

Последнее обновление: сегодняшняя дата`}
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
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 8,
  },
  termsText: { fontSize: 12.5, color: "#0B1220", lineHeight: 1.35 },
  linkBtn: {
    border: "1px solid #111",
    background: "transparent",
    color: "#111",
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: 12.5,
    cursor: "pointer",
  },

  circleCheck: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "2px solid rgba(0,0,0,0.2)",
    background: "#f8f8f8",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    transition: "all .15s ease",
  },
  circleCheckOn: {
    borderColor: "#111",
    background: "#111",
  },
};
