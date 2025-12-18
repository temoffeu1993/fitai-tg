// readiness.ts
// ============================================================================
// ЕДИНАЯ СИСТЕМА ОЦЕНКИ ГОТОВНОСТИ К ТРЕНИРОВКЕ
// 
// Заменяет дублирование логики между:
// - checkinPolicy.analyzeCheckinLimitations()
// - workoutDayGenerator.calculateIntent() + buildAvoidFlags()
// 
// Один источник правды для всех решений о тренировке.
// ============================================================================

import type { CheckInData, PainEntry } from "./workoutDayGenerator.js";
import type { JointFlag } from "./exerciseLibrary.js";
import type { TimeBucket } from "./normalizedSchemes.js";

// ============================================================================
// TYPES
// ============================================================================

export type Intent = "light" | "normal" | "hard";

export type Severity = "low" | "medium" | "high" | "critical";

export type DayType = "push" | "pull" | "legs" | "upper" | "lower" | "full_body" | "unknown";

export type Readiness = {
  // Нагрузка
  intent: Intent;
  severity: Severity;
  severityScore: number; // для отладки
  
  // Безопасность (боль)
  maxPainLevel: number;
  painByLocation: Map<string, number>; // location -> level
  avoidFlags: JointFlag[];
  blockedPatterns: string[];
  blockedDayTypes: DayType[];
  
  // Время
  timeBucket: TimeBucket;
  effectiveMinutes: number | null; // из checkin или null
  
  // Человеко-читаемые объяснения
  warnings: string[];
  notes: string[];
  reasons: string[]; // для policy decision
};

// ============================================================================
// MAIN FUNCTION: Compute Readiness
// ============================================================================

