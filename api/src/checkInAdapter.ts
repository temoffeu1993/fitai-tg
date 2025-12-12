// Анализ чекина и адаптация тренировки

import { DayTemplate, ExerciseBlock, MovementPattern } from "./workoutTemplates.js";

// Типы для чекина
export type CheckInData = {
  sleepHours: number;              // Сколько спал (часов)
  energyLevel: "low" | "medium" | "high"; // Уровень энергии
  stressLevel: "low" | "medium" | "high" | "very_high"; // Уровень стресса
  mood: "bad" | "neutral" | "good"; // Настроение
  pain?: Array<{                   // Боли/дискомфорт
    location: string;              // Где болит (плечо, колено и т.п.)
    level: number;                 // Уровень боли 1-10
  }>;
  injuries?: string[];             // Активные травмы
  menstrualCycle?: {              // Для женщин
    phase: "menstruation" | "follicular" | "ovulation" | "luteal";
    symptoms: string[];            // Симптомы (cramps, fatigue и т.п.)
  };
  notes?: string;                  // Дополнительные заметки
};

// Режим тренировки
export type WorkoutMode = "skip" | "recovery" | "light" | "normal" | "push";

// Результат анализа чекина
export type CheckInAnalysis = {
  mode: WorkoutMode;              // Режим тренировки
  shouldSkip: boolean;            // Пропустить тренировку?
  shouldSwitchDay: boolean;       // Переключить на другой день?
  volumeMultiplier: number;       // Множитель объёма (0.5 = -50%)
  intensityAdjustment: string;    // Корректировка интенсивности
  restMultiplier: number;         // Множитель отдыха (1.5 = +50%)
  maxExercises: number;           // Максимум упражнений
  excludedZones: string[];        // Исключить зоны (плечо, колено и т.п.)
  avoidExercises: MovementPattern[]; // Избегать упражнений
  preferExercises?: MovementPattern[]; // Предпочитать упражнения
  recommendation: string;         // Рекомендация пользователю
  warnings: string[];             // Предупреждения
};

/**
 * Анализирует чекин и выдает рекомендации по адаптации тренировки
 */
