import type { StartWorkoutResponse } from "@/api/plan";

export type CheckInSummarySeverity = "low" | "medium" | "high" | "critical";

export type CheckInSummaryViewModel = {
  kicker: string;
  title: string;
  subtitle: string;
  bullets: string[];
  factualLine?: string;
  severity: CheckInSummarySeverity;
  changed: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanLine(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shorten(line: string, max = 170): string {
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Severity – prefer structured facts, fallback to backend severity
// ---------------------------------------------------------------------------

function pickSeverity(result: StartWorkoutResponse): CheckInSummarySeverity {
  // 1. Explicit severity from backend (most reliable)
  const explicit = result.summary?.severity;
  if (explicit === "low" || explicit === "medium" || explicit === "high" || explicit === "critical") {
    return explicit;
  }

  // 2. Derive from structured facts (pain level)
  const maxPain = result.summary?.facts?.input?.maxPainLevel ?? 0;
  if (maxPain >= 8) return "critical";
  if (maxPain >= 6) return "high";

  // 3. Derive from action
  if (result.action === "skip") return "high";
  if (result.action === "recovery") return "medium";
  if (result.action === "swap_day") return "medium";

  // 4. Warnings count
  const warnings = [
    ...(Array.isArray(result.summary?.warnings) ? result.summary!.warnings : []),
    ...(Array.isArray(result.workout?.warnings) ? result.workout.warnings : []),
  ].filter(Boolean);
  if (warnings.length > 0) return "medium";

  return "low";
}

// ---------------------------------------------------------------------------
// Factual line (numeric delta) – built from structured facts
// ---------------------------------------------------------------------------

function buildFactualLine(facts: NonNullable<StartWorkoutResponse["summary"]>["facts"] | null): string {
  if (!facts) return "";
  const before = facts.adaptation.before;
  const after = facts.adaptation.after;
  const setsDelta = after.sets - before.sets;
  const durationDelta =
    before.duration != null && after.duration != null ? after.duration - before.duration : null;

  const isSignificant =
    Math.abs(setsDelta) >= 2 ||
    (durationDelta != null && Math.abs(durationDelta) >= 5);
  if (!isSignificant) return "";

  const parts: string[] = [];
  if (setsDelta !== 0) {
    const sign = setsDelta > 0 ? "+" : "−";
    const abs = Math.abs(setsDelta);
    parts.push(`подходы ${before.sets} → ${after.sets} (${sign}${abs})`);
  }
  if (durationDelta != null && durationDelta !== 0) {
    const sign = durationDelta > 0 ? "+" : "−";
    const abs = Math.abs(durationDelta);
    parts.push(`время ${before.duration} → ${after.duration} мин (${sign}${abs})`);
  }
  return parts.length ? `По факту: ${parts.join(", ")}.` : "";
}

// ---------------------------------------------------------------------------
// Fallback title/subtitle (only when backend doesn't provide whatChanged/why)
// ---------------------------------------------------------------------------

const DAY_LABEL_MAP: Record<string, string> = {
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

function humanizeDayLabel(raw?: string): string {
  const value = cleanLine(raw);
  if (!value) return "";
  const key = value.toLowerCase();
  if (DAY_LABEL_MAP[key]) return DAY_LABEL_MAP[key];
  if (key.includes("push")) return "Жимовой день";
  if (key.includes("pull")) return "Тяговой день";
  if (key.includes("legs") || key.includes("lower")) return "Ноги";
  if (key.includes("upper")) return "Верх тела";
  if (key.includes("full")) return "Всё тело";
  return value;
}

function fallbackTitle(result: StartWorkoutResponse, changed: boolean): string {
  if (result.action === "recovery") return "Восстановительный день";
  if (result.action === "skip") return "Пауза на сегодня";
  if (result.action === "swap_day") {
    const from = humanizeDayLabel(result.swapInfo?.from);
    const to = humanizeDayLabel(result.swapInfo?.to);
    return from && to ? `Переставили день: ${from} → ${to}.` : "День переставлен";
  }
  if (changed) return "Тренировка адаптирована";
  return "План без изменений";
}

function fallbackSubtitle(result: StartWorkoutResponse, changed: boolean): string {
  if (result.action === "recovery") return "Сегодня вместо силовой — восстановительная сессия.";
  if (result.action === "skip") return "Сегодня без силовой: нужен отдых и восстановление.";
  if (result.action === "swap_day") return "Переставили тренировочный день.";
  if (changed) return "План подстроен под текущее состояние.";
  return "Идём по обычному плану.";
}

// ---------------------------------------------------------------------------
// Main: Build view-model from backend response
// ---------------------------------------------------------------------------

export function buildCheckInSummaryViewModel(result: StartWorkoutResponse): CheckInSummaryViewModel {
  const severity = pickSeverity(result);
  const meta = result.summary?.changeMeta || {};
  const facts = result.summary?.facts || null;

  const changed = Boolean(
    result.summary?.changed ||
    result.action !== "keep_day" ||
    meta.intentAdjusted ||
    meta.volumeAdjusted ||
    meta.shortenedForTime ||
    meta.trimmedForCaps ||
    meta.deload ||
    meta.safetyAdjusted ||
    meta.corePolicyAdjusted
  );

  // Primary: use backend-generated text (version 2 summary)
  const backendWhat = cleanLine(result.summary?.whatChanged);
  const backendWhy = cleanLine(result.summary?.why);
  const backendHow = cleanLine(result.summary?.howToTrainToday);

  // Title and subtitle: backend first, fallback for old API / edge cases
  const title = backendWhat || fallbackTitle(result, changed);
  const subtitle = backendWhy || fallbackSubtitle(result, changed);

  // Factual numeric delta
  const factualLine = buildFactualLine(facts);
  // Suppress factualLine when title already contains "→" (same numeric info)
  const factualDuplicatesTitle = Boolean(factualLine && title.includes("→"));
  const effectiveFactual = factualDuplicatesTitle ? "" : factualLine;

  // Bullets: howToTrainToday is valuable coaching advice, include it
  const bullets: string[] = [];
  if (backendHow) bullets.push(shorten(backendHow));
  if (effectiveFactual) bullets.push(shorten(effectiveFactual));

  return {
    kicker: "Результат чек-ина",
    title,
    subtitle,
    bullets,
    factualLine: effectiveFactual || undefined,
    severity,
    changed,
  };
}
