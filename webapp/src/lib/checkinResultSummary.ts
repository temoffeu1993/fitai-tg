import type { StartWorkoutResponse } from "@/api/plan";

export type CheckInSummarySeverity = "low" | "medium" | "high" | "critical";

export type CheckInSummaryViewModel = {
  kicker: string;
  title: string;
  subtitle: string;
  bullets: string[];
  severity: CheckInSummarySeverity;
  changed: boolean;
};

const DAY_LABEL_MAP: Record<string, string> = {
  "push day": "Жимовой день",
  "pull day": "Тяговый день",
  "legs day": "Ноги",
  "upper body": "Верх тела",
  "lower body": "Низ тела",
  "full body a": "Всё тело (A)",
  "full body b": "Всё тело (B)",
  "full body c": "Всё тело (C)",
  "shoulders day": "Плечи",
};

const GENERIC_NEUTRAL_PATTERNS: RegExp[] = [
  /отличное самочувствие/i,
  /тренировка по плану/i,
  /без изменений/i,
];

function cleanLine(value: unknown): string {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s;
}

function dedupeLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = cleanLine(raw);
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

function shorten(line: string, max = 170): string {
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function isGenericNeutral(line: string): boolean {
  return GENERIC_NEUTRAL_PATTERNS.some((p) => p.test(line));
}

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

function pickSeverity(result: StartWorkoutResponse): CheckInSummarySeverity {
  const explicit = result.summary?.severity;
  if (explicit === "low" || explicit === "medium" || explicit === "high" || explicit === "critical") {
    return explicit;
  }
  const warnings = dedupeLines([
    ...(Array.isArray(result.summary?.warnings) ? result.summary!.warnings : []),
    ...(Array.isArray(result.workout?.warnings) ? result.workout.warnings : []),
  ]);
  if (warnings.some((w) => /🔴|сильн|critical/i.test(w))) return "high";
  if (warnings.length > 0) return "medium";
  return "low";
}

function collectSignals(result: StartWorkoutResponse) {
  const canonical = {
    whatChanged: cleanLine(result.summary?.whatChanged),
    why: cleanLine(result.summary?.why),
    howToTrainToday: cleanLine(result.summary?.howToTrainToday),
  };
  return {
    canonical,
    changeNotes: dedupeLines(Array.isArray(result.summary?.changeNotes) ? result.summary!.changeNotes : []),
    infoNotes: dedupeLines(Array.isArray(result.summary?.infoNotes) ? result.summary!.infoNotes : []),
    warnings: dedupeLines([
      ...(Array.isArray(result.summary?.warnings) ? result.summary!.warnings : []),
      ...(Array.isArray(result.workout?.warnings) ? result.workout.warnings : []),
    ]),
    notes: dedupeLines(Array.isArray(result.notes) ? result.notes : []),
  };
}

function fallbackBullets(action: StartWorkoutResponse["action"], changed: boolean): string[] {
  if (action === "recovery") {
    return ["Лёгкая нагрузка, больше контроля и отдыха между подходами."];
  }
  if (action === "swap_day") {
    return ["Нагружаем менее чувствительные зоны, проблемным даём восстановиться."];
  }
  if (action === "skip") {
    return ["Сделай 15–25 минут прогулки или мобилити и восстановись."];
  }
  if (changed) {
    return ["Работаем технично: чистые повторы важнее рекордов сегодня."];
  }
  return [];
}

export function buildCheckInSummaryViewModel(result: StartWorkoutResponse): CheckInSummaryViewModel {
  const severity = pickSeverity(result);
  const signals = collectSignals(result);
  const meta = result.summary?.changeMeta || {};
  const changed = Boolean(
    result.summary?.changed ||
      result.action !== "keep_day" ||
      signals.changeNotes.length > 0 ||
      meta.intentAdjusted ||
      meta.volumeAdjusted ||
      meta.shortenedForTime ||
      meta.trimmedForCaps ||
      meta.deload ||
      meta.safetyAdjusted ||
      meta.corePolicyAdjusted
  );

  let title = "План в силе";
  let subtitle = "Самочувствие ок — работаем по программе.";

  if (result.action === "recovery") {
    title = "Восстановительный день";
    subtitle =
      severity === "critical"
        ? "Сегодня без героизма: телу нужен аккуратный восстановительный режим."
        : "Работаем мягко: восстановление сейчас важнее объёма.";
  } else if (result.action === "swap_day") {
    const from = humanizeDayLabel(result.swapInfo?.from);
    const to = humanizeDayLabel(result.swapInfo?.to);
    title = "Переставили день";
    subtitle =
      from && to
        ? `Сегодня: ${from} → ${to}. Так сейчас безопаснее и продуктивнее.`
        : "Переставили день, чтобы не перегружать уставшие зоны.";
  } else if (result.action === "skip") {
    title = "Пауза на сегодня";
    subtitle = "Тело просит перезагрузку. Это нормально и поможет прогрессу.";
  } else if (changed) {
    title = "Тренировка подстроена";
    subtitle =
      severity === "high" || severity === "critical"
        ? "Сегодня без геройства: убрали лишний риск и оставили рабочую нагрузку."
        : "Подправили план под текущее самочувствие.";
  } else if (signals.warnings.length > 0) {
    subtitle = "Идём по плану, но работаем аккуратно: контроль и техника в приоритете.";
  }

  const canonicalBullets = dedupeLines([
    signals.canonical.whatChanged,
    signals.canonical.why,
    signals.canonical.howToTrainToday,
  ])
    .map((line) => shorten(line))
    .slice(0, 3);

  const fallbackCandidateLines =
    result.action === "keep_day" && !changed
      ? [...signals.warnings, ...signals.infoNotes, ...signals.notes]
      : [...signals.changeNotes, ...signals.warnings, ...signals.infoNotes, ...signals.notes];

  const fallbackBulletLines = dedupeLines(fallbackCandidateLines)
    .filter((line) => !(line && isGenericNeutral(line) && changed))
    .map((line) => shorten(line))
    .slice(0, 3);

  const bullets = canonicalBullets.length > 0 ? canonicalBullets : fallbackBulletLines;

  if (!bullets.length) {
    bullets.push(...fallbackBullets(result.action, changed));
  }

  return {
    kicker: "Результат чек-ина",
    title,
    subtitle,
    bullets,
    severity,
    changed,
  };
}
