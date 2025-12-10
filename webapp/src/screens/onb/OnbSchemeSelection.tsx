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
  const displayName = (scheme as any).russianName || scheme.name;

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

      {/* Контейнер с изображением и контентом */}
      <div style={s.cardContent}>
        {/* Изображение робота */}
        <div style={s.robotImgContainer}>
          <img src={robotImg} alt="robot" style={s.robotImg} />
        </div>

        {/* Основная информация */}
        <div style={s.mainInfo}>
          {/* Название */}
          <div style={s.schemeName}>{displayName}</div>
          
          {/* Краткая инфо */}
          <div style={s.schemeInfo}>
            <span style={s.infoChip}>📅 {scheme.daysPerWeek} дн/нед</span>
            <span style={s.infoChip}>⏱️ {scheme.minMinutes}-{scheme.maxMinutes} мин</span>
            <span style={s.infoChip}>
              {scheme.intensity === "low" ? "🟢 Лёгкая" : 
               scheme.intensity === "moderate" ? "🟡 Средняя" : 
               "🔴 Высокая"}
            </span>
          </div>

          {/* Причина рекомендации */}
          {scheme.reason && (
            <div style={s.schemeReason}>
              <div style={s.reasonIcon}>💡</div>
              <div style={s.reasonText}>{scheme.reason}</div>
            </div>
          )}
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
          {/* Описание */}
          <div style={s.detailBlock}>
            <div style={s.detailTitle}>📝 Описание</div>
            <div style={s.schemeDescription}>{scheme.description}</div>
          </div>

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
    padding: 14,
    borderRadius: 20,
    background: "rgba(255,255,255,0.75)",
    border: "2px solid rgba(0,0,0,0.08)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
    backdropFilter: "blur(12px)",
    cursor: "pointer",
    transition: "all 0.25s ease",
  },
  schemeCardSelected: {
    background: GRAD,
    border: "2px solid rgba(0,0,0,0.18)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    transform: "scale(1.02)",
  },

  cardContent: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },

  robotImgContainer: {
    flexShrink: 0,
    width: 64,
    height: 64,
    borderRadius: 16,
    background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(240,240,255,0.9))",
    border: "1.5px solid rgba(0,0,0,0.06)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },

  robotImg: {
    width: "85%",
    height: "85%",
    objectFit: "contain",
  },

  mainInfo: {
    flex: 1,
    marginTop: 4,
  },

  recommendedBadge: {
    position: "absolute",
    top: -1,
    right: -1,
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#1b1b1b",
    padding: "6px 12px",
    borderRadius: "0 16px 0 12px",
    fontSize: 11,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 4,
    boxShadow: "0 2px 8px rgba(251, 191, 36, 0.4)",
  },
  recommendedText: {
    letterSpacing: 0.3,
  },

  radioCircle: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "2px solid rgba(0,0,0,0.3)",
    background: "rgba(255,255,255,0.8)",
    display: "grid",
    placeItems: "center",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#0f172a",
  },

  schemeName: {
    fontSize: 17,
    fontWeight: 800,
    color: "#0B1220",
    marginBottom: 8,
    lineHeight: 1.3,
  },

  schemeInfo: {
    display: "flex",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  infoChip: {
    background: "rgba(255,255,255,0.95)",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    color: "#0B1220",
    border: "1px solid rgba(0,0,0,0.08)",
    whiteSpace: "nowrap",
  },

  schemeReason: {
    display: "flex",
    gap: 10,
    padding: 12,
    background: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.06)",
    marginBottom: 10,
  },
  reasonIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  reasonText: {
    fontSize: 12.5,
    color: "#1b1b1b",
    lineHeight: 1.4,
    fontWeight: 600,
  },

  expandBtn: {
    width: "100%",
    padding: "8px 12px",
    border: "none",
    borderRadius: 10,
    background: "rgba(255,255,255,0.6)",
    color: "#0B1220",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 6,
  },

  detailsSection: {
    marginTop: 12,
    padding: 12,
    background: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.06)",
    display: "grid",
    gap: 12,
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
  schemeDescription: {
    fontSize: 12.5,
    color: "#1b1b1b",
    lineHeight: 1.5,
    fontWeight: 500,
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
