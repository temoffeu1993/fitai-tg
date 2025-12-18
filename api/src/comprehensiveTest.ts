// comprehensiveTest.ts
// ============================================================================
// COMPREHENSIVE TEST: Real user variations + check-ins
// 
// Run: npx tsx api/src/comprehensiveTest.ts
// ============================================================================

import { recommendScheme, generateWorkoutDay, generateWeekPlan } from "./workoutDayGenerator.js";
import type { UserProfile, CheckInData, PainEntry } from "./workoutDayGenerator.js";
import { computeReadiness } from "./readiness.js";
import { decideStartAction } from "./checkinPolicy.js";

console.log("🧪 COMPREHENSIVE REAL-WORLD USER TEST\n");
console.log("=".repeat(100));

// ============================================================================
// TEST VARIATIONS
// ============================================================================

const testCases = [
  // 1. Новичок женщина, похудение, мало времени
  {
    name: "Новичок женщина, похудение, 45 мин",
    profile: {
      experience: "beginner" as const,
      goal: "lose_weight" as const,
      daysPerWeek: 3,
      timeBucket: 45,
      equipment: "gym_full" as const,
      sex: "female" as const,
    },
    checkins: [
      { name: "Норма", data: { energy: "medium", sleep: "good", stress: "low", pain: [], soreness: [] } },
      { name: "Плохой сон", data: { energy: "low", sleep: "poor", stress: "medium", pain: [], soreness: [] } },
      { name: "Мало времени", data: { energy: "medium", sleep: "good", stress: "low", pain: [], soreness: [], availableMinutes: 30 } },
    ]
  },

  // 2. Средний уровень мужчина, набор массы, полное время
  {
    name: "Intermediate мужчина, масса, 90 мин",
    profile: {
      experience: "intermediate" as const,
      goal: "build_muscle" as const,
      daysPerWeek: 4,
      timeBucket: 90,
      equipment: "gym_full" as const,
      sex: "male" as const,
    },
    checkins: [
      { name: "Отлично", data: { energy: "high", sleep: "good", stress: "low", pain: [], soreness: [] } },
      { name: "Боль в плече 7/10", data: { energy: "medium", sleep: "good", stress: "low", pain: [{ location: "shoulder", level: 7 }] as PainEntry[], soreness: [] } },
      { name: "Сильный стресс", data: { energy: "medium", sleep: "fair", stress: "very_high", pain: [], soreness: [] } },
    ]
  },

  // 3. Продвинутый, силовые, много времени
  {
    name: "Advanced мужчина, сила, 90 мин",
    profile: {
      experience: "advanced" as const,
      goal: "strength" as const,
      daysPerWeek: 4,
      timeBucket: 90,
      equipment: "gym_full" as const,
      sex: "male" as const,
    },
    checkins: [
      { name: "Супер форма", data: { energy: "high", sleep: "good", stress: "low", pain: [], soreness: [] } },
      { name: "Боль в колене 8/10", data: { energy: "medium", sleep: "good", stress: "low", pain: [{ location: "knee", level: 8 }] as PainEntry[], soreness: [] } },
      { name: "Комбо: стресс + усталость", data: { energy: "low", sleep: "poor", stress: "high", pain: [], soreness: [] } },
    ]
  },

  // 4. Женщина тонус, в зале
  {
    name: "Женщина, тонус, 60 мин",
    profile: {
      experience: "beginner" as const,
      goal: "general_fitness" as const,
      daysPerWeek: 3,
      timeBucket: 60,
      equipment: "gym_full" as const,
      sex: "female" as const,
    },
    checkins: [
      { name: "Норма", data: { energy: "medium", sleep: "good", stress: "low", pain: [], soreness: [] } },
      { name: "Боль в пояснице 6/10", data: { energy: "medium", sleep: "good", stress: "low", pain: [{ location: "lower_back", level: 6 }] as PainEntry[], soreness: [] } },
    ]
  },

  // 5. Мужчина, масса, мало времени (типичный офисный)
  {
    name: "Мужчина офисный, масса, 60 мин",
    profile: {
      experience: "intermediate" as const,
      goal: "build_muscle" as const,
      daysPerWeek: 3,
      timeBucket: 60,
      equipment: "gym_full" as const,
      sex: "male" as const,
    },
    checkins: [
      { name: "Обычный день", data: { energy: "medium", sleep: "fair", stress: "medium", pain: [], soreness: [] } },
      { name: "Сегодня 45 мин", data: { energy: "medium", sleep: "good", stress: "medium", pain: [], soreness: [], availableMinutes: 45 } },
      { name: "Боль в шее 5/10", data: { energy: "medium", sleep: "good", stress: "low", pain: [{ location: "neck", level: 5 }] as PainEntry[], soreness: [] } },
      { name: "Критика: все плохо", data: { energy: "low", sleep: "poor", stress: "very_high", pain: [{ location: "shoulder", level: 6 }] as PainEntry[], soreness: [] } },
    ]
  },

  // 6. Молодая девушка, похудение, короткие тренировки
  {
    name: "Девушка 18-25, похудение, 45 мин",
    profile: {
      experience: "beginner" as const,
      goal: "lose_weight" as const,
      daysPerWeek: 4,
      timeBucket: 45,
      equipment: "gym_full" as const,
      sex: "female" as const,
    },
    checkins: [
      { name: "Энергия на максимум", data: { energy: "high", sleep: "good", stress: "low", pain: [], soreness: [] } },
      { name: "Усталость", data: { energy: "low", sleep: "poor", stress: "medium", pain: [], soreness: [] } },
    ]
  },

  // 7. Пауэрлифтер
  {
    name: "Пауэрлифтер, 5 дней",
    profile: {
      experience: "advanced" as const,
      goal: "strength" as const,
      daysPerWeek: 5,
      timeBucket: 90,
      equipment: "gym_full" as const,
      sex: "male" as const,
    },
    checkins: [
      { name: "Пик формы", data: { energy: "high", sleep: "good", stress: "low", pain: [], soreness: [] } },
      { name: "Боль в запястье 4/10", data: { energy: "medium", sleep: "good", stress: "low", pain: [{ location: "wrist", level: 4 }] as PainEntry[], soreness: [] } },
    ]
  },
];

