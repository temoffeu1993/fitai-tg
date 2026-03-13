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

import type { CheckInData } from "./workoutDayGenerator.js";
import type { JointFlag } from "./exerciseLibrary.js";
import type { TimeBucket } from "./normalizedSchemes.js";

// ============================================================================
// TYPES
// ============================================================================

export type Intent = "light" | "normal" | "hard";

export type Severity = "low" | "medium" | "high" | "critical";

export type DayType = "push" | "pull" | "legs" | "upper" | "lower" | "full_body" | "unknown";

export type CorePolicy = "required" | "optional";

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
  
  // Политика required patterns
  corePolicy: CorePolicy; // core required только если достаточно времени
  
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
  if (!checkin) {
    console.log("📋 Input: No check-in (using defaults)");
  } else {
    console.log("📋 Check-in input:");
    console.log(`   Sleep: ${checkin.sleep}`);
    console.log(`   Energy: ${checkin.energy}`);
    console.log(`   Stress: ${checkin.stress}`);
    if (checkin.pain && checkin.pain.length > 0) {
      console.log(`   Pain: ${checkin.pain.map(p => `${p.location}=${p.level}/10`).join(', ')}`);
    } else {
      console.log(`   Pain: none`);
    }
    if (typeof checkin.availableMinutes === "number" && Number.isFinite(checkin.availableMinutes)) {
      console.log(`   Available time: ${checkin.availableMinutes} min`);
    }
  }

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

  // -------------------------------------------------------------------------
  // 2. CUMULATIVE SEVERITY SCORE (кумулятивная оценка)
  // -------------------------------------------------------------------------
  
  let severityScore = 0;
  const reasons: string[] = [];

  console.log("\n📊 Scoring breakdown:");
  
  // Боль (главный фактор безопасности)
  let painScore = 0;
  if (maxPainLevel >= 9) {
    painScore = 6;
    severityScore += 6;
  } else if (maxPainLevel === 8) {
    painScore = 5;
    severityScore += 5;
  } else if (maxPainLevel === 7) {
    painScore = 4;
    severityScore += 4;
  } else if (maxPainLevel >= 5) {
    painScore = 2;
    severityScore += 2; // 5-6/10: умеренная боль
  } else if (maxPainLevel >= 4) {
    painScore = 1;
    severityScore += 1; // 4/10: лёгкая адаптация (было +2, завышало)
  }
  
  if (maxPainLevel > 0) {
    console.log(`   Pain (max ${maxPainLevel}/10): +${painScore}`);
  }
  
  // Мультизонная боль опаснее
  if (countL2Plus >= 2) {
    severityScore += 1;
    console.log(`   Multiple pain zones (${countL2Plus}): +1`);
  }

  // Сон
  let sleepScore = 0;
  if (!checkin) {
    // no checkin = neutral
  } else if (checkin.sleep === "poor") {
    sleepScore = 2;
    severityScore += 2;
  } else if (checkin.sleep === "fair") {
    sleepScore = 1;
    severityScore += 1;
  } else if (checkin.sleep === "ok") {
    sleepScore = 0;
    severityScore += 0;
  } else if (checkin.sleep === "good") {
    sleepScore = -1;
    severityScore -= 1;
  } else if (checkin.sleep === "excellent") {
    sleepScore = -2;
    severityScore -= 2;
  }
  
  if (checkin && sleepScore !== 0) {
    console.log(`   Sleep (${checkin.sleep}): ${sleepScore > 0 ? '+' : ''}${sleepScore}`);
  }

  // Энергия
  let energyScore = 0;
  if (checkin?.energy === "low") {
    energyScore = 2;
    severityScore += 2;
  } else if (checkin?.energy === "high") {
    energyScore = -1;
    severityScore -= 1;
  }
  
  if (checkin && energyScore !== 0) {
    console.log(`   Energy (${checkin.energy}): ${energyScore > 0 ? '+' : ''}${energyScore}`);
  }

  // Стресс
  let stressScore = 0;
  if (checkin?.stress === "very_high") {
    stressScore = 2;
    severityScore += 2;
  } else if (checkin?.stress === "high") {
    stressScore = 1;
    severityScore += 1;
  } else if (checkin?.stress === "low") {
    stressScore = -1;
    severityScore -= 1;
  }
  
  if (checkin && stressScore !== 0) {
    console.log(`   Stress (${checkin.stress}): ${stressScore > 0 ? '+' : ''}${stressScore}`);
  }
  
  console.log(`   → Total severity score: ${Math.round(severityScore * 10) / 10}`);

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
  } else if (severity === "low" && severityScore <= -3) {
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

  // Override 4: Если есть заблокированные паттерны (боль ≥ 4), не давать "hard"
  // Непоследовательно блокировать упражнения, но оставлять максимальную нагрузку
  if (uniquePatterns.length > 0 && intent === "hard") {
    intent = "normal";
    reasons.push("Есть болезненные зоны — оставляем нормальную интенсивность");
  }

  // -------------------------------------------------------------------------
  // 6. TIME BUCKET (доступное время)
  // -------------------------------------------------------------------------

  const warnings: string[] = [];
  const notes: string[] = [];

  let timeBucket = fallbackTimeBucket;
  let effectiveMinutes: number | null = null;
  
  if (typeof checkin?.availableMinutes === "number" && Number.isFinite(checkin.availableMinutes)) {
    effectiveMinutes = checkin.availableMinutes;
    
    // Маппинг минут → timeBucket
    if (effectiveMinutes < 50) {
      timeBucket = 45;
    } else if (effectiveMinutes < 75) {
      timeBucket = 60;
    } else {
      timeBucket = 90;
    }

    // Очень короткая сессия — short mode, не critical
    if (effectiveMinutes < 20) {
      timeBucket = 45;
      if (intent !== "light") {
        intent = "light";
        reasons.push("Доступно менее 20 минут — сокращённая облегчённая сессия");
      }
      notes.push("⏱ Доступно менее 20 минут — компактная тренировка");
    }
  }

  // -------------------------------------------------------------------------
  // 7. WARNINGS & NOTES (человеко-читаемые объяснения)
  // -------------------------------------------------------------------------

  // СОН
  if (checkin?.sleep === "poor") {
    warnings.push(
      "😴 Плохой сон может снизить восстановление и координацию. " +
      "План уже адаптирован мягче: держи спокойный темп и контроль техники."
    );
    reasons.push("😴 Плохой сон");
  } else if (checkin?.sleep === "fair") {
    notes.push("💤 Сон не идеальный. Слушай своё тело, не форсируй максимальные веса.");
  }

  // ЭНЕРГИЯ
  if (checkin?.energy === "low") {
    warnings.push(
      "🔋 Низкая энергия. План уже сделан легче: меньше пиковых усилий, больше контроля."
    );
    reasons.push("🔋 Низкая энергия");
  } else if (checkin?.energy === "high") {
    notes.push("⚡ Высокая энергия. Можно работать плотнее, сохраняя технику и запас 1–2 повтора.");
  }

  // СТРЕСС
  if (checkin?.stress === "very_high") {
    warnings.push(
      "😰 Очень высокий стресс. Тренировка поможет, но избегай максимальных весов. " +
      "Сфокусируйся на технике и дыхании."
    );
    reasons.push("😰 Очень высокий стресс");
  } else if (checkin?.stress === "high") {
    warnings.push("😓 Высокий стресс. План подстроен спокойнее: ровный темп, без гонки за рекордами.");
  } else if (checkin?.stress === "low") {
    notes.push("😌 Низкий стресс — отличное состояние для тренировки!");
  }

  // БОЛЬ
  if (checkin?.pain && checkin.pain.length > 0) {
    const painLocationNames: Record<string, string> = {
      shoulder: "плечо",
      elbow: "локоть",
      wrist: "запястье",
      neck: "шея",
      lower_back: "поясница",
      hip: "тазобедренный сустав",
      knee: "колено",
      ankle: "голеностоп",
    };
    
    const painDesc = checkin.pain
      .map(p => {
        const name = painLocationNames[p.location] || p.location;
        return `${name} (${p.level}/10)`;
      })
      .join(", ");
    
    if (maxPainLevel >= 7) {
      warnings.push(
        `🔴 Сильная боль: ${painDesc}. Упражнения адаптированы, но если боль усиливается — останови тренировку.`
      );
    } else if (maxPainLevel >= 4) {
      warnings.push(
        `⚠️ Боль: ${painDesc}. Упражнения подобраны с учётом этого. Избегай дискомфорта, снижай веса при необходимости.`
      );
    } else {
      notes.push(`💡 Лёгкий дискомфорт: ${painDesc}. Разминка и умеренная нагрузка помогут.`);
    }
  }

  // ВРЕМЯ
  if (effectiveMinutes !== null && effectiveMinutes < fallbackTimeBucket) {
    notes.push(
      `⏱️ Доступно ${effectiveMinutes} мин (обычно ${fallbackTimeBucket}). ` +
      `Подстроим тренировку под время, чтобы успеть спокойно и без спешки.`
    );
  }

  // КОМБИНАЦИИ (усиливают эффект)
  if (checkin?.energy === "low" && checkin?.sleep === "poor") {
    notes.push(
      "⚠️ Сочетание низкой энергии и плохого сна — сигнал организму. " +
      "Тренировка облегчена, но если совсем тяжело — лучше отдохни."
    );
  }

  // ОБЛЕГЧЁННЫЙ РЕЖИМ — предупреждение о весах
  if (intent === "light" && maxPainLevel < 7) {
    notes.push("📉 Рабочие веса снижены на ~15% из-за текущего состояния. Сосредоточься на технике.");
  }

  // DEFAULT для нейтрального состояния
  if (severity === 'low' && warnings.length === 0 && notes.length === 0) {
    notes.push("✅ Отличное самочувствие! Тренировка по плану.");
  }

  // -------------------------------------------------------------------------
  // 8. CORE POLICY (тренерская политика по core упражнениям)
  // -------------------------------------------------------------------------
  
  // Core required только если достаточно времени для полноценной тренировки
  // При коротких сессиях приоритет — главным движениям дня
  const corePolicy: CorePolicy = (effectiveMinutes !== null && effectiveMinutes < 40) || timeBucket === 45
    ? "optional"
    : "required";

  // -------------------------------------------------------------------------
  // 9. RETURN READINESS
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
    corePolicy,
    warnings,
    notes,
    reasons,
  };

  console.log("\n✅ [READINESS RESULT]:");
  console.log(`   Severity: ${result.severity.toUpperCase()} (score: ${result.severityScore})`);
  console.log(`   Intent: ${result.intent}`);
  console.log(`   Time bucket: ${result.timeBucket}min (available: ${result.effectiveMinutes ?? 'not specified'})`);
  
  if (result.maxPainLevel > 0) {
    console.log(`   Max pain: ${result.maxPainLevel}/10`);
  }
  
  console.log(`\n   🔧 TECHNICAL DETAILS:`);
  if (result.avoidFlags.length > 0) {
    console.log(`      Avoid flags: ${result.avoidFlags.join(', ')}`);
  }
  if (result.blockedPatterns.length > 0) {
    console.log(`      Blocked patterns: ${result.blockedPatterns.join(', ')}`);
  }
  if (result.blockedDayTypes.length > 0) {
    console.log(`      Blocked day types: ${result.blockedDayTypes.join(', ')}`);
  }
  if (result.avoidFlags.length === 0 && result.blockedPatterns.length === 0 && result.blockedDayTypes.length === 0) {
    console.log(`      No technical restrictions`);
  }
  
  console.log(`\n   💬 USER MESSAGES:`);
  if (result.warnings.length > 0) {
    console.log(`      ⚠️  WARNINGS (${result.warnings.length}):`);
    result.warnings.forEach(w => console.log(`         - ${w}`));
  }
  if (result.notes.length > 0) {
    console.log(`      📝 NOTES (${result.notes.length}):`);
    result.notes.forEach(n => console.log(`         - ${n}`));
  }
  if (result.warnings.length === 0 && result.notes.length === 0) {
    console.log(`      No messages (normal state)`);
  }
  
  console.log("=========================================\n");

  return result;
}

// ============================================================================
// HELPER: Normalize blocked patterns (handle aliases, deduplication)
// ============================================================================

/**
 * Преобразует список заблокированных паттернов в нормализованный Set
 * Для корректного вычисления effectiveRequired = schemeRequired - blocked
 */
export function normalizeBlockedPatterns(blocked: string[]): Set<string> {
  const normalized = new Set<string>();
  
  for (const pattern of blocked) {
    const p = pattern.toLowerCase().trim();
    normalized.add(p);
    
    // Обработка алиасов (если добавятся в будущем)
    // if (p === "overhead_press") normalized.add("vertical_push");
  }
  
  return normalized;
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
    // neck_sensitive — отсеивает шраги, upright row, farmer's carry и т.д.
    if (level >= 4) {
      flags.push("neck_sensitive");
    }
    // При сильной боли в шее — подключаем и shoulder_sensitive (overhead нагружает шею)
    if (level >= 6) {
      flags.push("shoulder_sensitive");
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
