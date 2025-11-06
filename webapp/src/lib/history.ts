// webapp/src/lib/history.ts
const HISTORY_KEY = "history_sessions_v1";

export type HistSet = { reps?: number; weight?: number };
export type HistItem = { name: string; pattern?: string; sets: HistSet[] };
export type HistSession = {
  id: string; finishedAt: string; title: string; location?: string;
  durationMin?: number; items: HistItem[];
};

export function loadHistory(): HistSession[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

export function buildHistoryFeatures(history: HistSession[]) {
  // агрегаты по упражнениям
  const byName: Record<string, {
    sessions: number;
    lastDate?: string;
    last: { reps?: number; weight?: number } | null;
    bestWeight?: number;
    totalVolume?: number; // сумма weight*reps
  }> = {};

  for (const s of history) {
    for (const it of s.items || []) {
      const key = it.name.trim().toLowerCase();
      byName[key] ||= { sessions: 0, last: null, totalVolume: 0 };
      byName[key].sessions++;
      byName[key].lastDate = s.finishedAt;

      // последний сет с данными
      const lastSet = [...(it.sets||[])].reverse().find(x => x.reps || x.weight) || null;
      if (lastSet) byName[key].last = { reps: lastSet.reps, weight: lastSet.weight };

      // метрики прогрессии
      for (const st of it.sets || []) {
        const w = Number(st.weight||0), r = Number(st.reps||0);
        if (w > 0) byName[key].bestWeight = Math.max(byName[key].bestWeight || 0, w);
        if (w > 0 && r > 0) byName[key].totalVolume = (byName[key].totalVolume || 0) + w*r;
      }
    }
  }

  // частота за последние 14 дней
  const cutoff = Date.now() - 14*24*3600*1000;
  const recentlyDone: string[] = [];
  for (const s of history) {
    const t = Date.parse(s.finishedAt || "");
    if (Number.isFinite(t) && t >= cutoff) {
      for (const it of s.items||[]) {
        const key = it.name.trim().toLowerCase();
        if (!recentlyDone.includes(key)) recentlyDone.push(key);
      }
    }
  }

  return {
    byExercise: byName,
    recentlyDone,
    sessionsCount: history.length,
    lastSessionAt: history[0]?.finishedAt,
  };
}
