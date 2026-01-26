// testProfessional.ts
// ============================================================================
// ПРОФЕССИОНАЛЬНЫЙ ТЕСТ: 30 реальных вариаций пользователей
// Анализ как профессиональный тренер
// ============================================================================

import { generateWeekPlan, type UserProfile, type CheckInData } from "./workoutDayGenerator.js";
import { NORMALIZED_SCHEMES } from "./normalizedSchemes.js";
import { createMesocycle } from "./mesocycleEngine.js";

// ============================================================================
// 30 РЕАЛЬНЫХ ПРОФИЛЕЙ (покрывают все варианты онбординга)
// ============================================================================

type TestUser = {
  id: number;
  name: string;
  profile: UserProfile;
  checkin?: CheckInData;
};

const REAL_USERS: TestUser[] = [
  // ========== BEGINNERS (новички) ==========
  {
    id: 1,
    name: "Новичок М, набор массы, 3д/60мин",
    profile: { experience: "beginner", goal: "build_muscle", daysPerWeek: 3, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 2,
    name: "Новичок Ж, похудение, 3д/45мин",
    profile: { experience: "beginner", goal: "lose_weight", daysPerWeek: 3, timeBucket: 45, location: "gym", sex: "female" },
    checkin: { energy: "medium", sleep: "ok", stress: "medium", pain: [], soreness: [] },
  },
  {
    id: 3,
    name: "Новичок М, здоровье, 2д/60мин",
    profile: { experience: "beginner", goal: "health_wellness", daysPerWeek: 2, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 4,
    name: "Новичок Ж, набор массы, 4д/60мин",
    profile: { experience: "beginner", goal: "build_muscle", daysPerWeek: 4, timeBucket: 60, location: "gym", sex: "female" },
  },

  // ========== INTERMEDIATE (средний уровень) ==========
  {
    id: 5,
    name: "Средний М, набор массы, 4д/90мин",
    profile: { experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, timeBucket: 90, location: "gym", sex: "male" },
    checkin: { energy: "high", sleep: "good", stress: "low", pain: [], soreness: [] },
  },
  {
    id: 6,
    name: "Средний М, набор массы, 5д/60мин",
    profile: { experience: "intermediate", goal: "build_muscle", daysPerWeek: 5, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 7,
    name: "Средний М, сила, 4д/90мин",
    profile: { experience: "intermediate", goal: "strength", daysPerWeek: 4, timeBucket: 90, location: "gym", sex: "male" },
  },
  {
    id: 8,
    name: "Средний Ж, ягодицы, 4д/60мин",
    profile: { experience: "intermediate", goal: "lower_body_focus", daysPerWeek: 4, timeBucket: 60, location: "gym", sex: "female" },
  },
  {
    id: 9,
    name: "Средний Ж, ягодицы, 5д/60мин",
    profile: { experience: "intermediate", goal: "lower_body_focus", daysPerWeek: 5, timeBucket: 60, location: "gym", sex: "female" },
  },
  {
    id: 10,
    name: "Средний М, похудение, 5д/45мин",
    profile: { experience: "intermediate", goal: "lose_weight", daysPerWeek: 5, timeBucket: 45, location: "gym", sex: "male" },
    checkin: { energy: "low", sleep: "poor", stress: "high", pain: [], soreness: ["legs"] },
  },
  {
    id: 11,
    name: "Средний М, атлетика, 5д/60мин",
    profile: { experience: "intermediate", goal: "athletic_body", daysPerWeek: 5, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 12,
    name: "Средний Ж, набор массы, 3д/90мин",
    profile: { experience: "intermediate", goal: "build_muscle", daysPerWeek: 3, timeBucket: 90, location: "gym", sex: "female" },
  },

  // ========== ADVANCED (продвинутые) ==========
  {
    id: 13,
    name: "Продвинутый М, набор массы, 6д/90мин",
    profile: { experience: "advanced", goal: "build_muscle", daysPerWeek: 6, timeBucket: 90, location: "gym", sex: "male" },
    checkin: { energy: "high", sleep: "good", stress: "low", pain: [], soreness: [] },
  },
  {
    id: 14,
    name: "Продвинутый М, сила, 5д/90мин",
    profile: { experience: "advanced", goal: "strength", daysPerWeek: 5, timeBucket: 90, location: "gym", sex: "male" },
  },
  {
    id: 15,
    name: "Продвинутый М, сила, 4д/90мин",
    profile: { experience: "advanced", goal: "strength", daysPerWeek: 4, timeBucket: 90, location: "gym", sex: "male" },
  },
  {
    id: 16,
    name: "Продвинутый Ж, ягодицы, 5д/60мин",
    profile: { experience: "advanced", goal: "lower_body_focus", daysPerWeek: 5, timeBucket: 60, location: "gym", sex: "female" },
  },
  {
    id: 17,
    name: "Продвинутый Ж, ягодицы, 6д/60мин",
    profile: { experience: "advanced", goal: "lower_body_focus", daysPerWeek: 6, timeBucket: 60, location: "gym", sex: "female" },
  },
  {
    id: 18,
    name: "Продвинутый М, набор массы, 5д/90мин",
    profile: { experience: "advanced", goal: "build_muscle", daysPerWeek: 5, timeBucket: 90, location: "gym", sex: "male" },
  },
  {
    id: 19,
    name: "Продвинутый М, атлетика, 5д/60мин",
    profile: { experience: "advanced", goal: "athletic_body", daysPerWeek: 5, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 20,
    name: "Продвинутый Ж, набор массы, 6д/60мин",
    profile: { experience: "advanced", goal: "build_muscle", daysPerWeek: 6, timeBucket: 60, location: "gym", sex: "female" },
  },

  // ========== С БОЛЯМИ/ПРОБЛЕМАМИ ==========
  {
    id: 21,
    name: "Средний М, набор, боль в плече",
    profile: { experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, timeBucket: 60, location: "gym", sex: "male" },
    checkin: { energy: "medium", sleep: "ok", stress: "medium", pain: [{ location: "shoulder", level: 6 }], soreness: [] },
  },
  {
    id: 22,
    name: "Средний Ж, ягодицы, боль в колене",
    profile: { experience: "intermediate", goal: "lower_body_focus", daysPerWeek: 4, timeBucket: 60, location: "gym", sex: "female" },
    checkin: { energy: "low", sleep: "fair", stress: "medium", pain: [{ location: "knee", level: 5 }], soreness: [] },
  },
  {
    id: 23,
    name: "Продвинутый М, сила, боль в пояснице",
    profile: { experience: "advanced", goal: "strength", daysPerWeek: 5, timeBucket: 90, location: "gym", sex: "male" },
    checkin: { energy: "medium", sleep: "ok", stress: "low", pain: [{ location: "lower_back", level: 4 }], soreness: [] },
  },

  // ========== ЭКСТРЕМАЛЬНЫЕ НАГРУЗКИ ==========
  {
    id: 24,
    name: "Продвинутый М, набор, 6д/90мин максимум",
    profile: { experience: "advanced", goal: "build_muscle", daysPerWeek: 6, timeBucket: 90, location: "gym", sex: "male" },
    checkin: { energy: "high", sleep: "excellent", stress: "low", pain: [], soreness: [] },
  },

  // ========== МИНИМАЛЬНЫЕ НАГРУЗКИ ==========
  {
    id: 25,
    name: "Новичок Ж, здоровье, 2д/45мин минимум",
    profile: { experience: "beginner", goal: "health_wellness", daysPerWeek: 2, timeBucket: 45, location: "gym", sex: "female" },
  },

  // ========== МИКС ==========
  {
    id: 26,
    name: "Средний М, похудение, 4д/60мин",
    profile: { experience: "intermediate", goal: "lose_weight", daysPerWeek: 4, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 27,
    name: "Продвинутый Ж, похудение, 6д/45мин",
    profile: { experience: "advanced", goal: "lose_weight", daysPerWeek: 6, timeBucket: 45, location: "gym", sex: "female" },
  },
  {
    id: 28,
    name: "Новичок М, атлетика, 3д/60мин",
    profile: { experience: "beginner", goal: "athletic_body", daysPerWeek: 3, timeBucket: 60, location: "gym", sex: "male" },
  },
  {
    id: 29,
    name: "Средний Ж, набор, плохой сон + стресс",
    profile: { experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, timeBucket: 60, location: "gym", sex: "female" },
    checkin: { energy: "low", sleep: "poor", stress: "very_high", pain: [], soreness: ["shoulders", "back"] },
  },
  {
    id: 30,
    name: "Продвинутый М, атлетика, 6д/60мин",
    profile: { experience: "advanced", goal: "athletic_body", daysPerWeek: 6, timeBucket: 60, location: "gym", sex: "male" },
  },
];

// ============================================================================
// ПРОФЕССИОНАЛЬНЫЙ АНАЛИЗ ТРЕНЕРА
// ============================================================================

type CoachAnalysis = {
  rating: number; // 1-10
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  verdict: "Отлично" | "Хорошо" | "Приемлемо" | "Требует доработки" | "Неприемлемо";
};

function analyzeAsCoach(user: TestUser, weekPlan: any[], scheme: any): CoachAnalysis {
  const { profile } = user;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];
  let rating = 10;

  // Анализ объёма
  const totalSets = weekPlan.reduce((sum, day) => sum + day.totalSets, 0);
  const totalExercises = weekPlan.reduce((sum, day) => sum + day.totalExercises, 0);
  const avgSetsPerDay = totalSets / weekPlan.length;
  const avgExercisesPerDay = totalExercises / weekPlan.length;

  // 1. ОБЪЁМ ПО ОПЫТУ
  const volumeExpectations: Record<string, { setsPerWeek: [number, number]; setsPerDay: [number, number] }> = {
    beginner: { setsPerWeek: [30, 50], setsPerDay: [12, 18] },
    intermediate: { setsPerWeek: [50, 90], setsPerDay: [18, 25] },
    advanced: { setsPerWeek: [90, 150], setsPerDay: [22, 30] },
  };

  const expected = volumeExpectations[profile.experience];
  if (totalSets < expected.setsPerWeek[0]) {
    weaknesses.push(`Недостаточный объём: ${totalSets} подходов/нед (норма ${expected.setsPerWeek[0]}-${expected.setsPerWeek[1]})`);
    rating -= 2;
  } else if (totalSets > expected.setsPerWeek[1]) {
    weaknesses.push(`Избыточный объём: ${totalSets} подходов/нед (норма ${expected.setsPerWeek[0]}-${expected.setsPerWeek[1]})`);
    rating -= 1;
  } else {
    strengths.push(`Объём соответствует опыту: ${totalSets} подходов/нед`);
  }

  // 2. БАЛАНС PUSH/PULL
  let pushSets = 0;
  let pullSets = 0;
  for (const day of weekPlan) {
    for (const ex of day.exercises) {
      const patterns = ex.exercise?.patterns || [];
      if (patterns.some((p: string) => p.includes("push") || p.includes("press"))) {
        pushSets += ex.sets;
      }
      if (patterns.some((p: string) => p.includes("pull") || p.includes("row"))) {
        pullSets += ex.sets;
      }
    }
  }

  const pushPullRatio = pullSets > 0 ? pushSets / pullSets : 0;
  if (pushPullRatio > 1.3) {
    weaknesses.push(`Дисбаланс Push/Pull: ${pushSets}/${pullSets} (${pushPullRatio.toFixed(2)}). Pull должно быть >= Push`);
    rating -= 2;
    recommendations.push("Добавить горизонтальные и вертикальные тяги");
  } else if (pushPullRatio >= 0.7 && pushPullRatio <= 1.2) {
    strengths.push(`Отличный Push/Pull баланс: ${pushSets}/${pullSets} (${pushPullRatio.toFixed(2)})`);
  }

  // 3. ЧАСТОТА ТРЕНИРОВКИ МЫШЕЧНЫХ ГРУПП
  const muscleFrequency = new Map<string, number>();
  for (const day of weekPlan) {
    const dayMuscles = new Set<string>();
    for (const ex of day.exercises) {
      for (const muscle of ex.exercise?.primaryMuscles || []) {
        dayMuscles.add(muscle);
      }
    }
    for (const muscle of dayMuscles) {
      muscleFrequency.set(muscle, (muscleFrequency.get(muscle) || 0) + 1);
    }
  }

  // Для гипертрофии оптимально 2-3 раза/нед на группу
  if (profile.goal === "build_muscle") {
    const majorMuscles = ["chest", "back", "quads", "hamstrings"];
    for (const muscle of majorMuscles) {
      const freq = muscleFrequency.get(muscle) || 0;
      if (freq < 2 && profile.daysPerWeek >= 4) {
        weaknesses.push(`Низкая частота для ${muscle}: ${freq}×/нед (оптимум 2-3×)`);
        rating -= 1;
      } else if (freq >= 2 && freq <= 3) {
        strengths.push(`Оптимальная частота ${muscle}: ${freq}×/нед`);
      }
    }
  }

  // 4. СПЕЦИФИКА ПО ЦЕЛЯМ
  if (profile.goal === "strength") {
    // Для силы нужны тяжёлые базовые упражнения
    let heavyCompounds = 0;
    for (const day of weekPlan) {
      for (const ex of day.exercises) {
        if (ex.role === "main" && ex.repsRange[1] <= 6) {
          heavyCompounds++;
        }
      }
    }
    if (heavyCompounds < profile.daysPerWeek) {
      weaknesses.push(`Недостаточно тяжёлых базовых (4-6 повт): ${heavyCompounds} (нужно >= ${profile.daysPerWeek})`);
      rating -= 2;
    } else {
      strengths.push(`Достаточно силовых упражнений: ${heavyCompounds} тяжёлых базовых`);
    }
  }

  if (profile.goal === "lower_body_focus") {
    // Для ягодиц: должно быть много hip_thrust, lunge, hinge
    let lowerBodyExercises = 0;
    let gluteFocused = 0;
    for (const day of weekPlan) {
      for (const ex of day.exercises) {
        const patterns = ex.exercise?.patterns || [];
        if (patterns.some((p: string) => ["squat", "hinge", "lunge", "hip_thrust"].includes(p))) {
          lowerBodyExercises++;
        }
        const muscles = ex.exercise?.primaryMuscles || [];
        if (muscles.includes("glutes")) {
          gluteFocused++;
        }
      }
    }

    const lowerRatio = lowerBodyExercises / totalExercises;
    if (lowerRatio < 0.5) {
      weaknesses.push(`Недостаточно упражнений на ноги/ягодицы: ${lowerBodyExercises}/${totalExercises} (${(lowerRatio * 100).toFixed(0)}%)`);
      rating -= 2;
    } else {
      strengths.push(`Акцент на нижнюю часть: ${lowerBodyExercises} упражнений (${(lowerRatio * 100).toFixed(0)}%)`);
    }

    if (gluteFocused < profile.daysPerWeek * 2) {
      recommendations.push(`Добавить больше упражнений на ягодицы (hip thrust, отведения)`);
    }
  }

  if (profile.goal === "lose_weight") {
    // Для похудения: высокая частота, короткий отдых
    const avgRest = weekPlan.flatMap((d: any) => d.exercises).reduce((sum: number, ex: any) => sum + ex.restSec, 0) / totalExercises;
    if (avgRest > 90) {
      recommendations.push(`Сократить отдых между подходами (сейчас ${avgRest.toFixed(0)}с, оптимум 60-90с)`);
      rating -= 0.5;
    } else {
      strengths.push(`Подходящий отдых для жиросжигания: ${avgRest.toFixed(0)}с`);
    }
  }

  // 5. ПЕРИОДИЗАЦИЯ (DUP)
  const dupDays = weekPlan.filter((d: any) => d.adaptationNotes?.some((n: string) => n.includes("DUP")));
  if (dupDays.length > 0 && profile.experience !== "beginner") {
    strengths.push(`Применяется периодизация DUP (${dupDays.length} дней)`);
  }

  // 6. РАЗНООБРАЗИЕ УПРАЖНЕНИЙ
  const uniqueExercises = new Set(weekPlan.flatMap((d: any) => d.exercises.map((e: any) => e.exercise?.id)));
  const varietyRatio = uniqueExercises.size / totalExercises;
  if (varietyRatio < 0.5) {
    weaknesses.push(`Мало разнообразия: ${uniqueExercises.size} уникальных из ${totalExercises} упражнений`);
    rating -= 1;
  } else {
    strengths.push(`Хорошее разнообразие: ${uniqueExercises.size} разных упражнений`);
  }

  // 7. АДАПТАЦИЯ К ЧЕКИНУ
  if (user.checkin) {
    const { energy, sleep, pain } = user.checkin;

    // Должен быть light intent при плохом состоянии
    if ((energy === "low" || sleep === "poor") && weekPlan.some((d: any) => d.intent === "hard")) {
      weaknesses.push(`Игнорирует низкую энергию/сон: есть тяжёлые дни`);
      rating -= 2;
    }

    // Не должно быть травмоопасных упражнений при боли
    if (pain && pain.length > 0) {
      for (const p of pain) {
        if (p.location === "shoulder" && p.level >= 5) {
          const hasOverhead = weekPlan.some((d: any) =>
            d.exercises.some((ex: any) => ex.exercise?.patterns?.includes("vertical_push"))
          );
          if (hasOverhead) {
            weaknesses.push(`Есть жимы над головой при боли в плече ${p.level}/10!`);
            rating -= 3;
          }
        }
        if (p.location === "knee" && p.level >= 5) {
          const hasSquat = weekPlan.some((d: any) =>
            d.exercises.some((ex: any) => ex.exercise?.patterns?.includes("squat"))
          );
          if (hasSquat) {
            weaknesses.push(`Есть приседания при боли в колене ${p.level}/10!`);
            rating -= 3;
          }
        }
      }
    }
  }

  // 8. ВОССТАНОВЛЕНИЕ
  if (profile.daysPerWeek >= 5 && profile.experience === "beginner") {
    weaknesses.push(`Слишком часто для новичка: ${profile.daysPerWeek}д/нед`);
    recommendations.push("Новичкам нужно больше времени на восстановление (3-4 дня оптимум)");
    rating -= 1;
  }

  if (profile.daysPerWeek === 6 && avgSetsPerDay > 25) {
    weaknesses.push(`Риск перетренированности: ${profile.daysPerWeek}д × ${avgSetsPerDay.toFixed(0)} подходов/день`);
    recommendations.push("При 6 днях в неделю снизить объём на тренировку");
    rating -= 1;
  }

  // Определение вердикта
  let verdict: CoachAnalysis["verdict"];
  if (rating >= 9) verdict = "Отлично";
  else if (rating >= 7) verdict = "Хорошо";
  else if (rating >= 5) verdict = "Приемлемо";
  else if (rating >= 3) verdict = "Требует доработки";
  else verdict = "Неприемлемо";

  return {
    rating: Math.max(0, Math.min(10, rating)),
    strengths,
    weaknesses,
    recommendations,
    verdict,
  };
}

// ============================================================================
// ЗАПУСК ТЕСТОВ
// ============================================================================

console.log("╔════════════════════════════════════════════════════════════════╗");
console.log("║  ПРОФЕССИОНАЛЬНЫЙ ТЕСТ: 30 РЕАЛЬНЫХ ПОЛЬЗОВАТЕЛЕЙ             ║");
console.log("║  Анализ как профессиональный тренер                           ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

const results: Array<{
  user: TestUser;
  scheme: any;
  weekPlan: any[];
  analysis: CoachAnalysis;
}> = [];

let totalRating = 0;
let schemesNotFound = 0;

for (const user of REAL_USERS) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`#${user.id}: ${user.name}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Профиль: ${user.profile.experience} | ${user.profile.goal} | ${user.profile.daysPerWeek}д/нед | ${user.profile.timeBucket}мин`);

  if (user.checkin) {
    console.log(`Чек-ин: энергия=${user.checkin.energy}, сон=${user.checkin.sleep}, стресс=${user.checkin.stress}`);
    if (user.checkin.pain && user.checkin.pain.length > 0) {
      console.log(`  Боль: ${user.checkin.pain.map(p => `${p.location} (${p.level}/10)`).join(", ")}`);
    }
  }

  // Находим схему
  const scheme = NORMALIZED_SCHEMES.find(
    s =>
      s.daysPerWeek === user.profile.daysPerWeek &&
      s.goals.includes(user.profile.goal) &&
      (user.profile.experience === "beginner" ? s.minExperience === "beginner" : true)
  );

  if (!scheme) {
    console.log(`\n❌ СХЕМА НЕ НАЙДЕНА для ${user.profile.experience} | ${user.profile.goal} | ${user.profile.daysPerWeek}д`);
    schemesNotFound++;
    continue;
  }

  console.log(`\n📋 Схема: ${scheme.russianName} (${scheme.id})`);

  // Генерируем недельный план
  const mesocycle = createMesocycle({ userId: `user${user.id}`, goal: user.profile.goal });
  const weekPlan = generateWeekPlan({
    scheme,
    userProfile: user.profile,
    mesocycle,
    history: { recentExerciseIds: [] },
  });

  console.log(`\n✅ Сгенерировано ${weekPlan.length} дней\n`);

  // Краткий вывод по дням
  weekPlan.forEach((day, idx) => {
    console.log(`День ${idx + 1}: ${day.dayLabel} | ${day.totalExercises} упр, ${day.totalSets} подх, ${day.estimatedDuration}мин`);
  });

  // ПРОФЕССИОНАЛЬНЫЙ АНАЛИЗ
  const analysis = analyzeAsCoach(user, weekPlan, scheme);

  console.log(`\n${"─".repeat(80)}`);
  console.log(`📊 АНАЛИЗ ТРЕНЕРА`);
  console.log(`${"─".repeat(80)}`);
  console.log(`Оценка: ${analysis.rating.toFixed(1)}/10 | Вердикт: ${analysis.verdict}`);

  if (analysis.strengths.length > 0) {
    console.log(`\n✅ СИЛЬНЫЕ СТОРОНЫ:`);
    analysis.strengths.forEach(s => console.log(`   + ${s}`));
  }

  if (analysis.weaknesses.length > 0) {
    console.log(`\n❌ СЛАБЫЕ СТОРОНЫ:`);
    analysis.weaknesses.forEach(w => console.log(`   - ${w}`));
  }

  if (analysis.recommendations.length > 0) {
    console.log(`\n💡 РЕКОМЕНДАЦИИ:`);
    analysis.recommendations.forEach(r => console.log(`   → ${r}`));
  }

  results.push({ user, scheme, weekPlan, analysis });
  totalRating += analysis.rating;
}

// ============================================================================
// ФИНАЛЬНЫЙ ОТЧЁТ
// ============================================================================

console.log(`\n\n${"=".repeat(80)}`);
console.log("ФИНАЛЬНЫЙ ОТЧЁТ");
console.log(`${"=".repeat(80)}\n`);

const testedUsers = results.length;
const avgRating = testedUsers > 0 ? totalRating / testedUsers : 0;

console.log(`Протестировано пользователей: ${testedUsers}/${REAL_USERS.length}`);
console.log(`Схем не найдено: ${schemesNotFound}`);
console.log(`Средняя оценка: ${avgRating.toFixed(2)}/10\n`);

// Распределение по вердиктам
const verdictCounts = {
  "Отлично": 0,
  "Хорошо": 0,
  "Приемлемо": 0,
  "Требует доработки": 0,
  "Неприемлемо": 0,
};

results.forEach(r => verdictCounts[r.analysis.verdict]++);

console.log("Распределение оценок:");
console.log(`  Отлично: ${verdictCounts["Отлично"]}`);
console.log(`  Хорошо: ${verdictCounts["Хорошо"]}`);
console.log(`  Приемлемо: ${verdictCounts["Приемлемо"]}`);
console.log(`  Требует доработки: ${verdictCounts["Требует доработки"]}`);
console.log(`  Неприемлемо: ${verdictCounts["Неприемлемо"]}\n`);

// Топ-3 и худшие-3
const sorted = [...results].sort((a, b) => b.analysis.rating - a.analysis.rating);

console.log("🏆 ТОП-3 ЛУЧШИХ:");
sorted.slice(0, 3).forEach((r, idx) => {
  console.log(`  ${idx + 1}. ${r.user.name} - ${r.analysis.rating.toFixed(1)}/10`);
});

console.log(`\n⚠️  ТОП-3 ХУДШИХ:`);
sorted.slice(-3).reverse().forEach((r, idx) => {
  console.log(`  ${idx + 1}. ${r.user.name} - ${r.analysis.rating.toFixed(1)}/10`);
});

// Общие проблемы
const allWeaknesses = results.flatMap(r => r.analysis.weaknesses);
const weaknessCounts = new Map<string, number>();
allWeaknesses.forEach(w => {
  const key = w.split(":")[0]; // Берём первую часть до двоеточия
  weaknessCounts.set(key, (weaknessCounts.get(key) || 0) + 1);
});

const topWeaknesses = Array.from(weaknessCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

if (topWeaknesses.length > 0) {
  console.log(`\n📌 САМЫЕ ЧАСТЫЕ ПРОБЛЕМЫ:`);
  topWeaknesses.forEach(([problem, count]) => {
    console.log(`  ${count}× ${problem}`);
  });
}

console.log("\n");