export function computeReadiness(args: {
  checkin?: CheckInData;
  fallbackTimeBucket: TimeBucket;
}): Readiness {
  const { checkin, fallbackTimeBucket } = args;

  console.log("\n🔍 [READINESS] ========================================");
  console.log("📋 Input:", JSON.stringify({ checkin, fallbackTimeBucket }, null, 2));

  // -------------------------------------------------------------------------
  // 1. PAIN ANALYSIS (самое важное - безопасность)
  // -------------------------------------------------------------------------
  
  const painByLocation = new Map<string, number>();
  let maxPainLevel = 0;
  
  if (checkin?.pain) {
    for (const p of checkin.pain) {
      const level = Math.max(1, Math.min(10, p.level));
      painByLocation.set(p.location, level);
      maxPainLevel = Math.max(maxPainLevel, level);
    }
  }
  
  // Боль по уровням (тренерская классификация)
  // L1: 1-3 (легкий дискомфорт)
  // L2: 4-6 (умеренная боль, адаптация)
  // L3: 7-10 (сильная боль, ограничения)
  const countL2Plus = Array.from(painByLocation.values()).filter(l => l >= 4).length;
  const countL3 = Array.from(painByLocation.values()).filter(l => l >= 7).length;

  // -------------------------------------------------------------------------
  // 2. CUMULATIVE SEVERITY SCORE (кумулятивная оценка)
  // -------------------------------------------------------------------------
  
  let severityScore = 0;
  const reasons: string[] = [];

  // Боль (главный фактор безопасности)
  if (maxPainLevel >= 9) {
    severityScore += 6;
  } else if (maxPainLevel === 8) {
    severityScore += 5;
  } else if (maxPainLevel === 7) {
    severityScore += 4;
  } else if (maxPainLevel >= 5) {
    severityScore += 2; // 5-6/10: умеренная боль
  } else if (maxPainLevel >= 4) {
    severityScore += 1; // 4/10: лёгкая адаптация (было +2, завышало)
  }
  
  // Мультизонная боль опаснее
  if (countL2Plus >= 2) {
    severityScore += 1;
  }

  // Сон
  if (!checkin) {
    // no checkin = neutral
  } else if (checkin.sleep === "poor") {
    severityScore += 2;
  } else if (checkin.sleep === "fair") {
    severityScore += 1;
  } else if (checkin.sleep === "ok") {
    severityScore += 0;
  } else if (checkin.sleep === "good") {
    severityScore -= 1;
  } else if (checkin.sleep === "excellent") {
    severityScore -= 2;
  }

  // Энергия
  if (checkin?.energy === "low") {
    severityScore += 2;
  } else if (checkin?.energy === "high") {
    severityScore -= 1;
  }

  // Стресс
  if (checkin?.stress === "very_high") {
    severityScore += 2;
  } else if (checkin?.stress === "high") {
    severityScore += 1;
  } else if (checkin?.stress === "low") {
    severityScore -= 1;
  }

  // -------------------------------------------------------------------------
  // 3. SEVERITY CLASSIFICATION
  // -------------------------------------------------------------------------
  
  let severity: Severity;
  if (severityScore >= 7) {
    severity = "critical"; // Боль 8-10 + факторы ИЛИ боль 5+ и всё плохо
  } else if (severityScore >= 4) {
    severity = "high"; // Боль 7 ИЛИ боль 5-6 + плохой сон/стресс
  } else if (severityScore >= 2) {
    severity = "medium"; // Боль 4-6 ИЛИ множественные факторы
  } else {
    severity = "low"; // Всё ок или лёгкий дискомфорт
  }

  // -------------------------------------------------------------------------
  // 4. INTENT (интенсивность нагрузки)
  // -------------------------------------------------------------------------
  
  let intent: Intent;
  
  // Базовый intent из severity
  if (severity === "critical" || severity === "high") {
    intent = "light";
  } else if (severity === "low" && severityScore <= -2) {
    intent = "hard";
  } else {
    intent = "normal";
  }

  // Safety overrides (тренерские правила безопасности)
  
  // Override 1: Сильная боль всегда light
  if (maxPainLevel >= 7) {
    intent = "light";
  }
  
  // Override 2: Плохой сон + высокий стресс → не hard
  if (checkin?.sleep === "poor" && (checkin?.stress === "high" || checkin?.stress === "very_high")) {
    if (intent === "hard") intent = "normal";
  }
  
  // Override 3: Очень высокий стресс + боль средняя → light
  if (checkin?.stress === "very_high" && maxPainLevel >= 4) {
    intent = "light";
  }

  // -------------------------------------------------------------------------
  // 5. AVOID FLAGS & BLOCKED PATTERNS (от боли)
  // -------------------------------------------------------------------------
  
  const avoidFlags: JointFlag[] = [];
  const blockedPatterns: string[] = [];
  const blockedDayTypes: DayType[] = [];

  for (const [location, level] of painByLocation) {
    const blocks = mapPainToBlocks(location, level);
    avoidFlags.push(...blocks.flags);
    blockedPatterns.push(...blocks.patterns);
    blockedDayTypes.push(...blocks.dayTypes);
  }

  // Убираем дубликаты
  const uniqueFlags = [...new Set(avoidFlags)];
  const uniquePatterns = [...new Set(blockedPatterns)];
  const uniqueDayTypes = [...new Set(blockedDayTypes)];

  // -------------------------------------------------------------------------
  // 6. TIME BUCKET (доступное время)
  // -------------------------------------------------------------------------
  
  let timeBucket = fallbackTimeBucket;
  let effectiveMinutes: number | null = null;
  
  if (checkin?.availableMinutes) {
    effectiveMinutes = checkin.availableMinutes;
    
    // Маппинг минут → timeBucket
    if (effectiveMinutes < 50) {
      timeBucket = 45;
    } else if (effectiveMinutes < 75) {
      timeBucket = 60;
    } else {
      timeBucket = 90;
    }
  }

  // -------------------------------------------------------------------------
  // 7. WARNINGS & NOTES (человеко-читаемые объяснения)
  // -------------------------------------------------------------------------
  
  const warnings: string[] = [];
  const notes: string[] = [];

  // Боль warnings
  if (checkin?.pain && checkin.pain.length > 0) {
    const painLocationNames: Record<string, string> = {
      shoulder: "плечо",
      elbow: "локоть",
      wrist: "запястье / кисть",
      neck: "шея",
      lower_back: "поясница",
      hip: "тазобедренный сустав",
      knee: "колено",
      ankle: "голеностоп / стопа",
    };
    
    const painDesc = checkin.pain
      .map(p => {
        const name = painLocationNames[p.location] || p.location;
        return `${name} (${p.level}/10)`;
      })
      .join(", ");
    warnings.push(`Боль: ${painDesc}. Избегай дискомфорта, снижай веса при необходимости.`);
  }

  // Стресс warnings
  if (checkin?.stress === "very_high") {
    warnings.push("😰 Очень высокий стресс. Сфокусируйся на технике, избегай максимальных весов.");
  } else if (checkin?.stress === "high") {
    warnings.push("😓 Высокий стресс. Снизь интенсивность если нужно.");
  }

  // Сон/энергия notes
  if (checkin?.energy === "low" && checkin?.sleep === "poor") {
    reasons.push("🔋 Низкая энергия и плохой сон");
  } else if (checkin?.energy === "low") {
    reasons.push("🔋 Низкая энергия");
  } else if (checkin?.sleep === "poor") {
    reasons.push("😴 Плохой сон");
  }

  if (checkin?.stress === "very_high") {
    reasons.push("😰 Очень высокий стресс");
  }

  // Intent notes
  if (intent === "light") {
    notes.push("Тренировка облегчена из-за низкой энергии/сна. Фокус на технике.");
  } else if (intent === "hard") {
    notes.push("Высокая готовность — целимся в верхний диапазон повторений.");
  }

  // Time notes
  if (effectiveMinutes && effectiveMinutes < fallbackTimeBucket) {
    notes.push(`⏱️ Доступное время: ${effectiveMinutes} мин. План адаптирован.`);
  }

  // -------------------------------------------------------------------------
  // 8. RETURN READINESS
  // -------------------------------------------------------------------------
  
  const result = {
    intent,
    severity,
    severityScore,
    maxPainLevel,
    painByLocation,
    avoidFlags: uniqueFlags,
    blockedPatterns: uniquePatterns,
    blockedDayTypes: uniqueDayTypes,
    timeBucket,
    effectiveMinutes,
    warnings,
    notes,
    reasons,
  };

  console.log("\n✅ [READINESS RESULT]:");
  console.log(`  Intent: ${result.intent} (score ${result.severityScore})`);
  console.log(`  Severity: ${result.severity}`);
  console.log(`  Max Pain: ${result.maxPainLevel}/10`);
  console.log(`  Time: ${result.timeBucket}min (effective: ${result.effectiveMinutes ?? 'N/A'})`);
  console.log(`  Avoid: [${result.avoidFlags.join(', ')}]`);
  console.log(`  Blocked Patterns: [${result.blockedPatterns.join(', ')}]`);
  console.log(`  Blocked Days: [${result.blockedDayTypes.join(', ')}]`);
  console.log(`  Warnings: ${result.warnings.length}`);
  console.log(`  Notes: ${result.notes.length}`);
  console.log("=========================================\n");

  return result;
}

