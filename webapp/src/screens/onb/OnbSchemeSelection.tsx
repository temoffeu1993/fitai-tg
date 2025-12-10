// webapp/src/screens/onb/OnbSchemeSelection.tsx
import { useEffect, useState } from "react";
import { getSchemeRecommendations, selectScheme, type WorkoutScheme } from "@/api/schemes";
import robotImg from "@/assets/robot.png";

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

  useEffect(() => {
    loadRecommendations();
  }, []);

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
        <div style={s.heroTitle}>Выбери программу 🏋️</div>
        <div style={s.heroSubtitle}>
          Мы подобрали для тебя 3 варианта на основе твоих данных. Одна рекомендована тренером.
        </div>
        
        {/* Кнопка назад */}
        {onBack && (
          <button onClick={onBack} style={s.backBtn}>
            ← Назад
          </button>
        )}
      </section>

      {/* Схемы */}
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {allSchemes.map((scheme) => (
          <SchemeCard
            key={scheme.id}
            scheme={scheme}
            isSelected={selectedId === scheme.id}
            onSelect={() => setSelectedId(scheme.id)}
          />
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={handleConfirm}
        disabled={!selectedId || saving}
        className="soft-glow"
        style={{
          ...s.primaryBtn,
          opacity: !selectedId || saving ? 0.6 : 1,
          cursor: !selectedId || saving ? "default" : "pointer",
        }}
      >
        {saving ? "Сохраняем..." : "Подтвердить выбор →"}
      </button>

      {error && <div style={s.errorText}>{error}</div>}

      <div style={{ height: 76 }} />
    </div>
  );
}

function SchemeCard({
  scheme,
  isSelected,
  onSelect,
}: {
  scheme: WorkoutScheme;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayName = scheme.name;

  return (
    <div
      style={{
        ...s.schemeCard,
        ...(isSelected ? s.schemeCardSelected : {}),
      }}
      onClick={onSelect}
    >
      {/* Бейдж "Рекомендовано тренером" */}
      {scheme.isRecommended && (
        <div style={s.recommendedBadge}>
          <span style={{ fontSize: 14 }}>⭐</span>
          <span style={s.recommendedText}>Рекомендовано тренером</span>
        </div>
      )}

      {/* Радио-кнопка */}
      <div style={s.radioCircle}>
        {isSelected && <div style={s.radioDot} />}
      </div>

      {/* Контент карточки с роботом */}
      <div style={s.cardLayout}>
        {/* Левая часть - текст */}
        <div style={s.cardContent}>
          {/* Название */}
          <div style={s.schemeName}>{displayName}</div>
          
          {/* Краткая инфо */}
          <div style={s.schemeInfo}>
            <span style={s.infoChip}>📅 {scheme.daysPerWeek} дн</span>
            <span style={s.infoChip}>⏱️ {scheme.minMinutes}-{scheme.maxMinutes} мин</span>
            <span style={s.infoChip}>
              {scheme.intensity === "low" ? "🟢" : 
               scheme.intensity === "moderate" ? "🟡" : 
               "🔴"}
            </span>
          </div>

          {/* Описание */}
          <div style={s.schemeDescription}>{scheme.description}</div>
        </div>

        {/* Правая часть - 3D робот */}
        <div style={s.robotContainer}>
          <img src={robotImg} alt="AI Trainer" style={s.robotImage} />
        </div>
      </div>

      {/* Разворачиваемая секция с деталями */}
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

      {expanded && (
        <div style={s.detailsSection}>
          {/* Причина рекомендации */}
          {scheme.reason && (
            <div style={s.detailBlock}>
              <div style={s.detailTitle}>💡 Почему эта схема</div>
              <div style={s.reasonTextExpanded}>{scheme.reason}</div>
            </div>
          )}

          {/* Дни недели */}
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

          {/* Преимущества */}
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

          {/* Заметки */}
          {scheme.notes && (
            <div style={s.detailBlock}>
              <div style={s.detailTitle}>💬 Примечание</div>
              <div style={s.notesText}>{scheme.notes}</div>
            </div>
          )}
        </div>
      )}
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
      @keyframes float{0%,100%{transform:rotate(-15deg) translateY(0px)}50%{transform:rotate(-15deg) translateY(-8px)}}
    `}</style>
  );
}

/* ---------- Styles ---------- */
const GRAD = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

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

  backBtn: {
    marginTop: 12,
    padding: "8px 16px",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    backdropFilter: "blur(6px)",
    transition: "all 0.2s ease",
  },

  schemeCard: {
    position: "relative",
    padding: 0,
    borderRadius: 24,
    background: "linear-gradient(135deg, #a8b5ff 0%, #c5b3ff 50%, #d4a5ff 100%)",
    border: "none",
    boxShadow: "0 8px 32px rgba(168, 181, 255, 0.3)",
    overflow: "hidden",
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  schemeCardSelected: {
    background: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #ffdab9 100%)",
    boxShadow: "0 12px 48px rgba(255, 154, 158, 0.4)",
    transform: "translateY(-4px) scale(1.02)",
  },


  recommendedBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "rgba(255,255,255,0.95)",
    color: "#1b1b1b",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: 11,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 4,
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
    backdropFilter: "blur(10px)",
    zIndex: 2,
  },
  recommendedText: {
    letterSpacing: 0.3,
  },

  radioCircle: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "3px solid rgba(255,255,255,0.9)",
    background: "rgba(255,255,255,0.3)",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    backdropFilter: "blur(4px)",
    zIndex: 2,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },

  cardLayout: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "20px 16px 16px 56px",
    minHeight: 180,
    position: "relative",
  },

  cardContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingRight: 12,
  },

  schemeName: {
    fontSize: 19,
    fontWeight: 900,
    color: "#1b1b1b",
    lineHeight: 1.2,
    textShadow: "0 1px 2px rgba(255,255,255,0.5)",
  },

  schemeInfo: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  infoChip: {
    background: "rgba(255,255,255,0.85)",
    padding: "6px 12px",
    borderRadius: 16,
    fontSize: 11,
    fontWeight: 700,
    color: "#1b1b1b",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    backdropFilter: "blur(4px)",
    whiteSpace: "nowrap",
  },

  schemeDescription: {
    fontSize: 13,
    color: "rgba(0,0,0,0.75)",
    lineHeight: 1.5,
    fontWeight: 500,
  },

  robotContainer: {
    position: "absolute",
    right: -10,
    bottom: -10,
    width: 140,
    height: 140,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },

  robotImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.2))",
    transform: "rotate(-15deg)",
    animation: "float 3s ease-in-out infinite",
  },

  reasonTextExpanded: {
    fontSize: 12.5,
    color: "#1b1b1b",
    lineHeight: 1.5,
    fontWeight: 500,
  },

  expandBtn: {
    width: "calc(100% - 32px)",
    margin: "8px 16px 16px",
    padding: "10px 16px",
    border: "none",
    borderRadius: 16,
    background: "rgba(255,255,255,0.85)",
    color: "#1b1b1b",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    backdropFilter: "blur(4px)",
    transition: "all 0.2s ease",
  },

  detailsSection: {
    margin: "0 16px 16px",
    padding: 16,
    background: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    display: "grid",
    gap: 14,
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
    color: "#000",
    background: GRAD,
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
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
};
