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
        <section style={styles.emptyCard}>
          <div style={styles.emptyHeadRow}>
            <span style={styles.pillLight}>История</span>
            <span style={styles.pillLight}>0 тренировок</span>
          </div>

          <div style={styles.emptyTitle}>Тут будет твой прогресс</div>
          <div style={styles.emptyText}>
            После каждой завершённой сессии мы фиксируем дату, объём и ключевые упражнения. Это поможет отслеживать динамику и не терять прогресс.
          </div>

          <div style={styles.emptyHintRow}>
            <SmallStat icon="🕒" label="Продолжительность" value="—" />
            <SmallStat icon="🏋️" label="Сеты" value="—" />
            <SmallStat icon="🔥" label="Минут всего" value="—" />
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
      {/* шапка-резюме истории */}
      <section style={styles.headerCard}>
        <div style={styles.headerTopRow}>
          <span style={styles.pillLight}>История</span>
          <span style={styles.pillLight}>{summary.total} тренировок</span>
        </div>

        <div style={styles.headerTitle}>Твоя нагрузка</div>
        <div style={styles.headerSubtitle}>
          Мы учитываем длительность, объем и группы мышц на каждой тренировке
        </div>

        <div style={styles.headerStatsRow}>
          <BigStat icon="🔥" label="Всего минут" value={`${summary.totalMin || "—"}`} />
          <BigStat icon="🕒" label="Средняя тренировка" value={summary.avgMin ? `${summary.avgMin} мин` : "—"} />
          <BigStat icon="🏋️" label="Всего тренировок" value={`${summary.total}`} />
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

              {/* раскрывашка (2 колонки упражнений) */}
              {isOpen && (
                <div style={styles.detailWrap}>
                  <div style={styles.detailGrid2col}>
                    {exList.map((it, idx) => {
                      const setCount = Array.isArray(it.sets)
                        ? it.sets.length
                        : 0;

                      // reps summary. если есть reps прямо на упражнении, берём его
                      // иначе берём reps из первого сета
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

/* ============== мини-компоненты для хедера ============== */

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

/* ============== стили ============== */

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const innerShadow = "inset 0 0 0 1px rgba(0,0,0,.04)";

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, 'Inter', 'Roboto', Segoe UI",
    background: "transparent",
  },

  /* пустой экран */
  emptyCard: {
    borderRadius: 20,
    background:
      "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    boxShadow: cardShadow,
    padding: 16,
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
    color: "#fff",
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
  emptyHintRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 8,
  },
  emptyFooterText: {
    marginTop: 12,
    fontSize: 13,
    opacity: 0.9,
  },

  /* верхний summary блок */
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

  /* карточка тренировки */
  sessionCard: {
    borderRadius: 18,
    background: "#fff",
    boxShadow: cardShadow,
    overflow: "hidden",
  },

  sessionHeadBtn: {
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
    display: "block",
    padding: 12,
    cursor: "pointer",
    borderBottom: "1px solid rgba(0,0,0,.06)",
  } as React.CSSProperties,

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
    color: "#222",
    background: "rgba(139,92,246,.14)",
    borderRadius: 10,
    padding: "4px 8px",
    fontWeight: 600,
    boxShadow: innerShadow,
    textTransform: "capitalize",
  },

  // раскрытый блок
  detailWrap: {
    padding: "10px 12px 12px 12px",
    background: "#fff",
    display: "grid",
  },

  // новая сетка 2 колонки для упражнений
  detailGrid2col: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0,1fr))",
    gap: 12,
  },

  detailExerciseBlock: {
    background: "#f6f7fb",
    borderRadius: 12,
    boxShadow: innerShadow,
    padding: 10,
    display: "grid",
    gap: 8,
  },

  // компактная шапка упражнения: название + "3×10-12"
  detailExerciseHeadCompact: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  detailExerciseName: {
    fontWeight: 700,
    fontSize: 13.5,
    color: "#111",
    lineHeight: 1.2,
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
  },

  setRowCompact: {
    background: "#fff",
    borderRadius: 10,
    boxShadow: innerShadow,
    padding: "6px 8px",
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    lineHeight: 1.3,
    columnGap: 10,
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
