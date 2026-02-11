import {
  estimateTotalMinutesFromStoredPlanExercises,
  estimateWarmupCooldownMinutes,
} from "./workoutTime.js";
import type { TimeBucket } from "./normalizedSchemes.js";
import type { CheckInData } from "./workoutDayGenerator.js";
import type { Readiness } from "./readiness.js";

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

export type SummaryDriverCode =
  | "skip_rest"
  | "recovery_mode"
  | "swap_day"
  | "pain_safety"
  | "time_limit"
  | "low_recovery"
  | "high_readiness"
  | "exercise_swap"
  | "no_change";

export type CheckInFactPack = {
  input: {
    sleep?: CheckInData["sleep"];
    energy?: CheckInData["energy"];
    stress?: CheckInData["stress"];
    availableMinutes: number | null;
    onboardingMinutes: number | null;
    pain: Array<{ location: string; level: number }>;
    maxPainLevel: number;
  };
  adaptation: {
    action: WorkoutStartAction;
    changed: boolean;
    dayFrom?: string;
    dayTo?: string;
    before: {
      exercises: number;
      sets: number;
      duration: number | null;
    };
    after: {
      exercises: number;
      sets: number;
      duration: number | null;
    };
    diff: WorkoutSummaryDiff | null;
    drivers: SummaryDriverCode[];
  };
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

function toFiniteNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function countPlanExercises(plan: any): number {
  const ex = Array.isArray(plan?.exercises) ? plan.exercises : [];
  return ex.length;
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
    const setsRaw = Array.isArray(ex?.sets) ? ex.sets.length : Number(ex?.sets ?? ex?.totalSets);
    if (!Number.isFinite(setsRaw) || setsRaw <= 0) continue;
    sum += Math.round(setsRaw);
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

function hasLowRecoveryInput(checkin?: CheckInData): boolean {
  if (!checkin) return false;
  return checkin.sleep === "poor" || checkin.energy === "low" || checkin.stress === "high" || checkin.stress === "very_high";
}

function hasHighReadinessInput(checkin?: CheckInData): boolean {
  if (!checkin) return false;
  const goodSleep = checkin.sleep === "good" || checkin.sleep === "excellent";
  const highEnergy = checkin.energy === "high";
  const controlledStress = checkin.stress === "low" || checkin.stress === "medium";
  return goodSleep && highEnergy && controlledStress;
}

function deriveSummaryDrivers(args: {
  action: WorkoutStartAction;
  changed: boolean;
  changeMeta: SummaryChangeMeta;
  diff: WorkoutSummaryDiff | null;
  checkin?: CheckInData;
  readiness?: Partial<Readiness>;
  onboardingMinutes?: number | null;
}): SummaryDriverCode[] {
  const drivers: SummaryDriverCode[] = [];
  const diffSignals = getSummaryDiffSignals(args.diff);
  const availableMinutes =
    typeof args.checkin?.availableMinutes === "number" && Number.isFinite(args.checkin.availableMinutes)
      ? args.checkin.availableMinutes
      : null;
  const onboardingMinutes = toFiniteNumberOrNull(args.onboardingMinutes);
  const metaTimeFlag = Boolean(args.changeMeta.shortenedForTime || args.changeMeta.trimmedForCaps);
  const timeWasTight =
    (availableMinutes != null && onboardingMinutes != null && availableMinutes < onboardingMinutes) ||
    (metaTimeFlag && !diffSignals.increasedSignificant);
  const painRisk =
    Boolean(args.changeMeta.safetyAdjusted) ||
    Number(args.readiness?.maxPainLevel || 0) >= 4 ||
    (Array.isArray(args.checkin?.pain) && args.checkin!.pain.length > 0);

  if (args.action === "skip") drivers.push("skip_rest");
  if (args.action === "recovery") drivers.push("recovery_mode");
  if (args.action === "swap_day") drivers.push("swap_day");

  if (painRisk && args.action !== "skip") drivers.push("pain_safety");
  if (timeWasTight && args.action === "keep_day") drivers.push("time_limit");

  if (args.action === "keep_day" && hasLowRecoveryInput(args.checkin)) drivers.push("low_recovery");
  if (args.action === "keep_day" && hasHighReadinessInput(args.checkin) && diffSignals.increasedSignificant) {
    drivers.push("high_readiness");
  }

  if (args.diff?.structureChanged) drivers.push("exercise_swap");
  if (!args.changed) drivers.push("no_change");

  const order: SummaryDriverCode[] = [
    "skip_rest",
    "recovery_mode",
    "swap_day",
    "pain_safety",
    "time_limit",
    "low_recovery",
    "high_readiness",
    "exercise_swap",
    "no_change",
  ];
  const uniq = Array.from(new Set(drivers));
  return uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function painLocationRu(location: string): string {
  const key = String(location || "").toLowerCase().trim();
  const map: Record<string, string> = {
    shoulder: "плечо",
    elbow: "локоть",
    wrist: "кисть",
    neck: "шея",
    lower_back: "поясница",
    hip: "тазобедренный",
    knee: "колено",
    ankle: "голеностоп",
  };
  return map[key] || key || "зона боли";
}

function formatDurationDelta(diff: WorkoutSummaryDiff | null | undefined): string | null {
  if (!diff) return null;
  if (diff.beforeDuration == null || diff.afterDuration == null) return null;
  return `${diff.beforeDuration} → ${diff.afterDuration} мин`;
}

function formatSetsDelta(diff: WorkoutSummaryDiff | null | undefined): string | null {
  if (!diff) return null;
  return `${diff.beforeSets} → ${diff.afterSets} подходов`;
}

export function buildCheckInFactPack(args: {
  action: WorkoutStartAction;
  changed: boolean;
  changeMeta?: SummaryChangeMeta;
  diff?: WorkoutSummaryDiff | null;
  checkin?: CheckInData;
  readiness?: Partial<Readiness>;
  onboardingMinutes?: number | null;
  beforePlan?: any;
  afterPlan?: any;
  swapInfo?: { from?: string; to?: string } | null;
}): CheckInFactPack {
  const checkinPain = Array.isArray(args.checkin?.pain) ? args.checkin!.pain : [];
  const maxPainFromInput = checkinPain.reduce((max, p) => Math.max(max, Number(p?.level) || 0), 0);
  const maxPainLevel = Math.max(Number(args.readiness?.maxPainLevel || 0), maxPainFromInput);
  const beforeSets = resolvePlanSets(args.beforePlan);
  const afterSets = resolvePlanSets(args.afterPlan);
  const beforeDuration = resolvePlanDuration(args.beforePlan, Number(args.onboardingMinutes || 60));
  const afterDuration = resolvePlanDuration(args.afterPlan, Number(args.onboardingMinutes || 60));
  const beforeExercises = countPlanExercises(args.beforePlan);
  const afterExercises = countPlanExercises(args.afterPlan);
  const changeMeta = args.changeMeta || {};
  const changed = Boolean(args.changed);
  const diff = args.diff || null;

  const drivers = deriveSummaryDrivers({
    action: args.action,
    changed,
    changeMeta,
    diff,
    checkin: args.checkin,
    readiness: args.readiness,
    onboardingMinutes: args.onboardingMinutes,
  });

  return {
    input: {
      sleep: args.checkin?.sleep,
      energy: args.checkin?.energy,
      stress: args.checkin?.stress,
      availableMinutes:
        typeof args.checkin?.availableMinutes === "number" && Number.isFinite(args.checkin.availableMinutes)
          ? args.checkin.availableMinutes
          : null,
      onboardingMinutes: toFiniteNumberOrNull(args.onboardingMinutes),
      pain: checkinPain
        .map((p) => ({ location: String(p.location), level: Number(p.level) }))
        .filter((p) => Number.isFinite(p.level) && p.level > 0),
      maxPainLevel,
    },
    adaptation: {
      action: args.action,
      changed,
      dayFrom: args.swapInfo?.from || undefined,
      dayTo: args.swapInfo?.to || undefined,
      before: {
        exercises: beforeExercises,
        sets: beforeSets,
        duration: beforeDuration,
      },
      after: {
        exercises: afterExercises,
        sets: afterSets,
        duration: afterDuration,
      },
      diff,
      drivers,
    },
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
  facts?: CheckInFactPack | null;
}): { whatChanged: string; why: string; howToTrainToday: string } {
  const facts = args.facts || null;
  const action = args.action;
  const warnings = mergeUniqueNotes(args.warnings || []);
  const infoNotes = mergeUniqueNotes(args.infoNotes || []);
  const changeNotes = mergeUniqueNotes(args.changeNotes || []);

  if (!facts) {
    const fallbackWhy = pickFirstSpecificNote(mergeUniqueNotes(warnings, infoNotes, changeNotes))
      || "Ответы чек-ина учтены в плане на сегодня.";
    return {
      whatChanged: action === "skip" ? "Сегодня пауза: тренировку пропускаем." : "Тренировку подстроили под текущее состояние.",
      why: fallbackWhy,
      howToTrainToday: action === "skip"
        ? "Сделай 15–25 минут лёгкой активности и восстановись."
        : "Работай технично и оставляй 1–2 повтора в запасе.",
    };
  }

  const diff = facts.adaptation.diff;
  const drivers = facts.adaptation.drivers;
  const hasDriver = (code: SummaryDriverCode) => drivers.includes(code);
  const hasPainSafety = hasDriver("pain_safety");
  const hasTimeLimit = hasDriver("time_limit");
  const hasLowRecovery = hasDriver("low_recovery");
  const hasExerciseSwap = hasDriver("exercise_swap");
  const hasNoChange = hasDriver("no_change");
  const diffSignals = getSummaryDiffSignals(diff);
  const durationPair = formatDurationDelta(diff);
  const setsPair = formatSetsDelta(diff);
  const topPain = facts.input.pain
    .slice()
    .sort((a, b) => b.level - a.level)[0];
  const painText = topPain ? `${painLocationRu(topPain.location)} ${topPain.level}/10` : null;

  let whatChanged = "План оставили без изменений.";
  if (action === "skip") {
    whatChanged = "Сегодня делаем паузу в силовой тренировке.";
  } else if (action === "recovery") {
    whatChanged = "Сегодня заменили тренировку на восстановительную сессию.";
  } else if (action === "swap_day") {
    const from = humanizeDayLabelForSummary(facts.adaptation.dayFrom);
    const to = humanizeDayLabelForSummary(facts.adaptation.dayTo);
    whatChanged = from && to
      ? `Переставили день: ${from} → ${to}.`
      : "Переставили тренировочный день внутри недели.";
  } else if (hasPainSafety) {
    if (facts.adaptation.before.exercises !== facts.adaptation.after.exercises || hasDriver("exercise_swap")) {
      whatChanged = "Заменили часть упражнений на более безопасные для текущего состояния.";
    } else if (setsPair || durationPair) {
      whatChanged = `Снизили нагрузку для безопасности (${setsPair || durationPair}).`;
    } else {
      whatChanged = "Сделали тренировку безопаснее под текущие ограничения.";
    }
  } else if (hasTimeLimit && hasLowRecovery) {
    whatChanged = diffSignals.meaningfulDelta
      ? "Сжали тренировку под время и облегчили нагрузку под самочувствие."
      : "Подстроили тренировку под время и текущее самочувствие.";
  } else if (hasTimeLimit) {
    whatChanged = durationPair
      ? `Сократили тренировку под время (${durationPair}).`
      : "Сократили тренировку под доступное время.";
  } else if (hasLowRecovery && diffSignals.meaningfulDelta) {
    whatChanged = "Облегчили нагрузку под текущее самочувствие.";
  } else if (diff && (diff.setsDelta <= -2 || (diff.durationDelta != null && diff.durationDelta <= -8))) {
    whatChanged = setsPair
      ? `Сделали тренировку легче (${setsPair}).`
      : "Снизили нагрузку под текущее состояние.";
  } else if (diff && (diff.setsDelta >= 2 || (diff.durationDelta != null && diff.durationDelta >= 8))) {
    whatChanged = setsPair
      ? `Немного повысили рабочую нагрузку (${setsPair}).`
      : "Немного повысили рабочую нагрузку на сегодня.";
  } else if (hasExerciseSwap) {
    whatChanged = "Обновили состав упражнений без заметной смены объёма.";
  }

  let why = "Ответы чек-ина учтены в адаптации тренировки.";
  if (hasDriver("skip_rest")) {
    why = painText
      ? `По чек-ину сегодня высокий риск перегруза (${painText}), поэтому выбрали восстановление.`
      : "По чек-ину сегодня телу нужен отдых от силовой нагрузки.";
  } else if (hasDriver("recovery_mode")) {
    why = painText
      ? `По чек-ину есть дискомфорт (${painText}), поэтому включили мягкий восстановительный режим.`
      : "По чек-ину сейчас лучше восстановительная работа вместо силовой.";
  } else if (hasPainSafety) {
    why = painText
      ? `Отметил боль (${painText}), поэтому убрали движения с лишним риском.`
      : "По чек-ину есть факторы риска, поэтому тренировку сделали безопаснее.";
  } else if (hasTimeLimit && hasLowRecovery) {
    const available = facts.input.availableMinutes;
    const onboarding = facts.input.onboardingMinutes;
    const timePart =
      available != null && onboarding != null
        ? `Указал ${available} мин вместо обычных ${onboarding}`
        : "Времени на тренировку сегодня меньше обычного";

    if (facts.input.sleep === "poor" && facts.input.energy === "low") {
      why = `${timePart}. Плохой сон и низкая энергия — поэтому оставили щадящую нагрузку без перегруза.`;
    } else if (facts.input.sleep === "poor") {
      why = `${timePart}. Из-за плохого сна сделали нагрузку мягче.`;
    } else if (facts.input.energy === "low") {
      why = `${timePart}. Из-за низкой энергии снизили интенсивность на сегодня.`;
    } else {
      why = `${timePart}. По самочувствию сегодня работаем в более щадящем режиме.`;
    }
  } else if (hasTimeLimit) {
    const available = facts.input.availableMinutes;
    const onboarding = facts.input.onboardingMinutes;
    why = available != null && onboarding != null
      ? `Указал ${available} мин вместо обычных ${onboarding} — адаптировали объём под это время.`
      : "По чек-ину времени на тренировку меньше обычного, поэтому сократили объём.";
  } else if (hasLowRecovery) {
    if (facts.input.sleep === "poor" && facts.input.energy === "low") {
      why = "Плохой сон и низкая энергия — сделали сессию легче, чтобы не перегружать восстановление.";
    } else if (facts.input.sleep === "poor") {
      why = "Плохой сон снижает восстановление, поэтому нагрузку сделали мягче.";
    } else if (facts.input.energy === "low") {
      why = "Низкая энергия по чек-ину, поэтому снизили интенсивность на сегодня.";
    } else {
      why = "По чек-ину ресурс ниже обычного, поэтому тренировку сделали легче.";
    }
  } else if (hasDriver("high_readiness")) {
    why = "По чек-ину высокий ресурс, поэтому можно немного повысить рабочую нагрузку.";
  } else if (hasNoChange) {
    why = "По чек-ину состояние ровное — оставили план без изменений.";
  } else {
    const whyCandidates = mergeUniqueNotes(warnings, infoNotes, changeNotes);
    why = pickFirstSpecificNote(whyCandidates) || why;
  }

  let howToTrainToday = "Работай технично и оставляй 1–2 повтора в запасе.";
  if (hasDriver("skip_rest")) {
    howToTrainToday = "Сделай 15–25 минут лёгкой активности и восстановись.";
  } else if (hasDriver("recovery_mode")) {
    howToTrainToday = "Держи спокойный темп, без работы до отказа и без резкой боли.";
  } else if (hasDriver("pain_safety")) {
    howToTrainToday = "Выполняй движения без боли: при дискомфорте сразу снижай нагрузку и амплитуду.";
  } else if (hasDriver("time_limit")) {
    howToTrainToday = "Идём компактно: меньше упражнений, но без спешки и с чистой техникой.";
  } else if (hasDriver("low_recovery")) {
    howToTrainToday = "Сегодня работай ровно: техника и контроль важнее попыток на рекорд.";
  } else if (hasDriver("high_readiness")) {
    howToTrainToday = "Можно работать плотнее, но сохраняй контроль техники и запас 1–2 повтора.";
  } else if (hasDriver("no_change")) {
    howToTrainToday = "Тренируйся по обычному плану в рабочем темпе.";
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
  checkin?: CheckInData;
  readiness?: Partial<Readiness>;
  onboardingMinutes?: number | null;
  beforePlan?: any;
  afterPlan?: any;
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

  const facts = buildCheckInFactPack({
    action: args.action,
    changed,
    changeMeta,
    diff,
    checkin: args.checkin,
    readiness: args.readiness,
    onboardingMinutes: args.onboardingMinutes,
    beforePlan: args.beforePlan,
    afterPlan: args.afterPlan,
    swapInfo: args.swapInfo,
  });

  const blocks = buildCoachSummaryBlocks({
    action: args.action,
    changed,
    changeMeta,
    changeNotes,
    infoNotes,
    warnings,
    swapInfo: args.swapInfo,
    diff,
    facts,
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
    facts,
    whatChanged: blocks.whatChanged,
    why: blocks.why,
    howToTrainToday: blocks.howToTrainToday,
  };
}
