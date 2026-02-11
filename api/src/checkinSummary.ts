import {
  estimateTotalMinutesFromStoredPlanExercises,
  estimateWarmupCooldownMinutes,
} from "./workoutTime.js";
import type { TimeBucket } from "./normalizedSchemes.js";

export type WorkoutStartAction = "keep_day" | "swap_day" | "recovery" | "skip";

export type SummaryChangeMeta = {
  volumeAdjusted?: boolean;
  deload?: boolean;
  shortenedForTime?: boolean;
  trimmedForCaps?: boolean;
  intentAdjusted?: boolean;
  safetyAdjusted?: boolean;
  corePolicyAdjusted?: boolean;
};

export type SummarySeverity = "low" | "medium" | "high" | "critical";

export type WorkoutSummaryDiff = {
  setsDelta: number;
  durationDelta: number | null;
  addedCount: number;
  removedCount: number;
  replacedCount: number;
  volumeDeltaPct: number | null;
  durationDeltaPct: number | null;
  beforeSets: number;
  afterSets: number;
  beforeDuration: number | null;
  afterDuration: number | null;
  structureChanged: boolean;
};

type SummaryDiffSignals = {
  reducedSignificant: boolean;
  increasedSignificant: boolean;
  volumeReducedSignificant: boolean;
  volumeIncreasedSignificant: boolean;
  timeReducedSignificant: boolean;
  timeIncreasedSignificant: boolean;
  structureChanged: boolean;
  meaningfulDelta: boolean;
};