// ============================================================================
// HELPER: Map pain location to blocks
// ============================================================================

function mapPainToBlocks(location: string, level: number): {
  flags: JointFlag[];
  patterns: string[];
  dayTypes: DayType[];
} {
  const flags: JointFlag[] = [];
  const patterns: string[] = [];
  const dayTypes: DayType[] = [];

  const loc = location.toLowerCase();

  // Шея
  if (loc.includes("neck") || loc.includes("шея") || loc.includes("шей")) {
    // Флаг добавляем только при реальной боли
    if (level >= 4) {
      flags.push("shoulder_sensitive");
    }
    
    // ИСПРАВЛЕНО: >=6 для overhead (не 4)
    if (level >= 6) {
      patterns.push("vertical_push", "overhead_press");
    }
    
    // L3 (8-10): блокируем день только при критической боли
    if (level >= 8) {
      dayTypes.push("push", "upper");
    }
  }

  // Плечо
  if (loc.includes("shoulder") || loc.includes("плечо")) {
    flags.push("shoulder_sensitive");
    
    if (level >= 4) {
      patterns.push("vertical_push", "overhead_press");
    }
    
    if (level >= 7) {
      dayTypes.push("push", "upper");
    }
  }

  // Локоть
  if (loc.includes("elbow") || loc.includes("локоть")) {
    flags.push("elbow_sensitive");
    
    if (level >= 4) {
      patterns.push("horizontal_push", "vertical_push");
    }
    
    if (level >= 7) {
      dayTypes.push("push", "upper");
    }
  }

  // Запястье
  if (loc.includes("wrist") || loc.includes("запястье") || loc.includes("кисть")) {
    flags.push("wrist_sensitive");
    
    if (level >= 4) {
      patterns.push("horizontal_push", "vertical_push");
    }
    
    if (level >= 7) {
      dayTypes.push("push", "upper");
    }
  }

  // Спина/поясница
  if (loc.includes("back") || loc.includes("спина") || loc.includes("поясница")) {
    flags.push("low_back_sensitive");
    
    if (level >= 4) {
      patterns.push("hinge", "squat");
    }
    
    if (level >= 7) {
      dayTypes.push("legs", "lower");
    }
  }

  // Колено
  if (loc.includes("knee") || loc.includes("колен")) {
    flags.push("knee_sensitive");
    
    if (level >= 4) {
      patterns.push("squat", "lunge");
    }
    
    if (level >= 7) {
      dayTypes.push("legs", "lower");
    }
  }

  // Таз/бедро
  if (loc.includes("hip") || loc.includes("таз") || loc.includes("бедр")) {
    flags.push("hip_sensitive");
    
    if (level >= 4) {
      patterns.push("hinge", "lunge");
    }
    
    if (level >= 7) {
      dayTypes.push("legs", "lower");
    }
  }

  // Голеностоп
  if (loc.includes("ankle") || loc.includes("голеностоп") || loc.includes("стоп")) {
    // ИСПРАВЛЕНО: не блокируем весь legs день, только конкретные паттерны
    if (level >= 4) {
      patterns.push("lunge"); // Lunges требуют стабильности голеностопа
    }
    
    if (level >= 7) {
      // При сильной боли добавляем squat (глубокая дорсифлексия)
      patterns.push("squat");
      // НЕ блокируем весь legs день - можно делать тренажёры, hip-dominant движения
    }
  }

  return { flags, patterns, dayTypes };
}

// ============================================================================
// HELPER: Translate pain location to Russian
// ============================================================================

export function translateLocation(location: string): string {
  const map: Record<string, string> = {
    shoulder: "плечо",
    elbow: "локоть",
    wrist: "запястье / кисть",
    neck: "шея",
    lower_back: "поясница",
    hip: "тазобедренный сустав",
    knee: "колено",
    ankle: "голеностоп / стопа",
    // Legacy aliases
    back: "спина",
    low_back: "поясница",
    arm: "рука",
  };

  return map[location.toLowerCase()] || location;
}