export function analyzeCheckIn(
  checkIn: CheckInData,
  dayTemplate?: DayTemplate
): CheckInAnalysis {
  
  const warnings: string[] = [];
  const excludedZones: string[] = [];
  const avoidExercises: MovementPattern[] = [];
  
  // ========== 1. АНАЛИЗ БОЛЕЙ И ТРАВМ ==========
  
  let maxPainLevel = 0;
  if (checkIn.pain && checkIn.pain.length > 0) {
    maxPainLevel = Math.max(...checkIn.pain.map(p => p.level));
    
    // Критическая боль (8+) → пропуск
    if (maxPainLevel >= 8) {
      return {
        mode: "skip",
        shouldSkip: true,
        shouldSwitchDay: false,
        volumeMultiplier: 0,
        intensityAdjustment: "none",
        restMultiplier: 1,
        maxExercises: 0,
        excludedZones: [],
        avoidExercises: [],
        recommendation: `⚠️ Боль уровня ${maxPainLevel}/10 - слишком высокий риск. Рекомендуем полный отдых и консультацию врача.`,
        warnings: ["Высокий уровень боли - тренировка небезопасна"]
      };
    }
    
    // Анализируем каждую боль
    checkIn.pain.forEach(p => {
      const location = p.location.toLowerCase();
      
      // Боль в верхней части тела
      if (location.includes("плеч") || location.includes("лопатк")) {
        excludedZones.push("плечи", "верх");
        avoidExercises.push("overhead_press", "lateral_raise", "front_raise");
        warnings.push(`Боль в ${p.location} (${p.level}/10) - избегаем жимов над головой и махов`);
      }
      
      if (location.includes("локт")) {
        excludedZones.push("руки");
        avoidExercises.push("overhead_press", "triceps_extension", "biceps_curl");
        warnings.push(`Боль в локте - избегаем изоляции рук и тяжёлых жимов`);
      }
      
      if (location.includes("запяст")) {
        avoidExercises.push("overhead_press", "horizontal_press");
        warnings.push(`Боль в запястье - предпочитаем гантели и тренажёры`);
      }
      
      // Боль в нижней части тела
      if (location.includes("колен")) {
        excludedZones.push("ноги", "квадрицепсы");
        avoidExercises.push("squat_pattern", "lunge_pattern", "leg_extension");
        warnings.push(`Боль в колене (${p.level}/10) - избегаем приседаний и выпадов`);
      }
      
      if (location.includes("спин") || location.includes("позвоно")) {
        excludedZones.push("низ спины");
        avoidExercises.push("deadlift", "squat_pattern", "hip_hinge");
        warnings.push(`Боль в спине (${p.level}/10) - избегаем осевой нагрузки`);
      }
      
      if (location.includes("бедр") || location.includes("ягодиц")) {
        avoidExercises.push("hip_hinge", "hip_thrust");
        warnings.push(`Дискомфорт в ${p.location} - облегчаем тазовые упражнения`);
      }
    });
  }
  
  // ========== 2. АНАЛИЗ СНА И ЭНЕРГИИ ==========
  
  const sleepScore = Math.min(100, (checkIn.sleepHours / 7) * 100);
  const energyScores = { low: 30, medium: 70, high: 100 };
  const energyScore = energyScores[checkIn.energyLevel];
  const recoveryScore = (sleepScore + energyScore) / 2;
  
  // Критически плохое восстановление (< 30) → пропуск
  if (recoveryScore < 30) {
    return {
      mode: "skip",
      shouldSkip: true,
      shouldSwitchDay: false,
      volumeMultiplier: 0,
      intensityAdjustment: "none",
      restMultiplier: 1,
      maxExercises: 0,
      excludedZones,
      avoidExercises,
      recommendation: `😴 Вы спали всего ${checkIn.sleepHours}ч и энергия на нуле. Высокий риск травм и перетренированности. Сегодня лучше отдохнуть или сделать лёгкую прогулку 20-30 минут.`,
      warnings: [...warnings, "Критически низкое восстановление"]
    };
  }
  
  // ========== 3. АНАЛИЗ СТРЕССА ==========
  
  const stressScores = { low: 100, medium: 70, high: 40, very_high: 20 };
  const stressScore = stressScores[checkIn.stressLevel];
  
  if (stressScore < 50 && recoveryScore < 60) {
    warnings.push("Высокий стресс + плохое восстановление - риск перетренированности");
  }
  
  // ========== 4. МЕНСТРУАЛЬНЫЙ ЦИКЛ ==========
  
  if (checkIn.menstrualCycle) {
    if (checkIn.menstrualCycle.phase === "menstruation" 
        && checkIn.menstrualCycle.symptoms.length > 0) {
      // Месячные с симптомами
      avoidExercises.push("squat_pattern", "deadlift", "hip_hinge");
      warnings.push("Месячные с симптомами - избегаем тяжёлой осевой нагрузки");
    }
  }
  
  // ========== 5. ОПРЕДЕЛЕНИЕ РЕЖИМА ТРЕНИРОВКИ ==========
  
  let mode: WorkoutMode = "normal";
  let volumeMultiplier = 1.0;
  let intensityAdjustment = "normal";
  let restMultiplier = 1.0;
  let maxExercises = dayTemplate?.totalExercises || 5;
  
  if (recoveryScore < 40 || maxPainLevel >= 7) {
    // RECOVERY MODE
    mode = "recovery";
    volumeMultiplier = 0.5;  // -50% объёма
    intensityAdjustment = "reduce by 30-40%";
    restMultiplier = 1.5;    // +50% отдыха
    maxExercises = Math.max(2, Math.floor(maxExercises * 0.5));
    warnings.push("Восстановительный режим - минимальная нагрузка");
    
  } else if (recoveryScore < 60 || maxPainLevel >= 5 || stressScore < 50) {
    // LIGHT MODE
    mode = "light";
    volumeMultiplier = 0.7;  // -30% объёма
    intensityAdjustment = "reduce by 15-20%";
    restMultiplier = 1.3;    // +30% отдыха
    maxExercises = Math.max(3, Math.floor(maxExercises * 0.7));
    warnings.push("Облегчённый режим - фокус на технике и контроле");
    
  } else if (recoveryScore >= 80 && energyScore >= 90 && stressScore >= 70) {
    // PUSH MODE (можно дать больше)
    mode = "push";
    volumeMultiplier = 1.1;  // +10% объёма
    intensityAdjustment = "can push slightly harder";
    restMultiplier = 0.9;    // -10% отдыха
    warnings.push("Отличное состояние - можно работать интенсивнее");
  }
  
  // ========== 6. ПРОВЕРКА НА ПЕРЕКЛЮЧЕНИЕ ДНЯ ==========
  
  let shouldSwitchDay = false;
  
  // Если много исключённых зон и это критично для текущего дня
  if (dayTemplate) {
    const dayFocus = dayTemplate.exerciseBlocks[0]?.targetMuscles || [];
    const focusBlocked = dayFocus.some(muscle => 
      excludedZones.some(zone => muscle.toLowerCase().includes(zone.toLowerCase()))
    );
    
    if (focusBlocked && dayTemplate.adaptationRules.fallbackFocus) {
      shouldSwitchDay = true;
      warnings.push(`Основной фокус дня недоступен - рекомендуем ${dayTemplate.adaptationRules.fallbackFocus}`);
    }
  }
  
  // ========== 7. ФИНАЛЬНАЯ РЕКОМЕНДАЦИЯ ==========
  
  let recommendation = "";
  
  switch (mode) {
    case "recovery":
      recommendation = `🔵 Восстановительная тренировка: ${maxExercises} упражнений, легкие веса (-30-40%), больше отдыха. Фокус на движении и технике, не на результатах.`;
      break;
    case "light":
      recommendation = `🟡 Облегчённая тренировка: ${maxExercises} упражнений, умеренные веса (-15-20%), контролируемый темп. Слушай тело!`;
      break;
    case "normal":
      recommendation = `🟢 Нормальная тренировка по плану. ${warnings.length > 0 ? "С учётом ограничений." : "Вперёд!"}`;
      break;
    case "push":
      recommendation = `🟣 Отличное состояние! Можно немного добавить интенсивности или объёма. День для рекордов!`;
      break;
    default:
      recommendation = "Тренировка по плану";
  }
  
  return {
    mode,
    shouldSkip: false,
    shouldSwitchDay,
    volumeMultiplier,
    intensityAdjustment,
    restMultiplier,
    maxExercises,
    excludedZones,
    avoidExercises,
    recommendation,
    warnings
  };
}

