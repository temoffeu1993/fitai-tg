// testRealUsers.ts
// ============================================================================
// РЕАЛЬНЫЙ ТЕСТ: Прогон различных профилей пользователей
// ============================================================================

import { generateWorkoutDay, generateWeekPlan, type UserProfile, type CheckInData } from "./workoutDayGenerator.js";
import { NORMALIZED_SCHEMES } from "./normalizedSchemes.js";
import { createMesocycle } from "./mesocycleEngine.js";
import { computeReadiness } from "./readiness.js";

// ============================================================================
// ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ
// ============================================================================

// РЕАЛЬНЫЕ профили из онбординга (только gym_full, только существующие схемы)
const USER_PROFILES: Array<{ name: string; profile: UserProfile }> = [
  {
    name: "Новичок женщина набор 3д 60мин",
    profile: {
      experience: "beginner",
      goal: "build_muscle",
      daysPerWeek: 3,
      timeBucket: 60,
      equipment: "gym_full",
      sex: "female",
    },
  },
  {
    name: "Средний мужчина набор 4д 90мин",
    profile: {
      experience: "intermediate",
      goal: "build_muscle",
      daysPerWeek: 4,
      timeBucket: 90,
      equipment: "gym_full",
      sex: "male",
    },
  },
  {
    name: "Средний мужчина набор 5д 60мин",
    profile: {
      experience: "intermediate",
      goal: "build_muscle",
      daysPerWeek: 5,
      timeBucket: 60,
      equipment: "gym_full",
      sex: "male",
    },
  },
  {
    name: "Продвинутый мужчина сила 5д 90мин",
    profile: {
      experience: "advanced",
      goal: "strength",
      daysPerWeek: 5,
      timeBucket: 90,
      equipment: "gym_full",
      sex: "male",
    },
  },
  {
    name: "Продвинутый мужчина набор 6д 90мин",
    profile: {
      experience: "advanced",
      goal: "build_muscle",
      daysPerWeek: 6,
      timeBucket: 90,
      equipment: "gym_full",
      sex: "male",
    },
  },
  {
    name: "Средний женщина ягодицы 4д 60мин",
    profile: {
      experience: "intermediate",
      goal: "lower_body_focus",
      daysPerWeek: 4,
      timeBucket: 60,
      equipment: "gym_full",
      sex: "female",
    },
  },
  {
    name: "Продвинутый женщина ягодицы 5д 60мин",
    profile: {
      experience: "advanced",
      goal: "lower_body_focus",
      daysPerWeek: 5,
      timeBucket: 60,
      equipment: "gym_full",
      sex: "female",
    },
  },
];

// ============================================================================
// ЧЕК-ИНЫ
// ============================================================================

const CHECK_INS: Array<{ name: string; checkin: CheckInData }> = [
  {
    name: "Идеальное состояние",
    checkin: {
      energy: "high",
      sleep: "good",
      stress: "low",
      pain: [],
      soreness: [],
    },
  },
  {
    name: "Низкая энергия после плохого сна",
    checkin: {
      energy: "low",
      sleep: "poor",
      stress: "medium",
      pain: [],
      soreness: [],
    },
  },
  {
    name: "Боль в плече средняя",
    checkin: {
      energy: "medium",
      sleep: "ok",
      stress: "low",
      pain: [{ location: "shoulder", level: 5 }],
      soreness: [],
    },
  },
  {
    name: "Боль в колене сильная + стресс",
    checkin: {
      energy: "low",
      sleep: "ok",
      stress: "high",
      pain: [{ location: "knee", level: 7 }],
      soreness: [],
    },
  },
  {
    name: "Множественные боли",
    checkin: {
      energy: "low",
      sleep: "poor",
      stress: "very_high",
      pain: [
        { location: "lower_back", level: 6 },
        { location: "shoulder", level: 4 },
      ],
      soreness: ["legs", "back"],
    },
  },
];

// ============================================================================
// ФУНКЦИЯ АНАЛИЗА ТРЕНИРОВКИ
// ============================================================================

