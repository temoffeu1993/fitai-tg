import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Exercise = {
  name: string;
  sets: number;
  reps?: number | string | [number, number];
  restSec?: number;
  cues?: string;
  targetMuscles?: string[];
  equipment?: string[];
  difficulty?: number;
  technique?: {
    setup: string;
    execution: string;
    commonMistakes: string[];
  };
};

type Plan = {
  dayLabel: string;
  focus: string;
  warmup?: string[];
  exercises: Exercise[];
  cooldown?: string[];
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
};

export default function WorkoutPlanNew({ plan }: { plan: Plan }) {
  const nav = useNavigate();
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [cooldownOpen, setCooldownOpen] = useState(false);
  const [selectedEx, setSelectedEx] = useState<number | null>(null);

  const formatReps = (r?: number | string | [number, number]) => {
    if (!r) return "—";
    if (Array.isArray(r)) return r.join("-");
    return String(r);
  };

  const formatTime = (sec?: number) => {
    if (!sec) return "—";
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${min}:${s.toString().padStart(2, "0")}` : `${min}:00`;
  };

  const muscleNameRU = (m: string) => {
    const map: Record<string, string> = {
      quads: "Квадрицепсы", glutes: "Ягодицы", hamstrings: "Бицепс бедра",
      chest: "Грудь", lats: "Широчайшие", upper_back: "Верх спины",
      front_delts: "Передние дельты", side_delts: "Средние дельты",
      rear_delts: "Задние дельты", triceps: "Трицепс", biceps: "Бицепс",
      core: "Кор", calves: "Икры",
    };
    return map[m] || m;
  };

  return (
    <div style={s.page}>
      {/* HEADER */}
      <section style={s.header}>
        <div style={s.headerTop}>
          <h1 style={s.headerTitle}>{plan.dayLabel}</h1>
          <span style={s.headerDate}>
            {new Date().toLocaleDateString("ru", { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </div>
        <p style={s.headerFocus}>{plan.focus}</p>
      </section>

      {/* QUICK STATS */}
      <section style={s.stats}>
        <div style={s.statChip}>
          <span style={s.statIcon}>💪</span>
          <span style={s.statText}>{plan.totalExercises} упр</span>
        </div>
        <div style={s.statChip}>
          <span style={s.statIcon}>🔥</span>
          <span style={s.statText}>{plan.totalSets} сетов</span>
        </div>
        <div style={s.statChip}>
          <span style={s.statIcon}>⏱️</span>
          <span style={s.statText}>~{plan.estimatedDuration} мин</span>
        </div>
      </section>

      {/* PRIMARY ACTION */}
      <button
        style={s.primaryBtn}
        onClick={() => {
          localStorage.setItem("current_plan", JSON.stringify(plan));
          nav("/workout/session", { state: { plan } });
        }}
      >
        <span style={{ fontSize: 20 }}>🚀</span>
        <span>Начать тренировку</span>
      </button>

      {/* РАЗМИНКА */}
      {plan.warmup && plan.warmup.length > 0 && (
        <section style={s.section}>
          <button style={s.sectionHeader} onClick={() => setWarmupOpen(!warmupOpen)}>
            <div style={s.sectionLeft}>
              <span style={s.sectionIcon}>🔥</span>
              <span style={s.sectionTitle}>Разминка</span>
              <span style={s.sectionSubtitle}>5 мин</span>
            </div>
            <span style={s.caret}>{warmupOpen ? "▲" : "▼"}</span>
          </button>
          {warmupOpen && (
            <div style={s.sectionContent}>
              {plan.warmup.map((item, i) => (
                <div key={i} style={s.listItem}>
                  <span style={s.listBullet}>•</span>
                  <span style={s.listText}>{item}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ОСНОВНАЯ ЧАСТЬ */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <div style={s.sectionLeft}>
            <span style={s.sectionIcon}>💪</span>
            <span style={s.sectionTitle}>Основная часть</span>
            <span style={s.sectionSubtitle}>{plan.totalExercises} упражнений</span>
          </div>
        </div>
        <div style={s.exercisesList}>
          {plan.exercises.map((ex, i) => (
            <div
              key={i}
              style={s.exCard}
              onClick={() => setSelectedEx(i)}
            >
              <div style={s.exNumber}>{i + 1}</div>
              <div style={s.exMain}>
                <div style={s.exName}>{ex.name}</div>
                <div style={s.exMeta}>
                  <span style={s.exMetaItem}>
                    {ex.sets}×{formatReps(ex.reps)}
                  </span>
                  <span style={s.exMetaDot}>•</span>
                  <span style={s.exMetaItem}>{formatTime(ex.restSec)}</span>
                </div>
                {ex.targetMuscles && ex.targetMuscles.length > 0 && (
                  <div style={s.exMuscles}>
                    🎯 {ex.targetMuscles.slice(0, 2).map(muscleNameRU).join(", ")}
                  </div>
                )}
              </div>
              {ex.technique && (
                <button
                  style={s.exTechBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEx(i);
                  }}
                >
                  👁️
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ЗАМИНКА */}
      {plan.cooldown && plan.cooldown.length > 0 && (
        <section style={s.section}>
          <button style={s.sectionHeader} onClick={() => setCooldownOpen(!cooldownOpen)}>
            <div style={s.sectionLeft}>
              <span style={s.sectionIcon}>🧘</span>
              <span style={s.sectionTitle}>Заминка</span>
              <span style={s.sectionSubtitle}>5 мин</span>
            </div>
            <span style={s.caret}>{cooldownOpen ? "▲" : "▼"}</span>
          </button>
          {cooldownOpen && (
            <div style={s.sectionContent}>
              {plan.cooldown.map((item, i) => (
                <div key={i} style={s.listItem}>
                  <span style={s.listBullet}>•</span>
                  <span style={s.listText}>{item}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECONDARY ACTIONS */}
      <section style={s.actions}>
        <button style={s.secondaryBtn} onClick={() => window.location.reload()}>
          🔄 Другая программа
        </button>
        <button style={s.secondaryBtn} onClick={() => alert("Запланировать")}>
          📅 На потом
        </button>
      </section>

      {/* MODAL: Техника упражнения */}
      {selectedEx !== null && plan.exercises[selectedEx]?.technique && (
        <div style={s.modal} onClick={() => setSelectedEx(null)}>
          <div style={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <button style={s.modalClose} onClick={() => setSelectedEx(null)}>
              ✕
            </button>
            <h3 style={s.modalTitle}>{plan.exercises[selectedEx].name}</h3>
            
            {plan.exercises[selectedEx].technique?.setup && (
              <div style={s.techBlock}>
                <div style={s.techTitle}>🔧 Подготовка</div>
                <p style={s.techText}>{plan.exercises[selectedEx].technique!.setup}</p>
              </div>
            )}
            
            {plan.exercises[selectedEx].technique?.execution && (
              <div style={s.techBlock}>
                <div style={s.techTitle}>💪 Выполнение</div>
                <p style={s.techText}>{plan.exercises[selectedEx].technique!.execution}</p>
              </div>
            )}
            
            {plan.exercises[selectedEx].technique?.commonMistakes && 
             plan.exercises[selectedEx].technique!.commonMistakes.length > 0 && (
              <div style={s.techBlock}>
                <div style={s.techTitle}>⚠️ Частые ошибки</div>
                <ul style={s.techList}>
                  {plan.exercises[selectedEx].technique!.commonMistakes.map((m, i) => (
                    <li key={i} style={s.techListItem}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "16px 16px 80px",
  },

  // HEADER
  header: {
    marginBottom: 16,
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 900,
    color: "#fff",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  headerDate: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(255,255,255,0.8)",
    background: "rgba(255,255,255,0.15)",
    padding: "6px 12px",
    borderRadius: 20,
    backdropFilter: "blur(10px)",
  },
  headerFocus: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    margin: 0,
    lineHeight: 1.5,
  },

  // STATS
  stats: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  statChip: {
    flex: 1,
    background: "rgba(255,255,255,0.2)",
    backdropFilter: "blur(10px)",
    borderRadius: 12,
    padding: "12px 8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  statIcon: {
    fontSize: 20,
  },
  statText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
  },

  // PRIMARY BUTTON
  primaryBtn: {
    width: "100%",
    padding: "18px",
    background: "#fff",
    color: "#667eea",
    border: "none",
    borderRadius: 16,
    fontSize: 17,
    fontWeight: 800,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
    transition: "transform 0.2s",
  },

  // SECTION
  section: {
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    width: "100%",
    padding: "16px",
    background: "none",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
  },
  sectionLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  sectionIcon: {
    fontSize: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#1a1a1a",
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#999",
  },
  caret: {
    fontSize: 12,
    color: "#999",
  },
  sectionContent: {
    padding: "0 16px 16px",
  },

  // LIST ITEMS
  listItem: {
    display: "flex",
    gap: 12,
    padding: "10px 0",
    borderTop: "1px solid rgba(0,0,0,0.05)",
  },
  listBullet: {
    fontSize: 16,
    color: "#667eea",
    fontWeight: 700,
  },
  listText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 1.5,
  },

  // EXERCISES
  exercisesList: {
    padding: "0 16px 16px",
    display: "grid",
    gap: 8,
  },
  exCard: {
    display: "flex",
    gap: 12,
    padding: "12px",
    background: "rgba(0,0,0,0.02)",
    borderRadius: 12,
    cursor: "pointer",
    transition: "all 0.2s",
    alignItems: "flex-start",
  },
  exNumber: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#667eea",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 13,
    fontWeight: 800,
    flexShrink: 0,
  },
  exMain: {
    flex: 1,
    minWidth: 0,
  },
  exName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1a1a1a",
    marginBottom: 4,
  },
  exMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  exMetaItem: {
    fontSize: 13,
    fontWeight: 600,
    color: "#667eea",
  },
  exMetaDot: {
    fontSize: 8,
    color: "#ccc",
  },
  exMuscles: {
    fontSize: 12,
    color: "#666",
  },
  exTechBtn: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(102,126,234,0.1)",
    border: "none",
    fontSize: 16,
    cursor: "pointer",
    flexShrink: 0,
  },

  // SECONDARY ACTIONS
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  secondaryBtn: {
    padding: "14px",
    background: "rgba(255,255,255,0.2)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 12,
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },

  // MODAL
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    zIndex: 10000,
  },
  modalContent: {
    background: "#fff",
    borderRadius: 20,
    padding: 24,
    maxWidth: 500,
    maxHeight: "80vh",
    overflow: "auto",
    position: "relative",
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.05)",
    border: "none",
    fontSize: 16,
    cursor: "pointer",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#1a1a1a",
    marginTop: 0,
    marginBottom: 20,
    paddingRight: 40,
  },
  techBlock: {
    marginBottom: 20,
  },
  techTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#667eea",
    marginBottom: 8,
  },
  techText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 1.6,
    margin: 0,
  },
  techList: {
    margin: 0,
    paddingLeft: 20,
  },
  techListItem: {
    fontSize: 14,
    color: "#333",
    lineHeight: 1.6,
    marginBottom: 6,
  },
};