/**
 * Адаптирует шаблон дня под результаты чекина
 */
export function adaptDayTemplate(
  template: DayTemplate,
  analysis: CheckInAnalysis
): DayTemplate {
  
  // Фильтруем упражнения, которые нужно избегать
  const adaptedBlocks: ExerciseBlock[] = template.exerciseBlocks
    .filter(block => {
      // Проверяем, не входит ли паттерн упражнения в список избегаемых
      if (analysis.avoidExercises.includes(block.movementPattern)) {
        // Если есть альтернатива и она не в списке избегаемых
        if (block.alternatives) {
          const safeAlternative = block.alternatives.find(
            alt => !analysis.avoidExercises.includes(alt)
          );
          if (safeAlternative) {
            // Меняем паттерн на безопасную альтернативу
            block.movementPattern = safeAlternative;
            return true;
          }
        }
        return false; // Убираем это упражнение
      }
      
      // Проверяем, не затрагивает ли упражнение исключённые зоны
      const touchesExcludedZone = block.targetMuscles.some(muscle =>
        analysis.excludedZones.some(zone => 
          muscle.toLowerCase().includes(zone.toLowerCase())
        )
      );
      
      return !touchesExcludedZone;
    })
    // Обрезаем до maxExercises
    .slice(0, analysis.maxExercises)
    // Адаптируем параметры
    .map(block => ({
      ...block,
      sets: Math.max(1, Math.round(block.sets * analysis.volumeMultiplier)),
      rest: Math.round(block.rest * analysis.restMultiplier),
      intensity: analysis.mode === "recovery" ? "light" : 
                 analysis.mode === "light" ? (block.intensity === "heavy" ? "moderate" : "light") :
                 block.intensity,
      notes: `${block.notes || ""}\n[АДАПТАЦИЯ: ${analysis.mode.toUpperCase()}]`.trim()
    }));
  
  // Пересчитываем общие параметры
  const totalSets = adaptedBlocks.reduce((sum, b) => sum + b.sets, 0);
  const avgRestPerSet = adaptedBlocks.reduce((sum, b) => sum + b.rest, 0) / adaptedBlocks.length;
  const estimatedDuration = template.warmup.duration + 
                           template.cooldown.duration +
                           totalSets * 3 + // среднее время на подход (3 мин)
                           Math.round((avgRestPerSet / 60) * totalSets);
  
  return {
    ...template,
    exerciseBlocks: adaptedBlocks,
    totalExercises: adaptedBlocks.length,
    totalSets,
    estimatedDuration: Math.round(estimatedDuration)
  };
}