// ============================================================================
// RUN TESTS
// ============================================================================

let totalTests = 0;
let issuesFound: string[] = [];

for (const testCase of testCases) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`📋 TEST CASE: ${testCase.name}`);
  console.log(`${"=".repeat(100)}`);
  
  const profile = testCase.profile as UserProfile;
  
  // 1. Рекомендация схемы
  console.log(`\n🎯 ПРОФИЛЬ:`);
  console.log(`   Опыт: ${profile.experience} | Цель: ${profile.goal}`);
  console.log(`   Дней: ${profile.daysPerWeek} | Время: ${profile.timeBucket} мин`);
  console.log(`   Оборудование: ${profile.equipment} | Пол: ${profile.sex || "not specified"}`);
  
  const { recommended: scheme, alternatives } = recommendScheme(profile);
  
  console.log(`\n✅ Схема: ${scheme.russianName} (${scheme.id})`);
  console.log(`   Сплит: ${scheme.splitType} | Интенсивность: ${scheme.intensity}`);
  
  // 2. Генерация недельного плана
  console.log(`\n📅 ГЕНЕРАЦИЯ НЕДЕЛИ (без чек-ина):`);
  
  const weekPlan = generateWeekPlan({
    scheme,
    userProfile: profile,
    history: { recentExerciseIds: [] },
  });
  
  weekPlan.forEach((day, i) => {
    console.log(`   День ${i}: ${day.dayLabel} - ${day.totalExercises} упр, ${day.totalSets} подх, ${day.estimatedDuration} мин`);
    
    // Проверка адекватности
    if (day.totalExercises === 0) {
      issuesFound.push(`❌ ${testCase.name}: День ${i} без упражнений!`);
    }
    if (day.estimatedDuration > profile.timeBucket + 30) {
      issuesFound.push(`⚠️ ${testCase.name}: День ${i} слишком длинный (${day.estimatedDuration} мин > ${profile.timeBucket + 30} мин)`);
    }
    if (day.totalSets < 10 && profile.experience !== "beginner") {
      issuesFound.push(`⚠️ ${testCase.name}: День ${i} слишком мало подходов (${day.totalSets})`);
    }
  });
  
  // 3. Тестирование чек-инов
  console.log(`\n🩺 ТЕСТИРОВАНИЕ ЧЕК-ИНОВ:`);
  
  for (const checkinTest of testCase.checkins) {
    totalTests++;
    console.log(`\n   ${"─".repeat(90)}`);
    console.log(`   📝 Чек-ин: ${checkinTest.name}`);
    
    const checkin = checkinTest.data as CheckInData;
    
    // Вычисляем readiness
    const readiness = computeReadiness({
      checkin,
      fallbackTimeBucket: profile.timeBucket,
    });
    
    console.log(`      Severity: ${readiness.severity} (score: ${readiness.severityScore})`);
    console.log(`      Intent: ${readiness.intent}`);
    console.log(`      Time: ${readiness.timeBucket} мин (available: ${readiness.effectiveMinutes || "not specified"})`);
    
    if (readiness.warnings && readiness.warnings.length > 0) {
      console.log(`      ⚠️  Warnings: ${readiness.warnings.length}`);
      readiness.warnings.forEach(w => console.log(`         - ${w}`));
    }
    
    if (readiness.notes && readiness.notes.length > 0) {
      console.log(`      📝 Notes: ${readiness.notes.length}`);
      readiness.notes.forEach(n => console.log(`         - ${n}`));
    }
    
    if (readiness.avoidFlags && readiness.avoidFlags.length > 0) {
      console.log(`      🚫 Avoid: ${readiness.avoidFlags.join(", ")}`);
    }
    
    if (readiness.blockedDayTypes && readiness.blockedDayTypes.length > 0) {
      console.log(`      ⛔ Blocked days: ${readiness.blockedDayTypes.join(", ")}`);
    }
    
    // Проверяем policy decision для первого дня недели
    const firstDay = weekPlan[0];
    const decision = decideStartAction({
      scheme,
      dayIndex: 0,
      readiness,
    });
    
    console.log(`      🎯 Decision: ${decision.action}`);
    if (decision.notes && decision.notes.length > 0) {
      decision.notes.forEach(n => console.log(`         - ${n}`));
    }
    
    // Генерация тренировки с чек-ином
    const dayWithCheckin = generateWorkoutDay({
      scheme,
      dayIndex: decision.action === "swap_day" && decision.targetDayIndex !== undefined 
        ? decision.targetDayIndex 
        : 0,
      userProfile: profile,
      readiness,
      history: { recentExerciseIds: [] },
      dupIntensity: "heavy",
      // weekPlanData removed
    });
    
    console.log(`      💪 Адаптированная тренировка:`);
    console.log(`         ${dayWithCheckin.dayLabel}: ${dayWithCheckin.totalExercises} упр, ${dayWithCheckin.totalSets} подх, ${dayWithCheckin.estimatedDuration} мин`);
    
    // ============================================================================
    // ПРОВЕРКИ ПРОФЕССИОНАЛИЗМА И АДЕКВАТНОСТИ
    // ============================================================================
    
    // 1. Проверка времени
    if (checkin.availableMinutes && dayWithCheckin.estimatedDuration > checkin.availableMinutes + 10) {
      issuesFound.push(
        `❌ ${testCase.name} | ${checkinTest.name}: ` +
        `Тренировка ${dayWithCheckin.estimatedDuration} мин > доступно ${checkin.availableMinutes} мин + буфер`
      );
    }
    
    // 2. Проверка критичной боли
    if (checkin.pain && checkin.pain.length > 0) {
      const maxPain = Math.max(...checkin.pain.map(p => p.level));
      
      // Боль 8+ → должен быть skip или recovery
      if (maxPain >= 8 && decision.action === "keep_day") {
        issuesFound.push(
          `❌ ${testCase.name} | ${checkinTest.name}: ` +
          `Боль ${maxPain}/10, но action=keep_day (ожидался skip/recovery)`
        );
      }
      
      // Боль в плече 7+ → не должно быть жимов
      const shoulderPain = checkin.pain.find(p => p.location === "shoulder");
      if (shoulderPain && shoulderPain.level >= 7) {
        const hasPushExercises = dayWithCheckin.exercises.some(ex => 
          ex.exercise.name.toLowerCase().includes("жим") ||
          ex.exercise.name.toLowerCase().includes("отжим")
        );
        
        if (hasPushExercises && decision.action === "keep_day") {
          issuesFound.push(
            `⚠️ ${testCase.name} | ${checkinTest.name}: ` +
            `Боль в плече ${shoulderPain.level}/10, но есть жимовые упражнения`
          );
        }
      }
      
      // Боль в колене 7+ на день ног → должен быть swap
      const kneePain = checkin.pain.find(p => p.location === "knee");
      if (kneePain && kneePain.level >= 7 && firstDay.dayLabel.toLowerCase().includes("ноги")) {
        if (decision.action === "keep_day") {
          issuesFound.push(
            `❌ ${testCase.name} | ${checkinTest.name}: ` +
            `Боль в колене ${kneePain.level}/10 на день ног, но action=keep_day`
          );
        }
      }
    }
    
    // 3. Проверка severity
    if (readiness.severity === "critical" && decision.action !== "skip" && decision.action !== "recovery") {
      issuesFound.push(
        `❌ ${testCase.name} | ${checkinTest.name}: ` +
        `Severity=CRITICAL, но action=${decision.action} (ожидался skip/recovery)`
      );
    }
    
    // 4. Проверка intent и volume
    if (readiness.intent === "light" && dayWithCheckin.totalSets >= firstDay.totalSets) {
      issuesFound.push(
        `⚠️ ${testCase.name} | ${checkinTest.name}: ` +
        `Intent=light, но volume не уменьшен (${dayWithCheckin.totalSets} vs ${firstDay.totalSets})`
      );
    }
    
    // 5. Проверка пустых тренировок
    if (dayWithCheckin.totalExercises === 0 && decision.action !== "skip") {
      issuesFound.push(
        `❌ ${testCase.name} | ${checkinTest.name}: ` +
        `Тренировка без упражнений при action=${decision.action}`
      );
    }
    
    // 6. Проверка адекватности warnings
    if (checkin.sleep === "poor" && (!readiness.warnings || readiness.warnings.length === 0)) {
      issuesFound.push(
        `⚠️ ${testCase.name} | ${checkinTest.name}: ` +
        `Плохой сон, но нет warnings`
      );
    }
    
    // 7. Проверка очень высокого стресса
    if (checkin.stress === "very_high" && readiness.severity === "low") {
      issuesFound.push(
        `⚠️ ${testCase.name} | ${checkinTest.name}: ` +
        `Стресс very_high, но severity=low (ожидался минимум medium)`
      );
    }
    
    // 8. Проверка комбинации факторов
    if (checkin.sleep === "poor" && checkin.energy === "low" && checkin.stress === "high") {
      if (readiness.severity === "low" || readiness.severity === "medium") {
        issuesFound.push(
          `⚠️ ${testCase.name} | ${checkinTest.name}: ` +
          `Комбо (плохой сон + низкая энергия + стресс), но severity=${readiness.severity} (ожидался high/critical)`
        );
      }
    }
  }
}

// ============================================================================
// FINAL REPORT
// ============================================================================

console.log(`\n${"=".repeat(100)}`);
console.log(`📊 ИТОГОВЫЙ ОТЧЁТ`);
console.log(`${"=".repeat(100)}`);

console.log(`\n✅ Всего тестов: ${totalTests}`);
console.log(`⚠️  Найдено проблем: ${issuesFound.length}`);

if (issuesFound.length > 0) {
  console.log(`\n🔍 ДЕТАЛИ ПРОБЛЕМ:\n`);
  issuesFound.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });
} else {
  console.log(`\n🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!`);
}

console.log(`\n${"=".repeat(100)}`);