function analyzeWorkout(workout: any, profile: UserProfile, checkin?: CheckInData) {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // NEW J: effectiveRequired coverage check
  const dayLabel = workout.dayLabel || "";
  const schemeRequired = workout.schemeRequired || []; // Would need to pass this
  const effectiveRequired = workout.effectiveRequired || []; // Would need to pass this
  
  if (schemeRequired.length > 0) {
    const coveredPatterns = new Set<string>();
    workout.exercises.forEach((ex: any) => {
      ex.coversPatterns?.forEach((p: string) => coveredPatterns.add(p));
    });
    
    const missingRequired = effectiveRequired.filter((p: string) => !coveredPatterns.has(p));
    if (missingRequired.length > 0) {
      issues.push(`Missing required patterns: ${missingRequired.join(", ")}`);
    }
    
    console.log(`\n  ✅ Required coverage: ${effectiveRequired.length - missingRequired.length}/${effectiveRequired.length} patterns`);
  }
  
  // NEW J: Time utilization check
  const timeSlot = profile.timeBucket;
  const duration = workout.estimatedDuration;
  const utilization = (duration / timeSlot) * 100;
  
  console.log(`  ⏱️  Time utilization: ${duration}/${timeSlot}min (${utilization.toFixed(0)}%)`);
  
  if (timeSlot === 90 && duration < 70) {
    warnings.push(`Under-utilizing 90min slot: only ${duration}min`);
  }
  if (duration > timeSlot * 1.1) {
    issues.push(`Over time budget: ${duration}min > ${timeSlot}min`);
  }
  
  // АНАЛИЗ ОБЪЁМА ПО МЫШЦАМ (для первого intermediate 90min)
  if (profile.experience === "intermediate" && profile.timeBucket === 90 && profile.goal === "build_muscle") {
    const muscleVolume = new Map<string, number>();
    
    console.log("\n  📊 ДЕТАЛИ ПО МЫШЦАМ:");
    workout.exercises.forEach((ex: any, i: number) => {
      console.log(`     ${i + 1}. ${ex.exercise.name} (${ex.sets} подходов)`);
      console.log(`        Primary: ${ex.exercise.primaryMuscles.join(", ")}`);
      
      // Считаем объём по мышцам
      for (const muscle of ex.exercise.primaryMuscles) {
        muscleVolume.set(muscle, (muscleVolume.get(muscle) || 0) + ex.sets);
      }
    });
    
    console.log("\n  📊 ОБЪЁМ ПО МЫШЦАМ (за эту тренировку):");
    const sorted = Array.from(muscleVolume.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([muscle, sets]) => {
      console.log(`     ${muscle.padEnd(15)}: ${sets} подходов`);
    });
    console.log("");
  }

  // 1. Проверка объёма
  const { experience } = profile;
  const timeBucket = profile.timeBucket;

  // Ожидаемые диапазоны упражнений (ПРОФЕССИОНАЛЬНЫЕ СТАНДАРТЫ)
  // Jeff Nippard, Greg Nuckols, Mike Israetel: 6-8 ex (60min), 7-9 ex (90min)
  const expectedExercises: Record<string, { min: number; max: number }> = {
    "beginner-45": { min: 4, max: 6 },
    "beginner-60": { min: 5, max: 7 },
    "beginner-90": { min: 6, max: 8 },
    "intermediate-45": { min: 5, max: 7 },
    "intermediate-60": { min: 6, max: 8 },
    "intermediate-90": { min: 7, max: 9 },  // ✅ Правильно
    "advanced-45": { min: 6, max: 8 },
    "advanced-60": { min: 7, max: 9 },
    "advanced-90": { min: 7, max: 9 },  // ИСПРАВЛЕНО: было 9-10
  };

  const key = `${experience}-${timeBucket}`;
  const expected = expectedExercises[key];

  if (expected) {
    if (workout.totalExercises < expected.min) {
      issues.push(`Слишком мало упражнений: ${workout.totalExercises} (ожидается ${expected.min}-${expected.max})`);
    }
    if (workout.totalExercises > expected.max) {
      warnings.push(`Много упражнений: ${workout.totalExercises} (ожидается ${expected.min}-${expected.max})`);
    }
  }

  // 2. Проверка подходов (ПРОФЕССИОНАЛЬНЫЕ СТАНДАРТЫ)
  // 60 мин: 15-20 sets, 90 мин: 18-24 sets (научные данные)
  const expectedSets: Record<string, { min: number; max: number }> = {
    beginner: { min: 12, max: 18 },  // Консервативно для новичков ✅
    intermediate: { min: 15, max: 24 },  // ИСПРАВЛЕНО: было 18-25
    advanced: { min: 18, max: 26 },  // ИСПРАВЛЕНО: было 22-30 (завышено!)
  };

  const expectedSetRange = expectedSets[experience];
  if (expectedSetRange) {
    if (workout.totalSets < expectedSetRange.min) {
      issues.push(`Слишком мало подходов: ${workout.totalSets} (ожидается ${expectedSetRange.min}-${expectedSetRange.max})`);
    }
    if (workout.totalSets > expectedSetRange.max) {
      issues.push(`Слишком много подходов: ${workout.totalSets} (ожидается ${expectedSetRange.min}-${expectedSetRange.max})`);
    }
  }

  // 3. Проверка времени
  const timeBuffer = timeBucket * 1.2; // +20% допуск
  if (workout.estimatedDuration > timeBuffer) {
    issues.push(`Тренировка слишком долгая: ${workout.estimatedDuration}мин (доступно ${timeBucket}мин)`);
  }

  // 4. Проверка упражнений
  const exerciseIds = new Set<string>();
  const patterns = new Set<string>();

  for (const ex of workout.exercises) {
    // Дубликаты упражнений
    if (exerciseIds.has(ex.exercise.id)) {
      issues.push(`ДУБЛИКАТ упражнения: ${ex.exercise.name}`);
    }
    exerciseIds.add(ex.exercise.id);

    // Собираем паттерны
    for (const pattern of ex.exercise.patterns) {
      patterns.add(pattern);
    }

    // Проверка подходов и повторений
    if (ex.sets < 1 || ex.sets > 6) {
      issues.push(`Странное количество подходов для ${ex.exercise.name}: ${ex.sets}`);
    }

    if (ex.repsRange[0] > ex.repsRange[1]) {
      issues.push(`Неверный диапазон повторений для ${ex.exercise.name}: ${ex.repsRange[0]}-${ex.repsRange[1]}`);
    }

    // Проверка отдыха
    if (ex.restSec < 30 || ex.restSec > 300) {
      warnings.push(`Странный отдых для ${ex.exercise.name}: ${ex.restSec}с`);
    }
  }

  // 5. Проверка адаптации к чекину
  if (checkin) {
    // Если боль в плече - не должно быть overhead_press
    if (checkin.pain?.some(p => p.location === "shoulder" && p.level >= 5)) {
      const hasOverhead = workout.exercises.some((ex: any) =>
        ex.exercise.patterns.includes("vertical_push")
      );
      if (hasOverhead) {
        issues.push(`Боль в плече ${checkin.pain.find(p => p.location === "shoulder")?.level}/10, но есть жимы над головой!`);
      }
    }

    // Если боль в колене - не должно быть приседаний
    if (checkin.pain?.some(p => p.location === "knee" && p.level >= 6)) {
      const hasSquat = workout.exercises.some((ex: any) =>
        ex.exercise.patterns.includes("squat")
      );
      if (hasSquat) {
        issues.push(`Боль в колене ${checkin.pain.find(p => p.location === "knee")?.level}/10, но есть приседания!`);
      }
    }

    // Низкая энергия + плохой сон = должен быть light intent
    if (checkin.energy === "low" && checkin.sleep === "poor") {
      if (workout.intent !== "light") {
        warnings.push(`Низкая энергия + плохой сон, но intent = ${workout.intent} (ожидается light)`);
      }
    }
  }

  // 6. Проверка разнообразия паттернов
  if (workout.dayFocus.includes("Push") || workout.dayFocus.includes("Толкающ")) {
    if (!patterns.has("horizontal_push") && !patterns.has("incline_push")) {
      warnings.push(`Push day без горизонтальных/наклонных жимов`);
    }
  }

  return { issues, warnings };
}

