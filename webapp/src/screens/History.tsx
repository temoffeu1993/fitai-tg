import { useEffect, useMemo, useState } from "react";

const HISTORY_KEY = "history_sessions_v1";

type SetEntry = { reps?: number; weight?: number };

type ExerciseEntry = {
  name: string;
  sets?: SetEntry[];
  reps?: string | number;
  weight?: string | number;
  targetMuscles?: string[];
};

type RecordItem = {
  id: string;
  finishedAt: string; // ISO
  title: string;
  location?: string;
  durationMin?: number;

  // старый формат
  items?: ExerciseEntry[];

  // новый формат
  exercises?: ExerciseEntry[];
};

export default function History() {
  const [list, setList] = useState<RecordItem[]>([]);
  // локально храним, какие дни раскрыты
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      const arr: RecordItem[] = Array.isArray(raw) ? raw : [];
      arr.sort(
        (a, b) =>
          new Date(b.finishedAt).getTime() -
          new Date(a.finishedAt).getTime()
      );
      setList(arr);

      // по умолчанию все свернуты
      const collapsedState: Record<string, boolean> = {};
      arr.forEach((rec) => {
        collapsedState[rec.id] = false;
      });
      setOpenIds(collapsedState);
    } catch {
      setList([]);
    }
  }, []);

  // сводка по истории для верхнего блока
  const summary = useMemo(() => {
    if (!list.length) {
      return {
        total: 0,
        totalMin: 0,
        avgMin: 0,
      };
    }
    const total = list.length;
    const mins = list.reduce(
      (acc, rec) => acc + (Number(rec.durationMin) || 0),
      0
    );
    const avg = mins && total ? Math.round(mins / total) : 0;
    return {
      total,
      totalMin: mins,
      avgMin: avg,
    };
  }, [list]);

  if (!list.length) {
    return (
      <div style={styles.page}>
        <section style={styles.heroCard}>
          <div style={styles.heroTopRow}>
            <span style={styles.pillDark}>История</span>
            {/* счётчик справа удалён */}
          </div>
          <div style={styles.heroTitle}>Твоя нагрузка</div>
          <div style={styles.heroSubtitle}>
            Учитываем длительность, объём и группы мышц на каждой тренировке
          </div>
        </section>

        {/* чипы под героем */}
        <section style={{ ...styles.block, ...styles.statsSection }}>
          <div style={styles.statsRow}>
            <ChipStat icon="🔥" label="Всего минут" value="—" />
            <ChipStat icon="🕒" label="Средняя тренировка" value="—" />
            <ChipStat icon="🏋️" label="Всего тренировок" value="0" />
          </div>
        </section>

        {/* пустой экран */}
        <section style={styles.emptyCardGlass}>
          <div style={styles.emptyHeadRow}>
            <span style={styles.pillLight}>История</span>
            <span style={styles.pillLight}>0 тренировок</span>
          </div>

          <div style={styles.emptyTitle}>Тут будет твой прогресс</div>
          <div style={styles.emptyText}>
            После каждой завершённой сессии мы фиксируем дату, объём и ключевые упражнения. Это поможет отслеживать динамику и не терять прогресс.
          </div>

          <div style={styles.emptyFooterText}>
            Выполни первую тренировку чтобы открыть историю.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* чёрный hero */}
      <section style={styles.heroCard}>
        <div style={styles.heroTopRow}>
          <span style={styles.pillDark}>История</span>
          {/* счётчик справа удалён */}
        </div>

        <div style={styles.heroTitle}>Твоя нагрузка</div>
        <div style={styles.heroSubtitle}>
          Учитываем длительность, объём и группы мышц на каждой тренировке
        </div>
      </section>

      {/* чипы под героем */}
      <section style={{ ...styles.block, ...styles.statsSection }}>
        <div style={styles.statsRow}>
          <ChipStat icon="🔥" label="Всего минут" value={`${summary.totalMin || "—"}`} />
          <ChipStat icon="🕒" label="Средняя тренировка" value={summary.avgMin ? `${summary.avgMin} мин` : "—"} />
          <ChipStat icon="🏋️" label="Всего тренировок" value={`${summary.total}`} />
        </div>
      </section>

      {/* список тренировок */}
      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        {list.map((rec) => {
          const dateObj = new Date(rec.finishedAt);
          const dateStr = isNaN(dateObj.getTime())
            ? "дата неизвестна"
            : dateObj.toLocaleDateString("ru-RU", {
                weekday: "short",
                day: "numeric",
                month: "long",
              });

          // упражнения: старый формат items или новый exercises
          const exList: ExerciseEntry[] = Array.isArray(rec.items)
            ? rec.items
            : Array.isArray(rec.exercises)
            ? rec.exercises
            : [];

          // сетов суммарно
          const totalSets = exList.reduce((acc, it) => {
            if (!Array.isArray(it.sets)) return acc;
            return acc + it.sets.length;
          }, 0);

          // извлечь топ мышц
          const muscleCount: Record<string, number> = {};
          exList.forEach((ex) => {
            (ex.targetMuscles || []).forEach((m) => {
              const key = m.toLowerCase();
              muscleCount[key] = (muscleCount[key] || 0) + 1;
            });
          });
          const muscleTags = Object.entries(muscleCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([m]) => m);

          const isOpen = !!openIds[rec.id];

          return (
            <section
              key={rec.id}
              style={styles.sessionCard}
            >
              {/* кликаемая шапка карточки */}
              <button
                style={styles.sessionHeadBtn}
                onClick={() =>
                  setOpenIds((prev) => ({
                    ...prev,
                    [rec.id]: !prev[rec.id],
                  }))
                }
              >
                <div style={styles.sessionHeadGrid}>
                  {/* левая часть */}
                  <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <div style={styles.sessionTitleRow}>
                      <div style={styles.sessionTitleText}>
                        {rec.title || "Тренировка"}
                      </div>

                      {/* caret */}
                      <div
                        style={{
                          ...styles.caretWrap,
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      >
                        <div style={styles.caretInner} />
                      </div>
                    </div>

                    <div style={styles.sessionMetaLine}>
                      <span>{dateStr}</span>
                      <span style={styles.dotSep}>·</span>
                      <span>{rec.durationMin ?? "—"} мин</span>
                      <span style={styles.dotSep}>·</span>
                      <span>сетов {totalSets}</span>
                    </div>

                    {/* мышцы дня */}
                    {muscleTags.length > 0 && (
                      <div style={styles.muscleRow}>
                        {muscleTags.map((m, idx) => (
                          <span key={idx} style={styles.muscleChip}>
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* раскрывашка: ОДНА КОЛОНКА упражнений */}
              {isOpen && (
                <div style={styles.detailWrap}>
                  <div style={styles.detailGrid1col}>
                    {exList.map((it, idx) => {
                      const setCount = Array.isArray(it.sets)
                        ? it.sets.length
                        : 0;

                      // reps summary
                      let repsStr: string | number | undefined = it.reps;
                      if (
                        (repsStr === undefined || repsStr === null) &&
                        Array.isArray(it.sets) &&
                        it.sets[0]?.reps != null
                      ) {
                        repsStr = it.sets[0].reps!;
                      }

                      return (
                        <div key={idx} style={styles.detailExerciseBlock}>
                          {/* шапка упражнения */}
                          <div style={styles.detailExerciseHeadCompact}>
                            <div style={styles.detailExerciseName}>
                              {it.name || "упражнение"}
                            </div>

                            <div style={styles.detailExerciseVolCompact}>
                              {setCount
                                ? `${setCount}×${repsStr ?? "?"}`
                                : "—"}
                            </div>
                          </div>

                          {/* сеты и веса */}
                          {Array.isArray(it.sets) && it.sets.length > 0 && (
                            <div style={styles.setTableCompact}>
                              {it.sets.map((set, si) => (
                                <div key={si} style={styles.setRowCompact}>
                                  <div style={styles.setCellLeftCompact}>
                                    {si + 1}
                                  </div>
                                  <div style={styles.setCellMidCompact}>
                                    Повт{" "}
                                    <span style={styles.setVal}>
                                      {set.reps != null ? set.reps : "—"}
                                    </span>
                                  </div>
                                  <div style={styles.setCellRightCompact}>
                                    Вес{" "}
                                    <span style={styles.setVal}>
                                      {set.weight != null
                                        ? set.weight + "кг"
                                        : "соб. вес"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

/* ============== мини-компоненты ============== */

function BigStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={styles.bigStat}>
      <div style={styles.bigStatIcon}>{icon}</div>
      <div style={styles.bigStatLabel}>{label}</div>
      <div style={styles.bigStatValue}>{value}</div>
    </div>
  );
}

function SmallStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={styles.smallStat}>
      <div style={styles.smallStatIcon}>{icon}</div>
      <div style={styles.smallStatMain}>
        <div style={styles.smallStatLabel}>{label}</div>
        <div style={styles.smallStatValue}>{value}</div>
      </div>
    </div>
  );
}

function ChipStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statEmoji}>{icon}</div>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

/* ============== стили ============== */

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const innerShadow = "inset 0 0 0 1px rgba(0,0,0,.04)";

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, 'Inter', 'Roboto', Segoe UI",
    background:
      "transparent",
    minHeight: "100vh",
  },

  block: { marginTop: 16 },

  /* --- HERO как на «Расписание» --- */
  heroCard: {
    position: "relative",
    padding: 22,
    borderRadius: 28,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
  },
  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillDark: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
  },
  heroTitle: { fontSize: 26, fontWeight: 800, marginTop: 6, color: "#fff" },
  heroSubtitle: { opacity: 0.9, marginTop: 4, color: "rgba(255,255,255,.85)" },

  /* --- «чипы» под героем --- */
  statsSection: { marginTop: 12, padding: 0, background: "transparent", boxShadow: "none" },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 12,
  },
  stat: {
    background: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    padding: "10px 8px",
    minHeight: 96,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    gap: 4,
  },
  statEmoji: { fontSize: 20, color: "#111" },
  statLabel: { fontSize: 11, color: "rgba(0,0,0,.75)", letterSpacing: 0.2 },
  statValue: { fontWeight: 800, fontSize: 18, color: "#111" },

  /* --- пустой экран стеклянный --- */
  emptyCardGlass: {
    borderRadius: 20,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(255,255,255,.35)",
    backdropFilter: "blur(14px)",
    color: "#111",
    boxShadow: cardShadow,
    padding: 16,
    marginTop: 16,
  },
  emptyHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
  },
  pillLight: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    backdropFilter: "blur(6px)",
    color: "#111",
    border: "1px solid rgba(0,0,0,.06)",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 1.4,
    opacity: 0.9,
    marginTop: 6,
  },
  emptyFooterText: {
    marginTop: 12,
    fontSize: 13,
    opacity: 0.9,
  },

  /* --- верхний summary-блок (оставлен для совместимости компонентов) --- */
  headerCard: {
    borderRadius: 20,
    background:
      "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    boxShadow: cardShadow,
    padding: 16,
  },
  headerTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginTop: 8,
  },
  headerSubtitle: {
    opacity: 0.92,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 1.3,
  },
  headerStatsRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 8,
  },
  bigStat: {
    background: "rgba(255,255,255,.15)",
    borderRadius: 12,
    padding: 10,
    textAlign: "center",
    backdropFilter: "blur(6px)",
    fontWeight: 600,
  },
  bigStatIcon: { fontSize: 18, lineHeight: 1, marginBottom: 2 },
  bigStatLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,.85)",
    lineHeight: 1.2,
  },
  bigStatValue: {
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.2,
    color: "#fff",
  },

  /* --- карточка тренировки: стекло как «Питание сегодня» --- */
  sessionCard: {
    borderRadius: 18,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(255,255,255,.35)",
    backdropFilter: "blur(14px)",
    boxShadow: "0 4px 10px rgba(0,0,0,.12)",
    overflow: "hidden",
  },

  sessionHeadBtn: {
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "rgba(255,255,255,0.75)",        // было: градиент
  backdropFilter: "blur(14px)",                 // добавлено
  borderBottom: "1px solid rgba(0,0,0,.06)",
  borderTopLeftRadius: 18,                      // чтобы визуально совпадало с карточкой
  borderTopRightRadius: 18,                     // чтобы визуально совпадало с карточкой
  display: "block",
  padding: 12,
  cursor: "pointer",
},

  sessionHeadGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "center",
    gap: 6,
  },

  sessionTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sessionTitleText: {
    fontSize: 15,
    fontWeight: 750,
    color: "#1b1b1b",
    lineHeight: 1.2,
  },

  caretWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    background: "rgba(139,92,246,.12)",
    boxShadow: innerShadow,
    display: "grid",
    placeItems: "center",
    transition: "transform 0.18s ease",
  },
  caretInner: {
    width: 0,
    height: 0,
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderTop: "6px solid #4a3a7a",
  },

  sessionMetaLine: {
    fontSize: 12,
    color: "#2b2b2b",
    opacity: 0.8,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  dotSep: {
    opacity: 0.5,
  },

  muscleRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  muscleChip: {
  fontSize: 11,
  lineHeight: 1.2,
  color: "#111",                                // было: #222
  background: "rgba(255,255,255,0.6)",          // было: rgba(139,92,246,.14)
  border: "1px solid rgba(0,0,0,0.08)",         // добавлено
  backdropFilter: "blur(8px)",                  // добавлено
  borderRadius: 10,
  padding: "4px 8px",
  fontWeight: 400,
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",      // было: innerShadow
  textTransform: "capitalize",
},

  // раскрытый блок
  detailWrap: {
    padding: "10px 12px 12px 12px",
    background: "rgba(255,255,255,0.85)",
    display: "grid",
  },

  // ОДНА колонка упражнений
  detailGrid1col: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
    minWidth: 0,
  },

  detailExerciseBlock: {
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
    border: "1px solid rgba(0,0,0,.06)",
    padding: 10,
    display: "grid",
    gap: 8,
    minWidth: 0,
  },

  // компактная шапка упражнения: название + "3×10-12"
  detailExerciseHeadCompact: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    minWidth: 0,
  },
  detailExerciseName: {
    fontWeight: 700,
    fontSize: 13.5,
    color: "#111",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailExerciseVolCompact: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#444",
    fontFeatureSettings: "'tnum' 1, 'lnum' 1",
    whiteSpace: "nowrap",
  },

  // таблица сетов компактная: каждая строка = "# / Повт / Вес"
  setTableCompact: {
    display: "grid",
    gap: 6,
    fontSize: 12.5,
    color: "#222",
    minWidth: 0,
  },

  setRowCompact: {
    background: "rgba(255,255,255,.9)",
    borderRadius: 10,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
    padding: "6px 8px",
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    lineHeight: 1.3,
    columnGap: 10,
    minWidth: 0,
  },

  setCellLeftCompact: {
    fontWeight: 600,
    color: "#111",
    minWidth: 24,
    textAlign: "center",
    fontSize: 12,
  },
  setCellMidCompact: {
    fontWeight: 500,
    color: "#444",
    fontFeatureSettings: "'tnum' 1, 'lnum' 1",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  setCellRightCompact: {
    fontWeight: 500,
    color: "#444",
    fontFeatureSettings: "'tnum' 1, 'lnum' 1",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },

  setVal: {
    fontWeight: 700,
    color: "#000",
  },

  /* small stat для пустого экрана */
  smallStat: {
    background: "rgba(255,255,255,.15)",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    backdropFilter: "blur(6px)",
    fontWeight: 600,
    color: "#fff",
  },
  smallStatIcon: {
    fontSize: 18,
    lineHeight: 1,
  },
  smallStatMain: {
    display: "grid",
    gap: 2,
  },
  smallStatLabel: {
    fontSize: 12,
    opacity: 0.85,
  },
  smallStatValue: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.2,
  },
};