function normalizeSummaryLine(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function humanizeDayLabelForSummary(value: unknown): string {
  const raw = normalizeSummaryLine(value);
  if (!raw) return "";
  const key = raw.toLowerCase();
  const map: Record<string, string> = {
    "push day": "Жимовой день",
    "pull day": "Тяговой день",
    "legs day": "Ноги",
    "upper body": "Верх тела",
    "lower body": "Низ тела",
    "full body a": "Всё тело (A)",
    "full body b": "Всё тело (B)",
    "full body c": "Всё тело (C)",
    "shoulders day": "Плечи",
  };
  if (map[key]) return map[key];
  if (key.includes("push")) return "Жимовой день";
  if (key.includes("pull")) return "Тяговой день";
  if (key.includes("legs") || key.includes("lower")) return "Ноги";
  if (key.includes("upper")) return "Верх тела";
  if (key.includes("full")) return "Всё тело";
  return raw;
}

function dedupeSummaryLines(lines: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = normalizeSummaryLine(raw);
    if (!line) continue;
    const key = line
      .toLowerCase()
      .replace(/[•\-–—]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]+/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function mergeUniqueNotes(...groups: unknown[]): string[] {
  const raw: unknown[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) raw.push(item);
  }
  return dedupeSummaryLines(raw);
}

function isGenericNeutralNote(line: string): boolean {
  const text = line.toLowerCase();
  return (
    text.includes("без изменений") ||
    text.includes("тренировка по плану") ||
    text.includes("отличное самочувствие")
  );
}

function pickFirstSpecificNote(lines: string[]): string | undefined {
  for (const line of lines) {
    if (!isGenericNeutralNote(line)) return line;
  }
  return lines[0];
}

function toFinitePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

function toTimeBucket(value: number | null | undefined): TimeBucket {
  const v = Number(value);
  if (!Number.isFinite(v)) return 60;
  if (v <= 45) return 45;
  if (v <= 60) return 60;
  return 90;
}

function normalizeExerciseId(ex: any): string | null {
  const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function resolvePlanSets(plan: any): number {
  const fromPlan = toFinitePositiveInt(plan?.totalSets);
  if (fromPlan != null) return fromPlan;

  const exercises = Array.isArray(plan?.exercises) ? plan.exercises : [];
  let sum = 0;
  let hasSets = false;
  for (const ex of exercises) {
    const sets = Number(ex?.sets);
    if (!Number.isFinite(sets) || sets <= 0) continue;
    sum += Math.round(sets);
    hasSets = true;
  }
  return hasSets ? sum : 0;
}

function resolvePlanDuration(plan: any, fallbackTimeBucket: number): number | null {
  const fromPlan = toFinitePositiveInt(plan?.estimatedDuration);
  if (fromPlan != null) return fromPlan;

  const { warmupMin, cooldownMin } = estimateWarmupCooldownMinutes(toTimeBucket(fallbackTimeBucket));
  const fromExercises = estimateTotalMinutesFromStoredPlanExercises(plan?.exercises, { warmupMin, cooldownMin });
  if (typeof fromExercises === "number" && Number.isFinite(fromExercises) && fromExercises > 0) {
    return Math.ceil(fromExercises);
  }

  const sets = resolvePlanSets(plan);
  if (sets > 0) return Math.ceil(sets * 3.25) + warmupMin + cooldownMin;

  const totalExercises = toFinitePositiveInt(plan?.totalExercises);
  if (totalExercises != null && totalExercises > 0) return Math.ceil(totalExercises * 9.0) + warmupMin + cooldownMin;
  return null;
}

function getExerciseCountMap(plan: any): Map<string, number> {
  const out = new Map<string, number>();
  const exercises = Array.isArray(plan?.exercises) ? plan.exercises : [];
  for (const ex of exercises) {
    const id = normalizeExerciseId(ex);
    if (!id) continue;
    out.set(id, (out.get(id) || 0) + 1);
  }
  return out;
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeWorkoutSummaryDiff(args: {
  beforePlan: any;
  afterPlan: any;
  fallbackTimeBucket: number;
}): WorkoutSummaryDiff {
  const beforeSets = resolvePlanSets(args.beforePlan);
  const afterSets = resolvePlanSets(args.afterPlan);

  const beforeDuration = resolvePlanDuration(args.beforePlan, args.fallbackTimeBucket);
  const afterDuration = resolvePlanDuration(args.afterPlan, args.fallbackTimeBucket);

  const beforeMap = getExerciseCountMap(args.beforePlan);
  const afterMap = getExerciseCountMap(args.afterPlan);
  const allIds = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  let addedCount = 0;
  let removedCount = 0;
  for (const id of allIds) {
    const beforeCount = beforeMap.get(id) || 0;
    const afterCount = afterMap.get(id) || 0;
    if (afterCount > beforeCount) addedCount += afterCount - beforeCount;
    if (beforeCount > afterCount) removedCount += beforeCount - afterCount;
  }
  const replacedCount = Math.min(addedCount, removedCount);
  const structureChanged = addedCount > 0 || removedCount > 0;

  const setsDelta = afterSets - beforeSets;
  const durationDelta =
    beforeDuration != null && afterDuration != null
      ? afterDuration - beforeDuration
      : null;

  const volumeDeltaPct = beforeSets > 0 ? roundToOne((setsDelta / beforeSets) * 100) : null;
  const durationDeltaPct =
    beforeDuration != null && beforeDuration > 0 && durationDelta != null
      ? roundToOne((durationDelta / beforeDuration) * 100)
      : null;

  return {
    setsDelta,
    durationDelta,
    addedCount,
    removedCount,
    replacedCount,
    volumeDeltaPct,
    durationDeltaPct,
    beforeSets,
    afterSets,
    beforeDuration,
    afterDuration,
    structureChanged,
  };
}

function getSummaryDiffSignals(diff: WorkoutSummaryDiff | null | undefined): SummaryDiffSignals {
  if (!diff) {
    return {
      reducedSignificant: false,
      increasedSignificant: false,
      volumeReducedSignificant: false,
      volumeIncreasedSignificant: false,
      timeReducedSignificant: false,
      timeIncreasedSignificant: false,
      structureChanged: false,
      meaningfulDelta: false,
    };
  }

  const volumeThreshold = Math.max(2, Math.ceil(Math.max(0, diff.beforeSets) * 0.15));
  const durationThreshold =
    diff.beforeDuration != null && diff.beforeDuration > 0
      ? Math.max(8, Math.ceil(diff.beforeDuration * 0.15))
      : 8;

  const volumeReducedSignificant = diff.setsDelta <= -volumeThreshold;
  const volumeIncreasedSignificant = diff.setsDelta >= volumeThreshold;
  const timeReducedSignificant = diff.durationDelta != null && diff.durationDelta <= -durationThreshold;
  const timeIncreasedSignificant = diff.durationDelta != null && diff.durationDelta >= durationThreshold;

  return {
    reducedSignificant: volumeReducedSignificant || timeReducedSignificant,
    increasedSignificant: volumeIncreasedSignificant || timeIncreasedSignificant,
    volumeReducedSignificant,
    volumeIncreasedSignificant,
    timeReducedSignificant,
    timeIncreasedSignificant,
    structureChanged: diff.structureChanged,
    meaningfulDelta:
      diff.structureChanged ||
      Math.abs(diff.setsDelta) >= 1 ||
      (diff.durationDelta != null && Math.abs(diff.durationDelta) >= 5),
  };
}

function detectSummaryDirection(text: string): "reduced" | "increased" | "neutral" {
  const normalized = normalizeSummaryLine(text).toLowerCase();
  if (!normalized) return "neutral";
  if (/сократ|уменьш|облегч|легче|подсниз/i.test(normalized)) return "reduced";
  if (/добав|увелич|больше объ|усилил|нагрузк.*выше/i.test(normalized)) return "increased";
  return "neutral";
}

export function isSummaryTextContradiction(
  whatChanged: string,
  diff: WorkoutSummaryDiff | null | undefined
): boolean {
  if (!diff) return false;
  const direction = detectSummaryDirection(whatChanged);
  if (direction === "neutral") return false;
  const signals = getSummaryDiffSignals(diff);
  if (direction === "reduced") {
    return signals.increasedSignificant && !signals.reducedSignificant;
  }
  return signals.reducedSignificant && !signals.increasedSignificant;
}

const summaryTextMetrics = {
  total: 0,
  contradictions: 0,
};

function trackSummaryTextMetric(args: {
  action: WorkoutStartAction;
  whatChanged: string;
  diff: WorkoutSummaryDiff | null | undefined;
}): boolean {
  summaryTextMetrics.total += 1;
  const contradiction = isSummaryTextContradiction(args.whatChanged, args.diff);
  if (contradiction) {
    summaryTextMetrics.contradictions += 1;
    console.warn(
      `[summary_text_contradiction] action=${args.action} whatChanged="${args.whatChanged}" diff=${JSON.stringify(args.diff)}`
    );
  }
  if (summaryTextMetrics.total % 25 === 0) {
    console.log(
      `[summary_text_metric] total=${summaryTextMetrics.total} contradictions=${summaryTextMetrics.contradictions}`
    );
  }
  return contradiction;
}

export function buildCoachSummaryBlocks(args: {
  action: WorkoutStartAction;
  changed: boolean;
  changeMeta?: SummaryChangeMeta;
  changeNotes?: string[];
  infoNotes?: string[];
  warnings?: string[];
  swapInfo?: { from?: string; to?: string; reason?: string[] } | null;
  diff?: WorkoutSummaryDiff | null;
}): { whatChanged: string; why: string; howToTrainToday: string } {
  const action = args.action;
  const changed = Boolean(args.changed);
  const meta = args.changeMeta || {};
  const changeNotes = mergeUniqueNotes(args.changeNotes || []);
  const infoNotes = mergeUniqueNotes(args.infoNotes || []);
  const warnings = mergeUniqueNotes(args.warnings || []);
  const diffSignals = getSummaryDiffSignals(args.diff);

  let whatChanged = "Оставили тренировку по плану.";
  if (action === "skip") {
    whatChanged = "Сегодня пауза: тренировку пропускаем.";
  } else if (action === "recovery") {
    whatChanged = "Перевели сессию в восстановительный режим.";
  } else if (action === "swap_day") {
    const from = humanizeDayLabelForSummary(args.swapInfo?.from);
    const to = humanizeDayLabelForSummary(args.swapInfo?.to);
    whatChanged = from && to ? `Переставили день: ${from} → ${to}.` : "Переставили тренировочный день внутри недели.";
  } else if (meta.safetyAdjusted) {
    whatChanged = "Убрали рискованные упражнения для проблемных зон.";
  } else if (diffSignals.reducedSignificant) {
    whatChanged = "Сократили объём под доступное время.";
  } else if (diffSignals.increasedSignificant) {
    whatChanged = "Добавили рабочий объём под твоё текущее состояние.";
  } else if (diffSignals.structureChanged) {
    whatChanged = "Обновили состав упражнений без резкой смены объёма.";
  } else if (meta.intentAdjusted || meta.deload || meta.volumeAdjusted) {
    whatChanged = "Подснизили интенсивность под текущее самочувствие.";
  } else if (changed) {
    whatChanged = pickFirstSpecificNote(changeNotes) || "Тренировку подстроили под текущее состояние.";
  }

  const whyCandidates = mergeUniqueNotes(warnings, infoNotes, changeNotes);
  let why = pickFirstSpecificNote(whyCandidates) || "";
  if (!why) {
    if (action === "skip") {
      why = "Чек-ин показал, что телу сегодня нужен отдых.";
    } else if (action === "recovery") {
      why = "Есть признаки усталости или дискомфорта, поэтому фокус на восстановлении.";
    } else if (changed) {
      why = "Ответы чек-ина показали, что адаптация даст лучший результат сегодня.";
    } else {
      why = "Текущее состояние позволяет работать по обычному плану.";
    }
  }

  const hasStrongWarning = warnings.some((line) => /🔴|critical|сильн|[7-9]\/10|10\/10/i.test(line));
  let howToTrainToday = "Работай технично и оставляй 1–2 повтора в запасе.";
  if (action === "skip") {
    howToTrainToday = "Сделай 15–25 минут лёгкой активности и восстановись.";
  } else if (hasStrongWarning) {
    howToTrainToday = "Не работай через боль: при дискомфорте снижай вес и амплитуду.";
  } else if (action === "recovery") {
    howToTrainToday = "Держи спокойный темп, длиннее паузы, без работы до отказа.";
  } else if (diffSignals.reducedSignificant) {
    howToTrainToday = "Фокус на главных подходах, без добиваний и лишнего объёма.";
  } else if (diffSignals.increasedSignificant) {
    howToTrainToday = "Можно прибавить усилие, но держи технику и 1–2 повтора в запасе.";
  } else if (meta.intentAdjusted || meta.deload) {
    howToTrainToday = "Сегодня важнее контроль техники, чем попытки на рекорд.";
  } else if (diffSignals.structureChanged) {
    howToTrainToday = "В новых упражнениях начни с умеренного веса и ровного темпа.";
  } else if (!changed) {
    howToTrainToday = "Можно идти по обычному плану в рабочем ритме.";
  }

  return { whatChanged, why, howToTrainToday };
}

export function buildSummaryPayload(args: {
  action: WorkoutStartAction;
  severity?: SummarySeverity;
  changeMeta?: SummaryChangeMeta;
  changeNotes?: string[];
  infoNotes?: string[];
  warnings?: string[];
  swapInfo?: { from?: string; to?: string; reason?: string[] } | null;
  diff?: WorkoutSummaryDiff | null;
  forcedChanged?: boolean;
}) {
  const changeMeta = args.changeMeta || {};
  const changeNotes = mergeUniqueNotes(args.changeNotes || []);
  const infoNotes = mergeUniqueNotes(args.infoNotes || []);
  const warnings = mergeUniqueNotes(args.warnings || []);
  const diff = args.diff || null;
  const diffSignals = getSummaryDiffSignals(diff);

  const changed =
    typeof args.forcedChanged === "boolean"
      ? args.forcedChanged
      : args.action !== "keep_day" ||
        changeNotes.length > 0 ||
        Boolean(changeMeta.intentAdjusted) ||
        Boolean(changeMeta.volumeAdjusted) ||
        Boolean(changeMeta.shortenedForTime) ||
        Boolean(changeMeta.trimmedForCaps) ||
        Boolean(changeMeta.deload) ||
        Boolean(changeMeta.safetyAdjusted) ||
        Boolean(changeMeta.corePolicyAdjusted) ||
        diffSignals.meaningfulDelta;

  const blocks = buildCoachSummaryBlocks({
    action: args.action,
    changed,
    changeMeta,
    changeNotes,
    infoNotes,
    warnings,
    swapInfo: args.swapInfo,
    diff,
  });

  trackSummaryTextMetric({
    action: args.action,
    whatChanged: blocks.whatChanged,
    diff,
  });

  return {
    changed,
    changeNotes,
    infoNotes,
    warnings,
    severity: args.severity,
    changeMeta: Object.keys(changeMeta).length ? changeMeta : undefined,
    version: 2 as const,
    diff: diff || undefined,
    whatChanged: blocks.whatChanged,
    why: blocks.why,
    howToTrainToday: blocks.howToTrainToday,
  };
}