// ============================================================================
// ФУНКЦИЯ АНАЛИЗА НЕДЕЛИ
// ============================================================================

function analyzeWeek(weekPlan: any[], profile: UserProfile) {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Собираем статистику по неделе
  const totalExercises = weekPlan.reduce((sum, day) => sum + day.totalExercises, 0);
  const totalSets = weekPlan.reduce((sum, day) => sum + day.totalSets, 0);
  const totalMinutes = weekPlan.reduce((sum, day) => sum + day.estimatedDuration, 0);

  // Проверка на дубликаты упражнений между днями
  const allExerciseIds = new Map<string, number>();

  for (const day of weekPlan) {
    for (const ex of day.exercises) {
      const id = ex.exercise.id;
      allExerciseIds.set(id, (allExerciseIds.get(id) || 0) + 1);
    }
  }

  // Ищем упражнения которые повторяются слишком часто
  for (const [id, count] of allExerciseIds.entries()) {
    if (count > 2 && profile.daysPerWeek >= 4) {
      const ex = weekPlan.flatMap(d => d.exercises).find((e: any) => e.exercise.id === id);
      warnings.push(`Упражнение "${ex?.exercise?.name}" встречается ${count} раз за неделю (много для ${profile.daysPerWeek}д программы)`);
    }
  }

  // Проверка баланса Push/Pull
  let pushSets = 0;
  let pullSets = 0;

  for (const day of weekPlan) {
    for (const ex of day.exercises) {
      const patterns = ex.exercise.patterns;
      if (patterns.some((p: string) => p.includes("push"))) {
        pushSets += ex.sets;
      }
      if (patterns.some((p: string) => p.includes("pull"))) {
        pullSets += ex.sets;
      }
    }
  }

  // Должно быть примерно 1:1 или 2:3 (pull чуть больше)
  if (pushSets > 0 && pullSets > 0) {
    const ratio = pushSets / pullSets;
    if (ratio > 1.3) {
      warnings.push(`Дисбаланс Push/Pull: ${pushSets} push vs ${pullSets} pull (ratio ${ratio.toFixed(2)}). Pull должно быть больше или равно.`);
    }
  }

  return {
    issues,
    warnings,
    stats: {
      totalExercises,
      totalSets,
      totalMinutes,
      avgExercisesPerDay: (totalExercises / weekPlan.length).toFixed(1),
      avgSetsPerDay: (totalSets / weekPlan.length).toFixed(1),
      pushSets,
      pullSets,
      ratio: pullSets > 0 ? (pushSets / pullSets).toFixed(2) : "N/A",
    },
  };
}

// ============================================================================
// ЗАПУСК ТЕСТОВ
// ============================================================================

console.log("╔════════════════════════════════════════════════════════════════╗");
console.log("║  ТЕСТ РЕАЛЬНЫХ ВАРИАЦИЙ ПОЛЬЗОВАТЕЛЕЙ                         ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

let totalTests = 0;
let totalIssues = 0;
let totalWarnings = 0;

// Тест 1: Недельные планы для разных профилей (БЕЗ чекина)
console.log("\n📅 ТЕСТ 1: НЕДЕЛЬНЫЕ ПЛАНЫ (базовая генерация без чекина)\n");
console.log("=".repeat(80));

for (const { name, profile } of USER_PROFILES) {
  totalTests++;

  console.log(`\n🧑 ${name}`);
  console.log(`   ${profile.experience} | ${profile.goal} | ${profile.daysPerWeek}д/нед | ${profile.timeBucket}мин | ${profile.equipment}`);

  // Находим подходящую схему
  const scheme = NORMALIZED_SCHEMES.find(
    s =>
      s.daysPerWeek === profile.daysPerWeek &&
      s.goals.includes(profile.goal) &&
      s.experienceLevels.includes(profile.experience)
  );

  if (!scheme) {
    console.log(`   ❌ Не найдена подходящая схема!`);
    totalIssues++;
    continue;
  }

  console.log(`   📋 Схема: ${scheme.russianName}`);

  // Генерируем мезоцикл
  const mesocycle = createMesocycle({ userId: "test", goal: profile.goal });

  // Генерируем недельный план
  const weekPlan = generateWeekPlan({
    scheme,
    userProfile: profile,
    mesocycle,
    history: { recentExerciseIds: [] },
  });

  console.log(`   ✅ Сгенерировано ${weekPlan.length} дней\n`);

  // Анализируем неделю
  const weekAnalysis = analyzeWeek(weekPlan, profile);

  console.log(`   📊 Статистика недели:`);
  console.log(`      Всего упражнений: ${weekAnalysis.stats.totalExercises}`);
  console.log(`      Всего подходов: ${weekAnalysis.stats.totalSets}`);
  console.log(`      Среднее упр/день: ${weekAnalysis.stats.avgExercisesPerDay}`);
  console.log(`      Среднее подходов/день: ${weekAnalysis.stats.avgSetsPerDay}`);
  console.log(`      Push/Pull баланс: ${weekAnalysis.stats.pushSets}/${weekAnalysis.stats.pullSets} (${weekAnalysis.stats.ratio})`);

  // Выводим каждый день
  for (let i = 0; i < weekPlan.length; i++) {
    const day = weekPlan[i];
    console.log(`\n   День ${i + 1}: ${day.dayLabel} (${day.dayFocus})`);
    console.log(`      Intent: ${day.intent} | Упражнений: ${day.totalExercises} | Подходов: ${day.totalSets} | ~${day.estimatedDuration}мин`);

    // Анализируем день
    const dayAnalysis = analyzeWorkout(day, profile);

    if (dayAnalysis.issues.length > 0) {
      console.log(`      ❌ ПРОБЛЕМЫ:`);
      dayAnalysis.issues.forEach(issue => console.log(`         - ${issue}`));
      totalIssues += dayAnalysis.issues.length;
    }

    if (dayAnalysis.warnings.length > 0) {
      console.log(`      ⚠️  ПРЕДУПРЕЖДЕНИЯ:`);
      dayAnalysis.warnings.forEach(warn => console.log(`         - ${warn}`));
      totalWarnings += dayAnalysis.warnings.length;
    }

    // Показываем упражнения
    console.log(`      Упражнения:`);
    day.exercises.forEach((ex: any, idx: number) => {
      console.log(`         ${idx + 1}. ${ex.exercise.name} - ${ex.sets}×${ex.repsRange[0]}-${ex.repsRange[1]}, ${ex.restSec}с (${ex.role})`);
    });
  }

  // Анализ недели
  if (weekAnalysis.issues.length > 0) {
    console.log(`\n   ❌ ПРОБЛЕМЫ НЕДЕЛИ:`);
    weekAnalysis.issues.forEach(issue => console.log(`      - ${issue}`));
    totalIssues += weekAnalysis.issues.length;
  }

  if (weekAnalysis.warnings.length > 0) {
    console.log(`\n   ⚠️  ПРЕДУПРЕЖДЕНИЯ НЕДЕЛИ:`);
    weekAnalysis.warnings.forEach(warn => console.log(`      - ${warn}`));
    totalWarnings += weekAnalysis.warnings.length;
  }

  console.log("\n" + "-".repeat(80));
}

// Тест 2: Адаптация к чекинам (один день с разными чекинами)
console.log("\n\n🏋️ ТЕСТ 2: АДАПТАЦИЯ К РАЗНЫМ ЧЕК-ИНАМ\n");
console.log("=".repeat(80));

const testProfile = USER_PROFILES[1].profile; // Intermediate build_muscle
const testScheme = NORMALIZED_SCHEMES.find(
  s => s.daysPerWeek === 4 && s.goals.includes("build_muscle")
);

if (testScheme) {
  console.log(`\nПрофиль: ${USER_PROFILES[1].name}`);
  console.log(`Схема: ${testScheme.russianName}`);
  console.log(`Тестируем день 0: ${testScheme.days[0].label}\n`);

  for (const { name, checkin } of CHECK_INS) {
    totalTests++;

    console.log(`\n📋 Чекин: ${name}`);
    console.log(`   Энергия: ${checkin.energy} | Сон: ${checkin.sleep} | Стресс: ${checkin.stress}`);
    if (checkin.pain && checkin.pain.length > 0) {
      console.log(`   Боль: ${checkin.pain.map(p => `${p.location} (${p.level}/10)`).join(", ")}`);
    }

    // Вычисляем readiness из чекина
    const readiness = computeReadiness({
      checkin,
      fallbackTimeBucket: testProfile.timeBucket,
    });

    const workout = generateWorkoutDay({
      scheme: testScheme,
      dayIndex: 0,
      userProfile: testProfile,
      readiness,
      history: { recentExerciseIds: [] },
    });

    console.log(`   ✅ Сгенерирована тренировка: ${workout.dayLabel}`);
    console.log(`      Intent: ${workout.intent} | Упражнений: ${workout.totalExercises} | Подходов: ${workout.totalSets} | ~${workout.estimatedDuration}мин`);

    // Анализ
    const analysis = analyzeWorkout(workout, testProfile, checkin);

    if (analysis.issues.length > 0) {
      console.log(`      ❌ ПРОБЛЕМЫ:`);
      analysis.issues.forEach(issue => console.log(`         - ${issue}`));
      totalIssues += analysis.issues.length;
    }

    if (analysis.warnings.length > 0) {
      console.log(`      ⚠️  ПРЕДУПРЕЖДЕНИЯ:`);
      analysis.warnings.forEach(warn => console.log(`         - ${warn}`));
      totalWarnings += analysis.warnings.length;
    }

    if (workout.adaptationNotes && workout.adaptationNotes.length > 0) {
      console.log(`      📝 Адаптация:`);
      workout.adaptationNotes.forEach((note: string) => console.log(`         - ${note}`));
    }

    if (workout.warnings && workout.warnings.length > 0) {
      console.log(`      ⚠️  Системные предупреждения:`);
      workout.warnings.forEach((warn: string) => console.log(`         - ${warn}`));
    }

    console.log(`\n      Упражнения:`);
    workout.exercises.forEach((ex: any, idx: number) => {
      const painNote = checkin.pain?.some(p =>
        ex.exercise.jointFlags?.includes(`${p.location}_sensitive`)
      ) ? " ⚠️ МОЖЕТ БОЛЕТЬ!" : "";
      console.log(`         ${idx + 1}. ${ex.exercise.name} - ${ex.sets}×${ex.repsRange[0]}-${ex.repsRange[1]}, ${ex.restSec}с${painNote}`);
    });

    console.log("\n" + "-".repeat(80));
  }
}

// Финальный отчёт
console.log("\n\n╔════════════════════════════════════════════════════════════════╗");
console.log("║  ФИНАЛЬНЫЙ ОТЧЁТ                                               ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

console.log(`Всего тестов: ${totalTests}`);
console.log(`Найдено проблем: ${totalIssues}`);
console.log(`Найдено предупреждений: ${totalWarnings}`);

if (totalIssues === 0) {
  console.log(`\n✅ ВСЕ ТЕСТЫ ПРОШЛИ БЕЗ КРИТИЧЕСКИХ ПРОБЛЕМ!`);
} else {
  console.log(`\n❌ ЕСТЬ ПРОБЛЕМЫ! Требуется доработка.`);
}

if (totalWarnings > 0) {
  console.log(`⚠️  Есть предупреждения - стоит проверить.`);
}

console.log("\n");
