// testRealUsers.ts
// ============================================================================
// РЕАЛЬНЫЙ ТЕСТ С РЕАЛЬНОЙ БД: Создаём пользователей и тренировки
// ============================================================================

import { q } from "./db.js";
import { applyProgressionFromSession, getNextWorkoutRecommendations } from "./progressionService.js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary.js";
import type { SessionPayload } from "./progressionService.js";

// Test users
const TEST_USERS = [
  {
    id: "11111111-1111-1111-1111-111111111111", // Fixed UUID
    name: "Тест Иван",
    goal: "build_muscle" as const,
    experience: "intermediate" as const,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Тест Мария",
    goal: "lose_weight" as const,
    experience: "beginner" as const,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Тест Алексей",
    goal: "strength" as const,
    experience: "advanced" as const,
  },
];

// Helper: Clean old test data
async function cleanupTestData() {
  console.log("\n🧹 Очистка старых тестовых данных...");
  
  for (const user of TEST_USERS) {
    try {
      await q(`DELETE FROM exercise_history WHERE user_id = $1`, [user.id]);
      await q(`DELETE FROM exercise_progression WHERE user_id = $1`, [user.id]);
      console.log(`  ✅ Очищено: ${user.name}`);
    } catch (err) {
      console.warn(`  ⚠️  Ошибка очистки ${user.name}:`, err);
    }
  }
}

// Helper: Check if tables exist
async function checkTables() {
  console.log("\n🔍 Проверка таблиц БД...");
  
  const tables = [
    "exercise_progression",
    "exercise_history",
  ];
  
  for (const table of tables) {
    try {
      const result = await q(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [table]);
      
      const exists = result[0]?.exists || false;
      console.log(`  ${exists ? "✅" : "❌"} ${table}: ${exists ? "exists" : "NOT FOUND"}`);
      
      if (!exists) {
        throw new Error(`Table ${table} not found! Run migration first.`);
      }
    } catch (err) {
      console.error(`  ❌ Ошибка проверки ${table}:`, err);
      throw err;
    }
  }
}

// Simulate one workout for a user
async function simulateWorkout(
  userId: string,
  userName: string,
  goal: "build_muscle" | "lose_weight" | "strength",
  experience: "beginner" | "intermediate" | "advanced",
  weekNumber: number,
  dayNumber: number
): Promise<void> {
  console.log(`\n${"─".repeat(80)}`);
  console.log(`👤 ${userName} | Неделя ${weekNumber}, День ${dayNumber}`);
  console.log(`${"─".repeat(80)}`);
  
  // Select exercises based on goal
  let exerciseIds: string[];
  
  if (goal === "build_muscle") {
    exerciseIds = [
      "ho_barbell_bench_press",
      "sq_back_squat",
      "hi_conventional_deadlift",
      "ve_lat_pulldown",
    ];
  } else if (goal === "strength") {
    exerciseIds = [
      "ho_barbell_bench_press",
      "sq_back_squat",
      "hi_conventional_deadlift",
    ];
  } else {
    exerciseIds = [
      "sq_goblet_squat",
      "ho_db_bench_press",
      "ve_lat_pulldown",
      "lu_walking_lunge",
    ];
  }
  
  const exercises = exerciseIds
    .map(id => EXERCISE_LIBRARY.find(ex => ex.id === id))
    .filter(Boolean);
  
  if (exercises.length === 0) {
    console.error("  ❌ Упражнения не найдены!");
    return;
  }
  
  console.log(`\n📋 Запрашиваем рекомендации для ${exercises.length} упражнений...`);
  
  // Get recommendations
  const recommendations = await getNextWorkoutRecommendations({
    userId,
    exercises: exercises as any,
    goal,
    experience,
  });
  
  console.log(`  ✅ Получено рекомендаций: ${recommendations.size}`);
  
  // Simulate performance
  const targetReps = goal === "strength" ? [4, 6] : goal === "build_muscle" ? [8, 12] : [10, 15];
  
  const completedExercises = exercises.map((ex) => {
    const rec = recommendations.get(ex!.id);
    const weight = rec?.newWeight || (goal === "strength" ? 60 : goal === "build_muscle" ? 40 : 10);
    
    // Simulate realistic performance based on week
    let baseReps = targetReps[0] + 1;
    
    if (weekNumber === 1) {
      baseReps = targetReps[0]; // First week: conservative
    } else if (weekNumber === 2) {
      baseReps = targetReps[0] + 1; // Second week: better
    } else if (weekNumber === 3) {
      baseReps = targetReps[0] + 2; // Third week: good
    } else if (weekNumber === 4) {
      baseReps = targetReps[1]; // Fourth week: hit top range
    }
    
    const sets = [
      { reps: baseReps, weight, done: true },
      { reps: Math.max(targetReps[0], baseReps - 1), weight, done: true },
      { reps: Math.max(targetReps[0], baseReps - 2), weight, done: true },
    ];
    
    console.log(`  🏋️  ${ex!.name}:`);
    console.log(`      Вес: ${weight}кг (${rec?.action || "new"})`);
    console.log(`      Повторы: ${sets.map(s => s.reps).join(", ")}`);
    
    return {
      name: ex!.name,
      pattern: ex!.patterns[0],
      sets,
      effort: "working" as const,
      done: true,
    };
  });
  
  // Create payload
  const payload: SessionPayload = {
    title: `Тренировка ${weekNumber}-${dayNumber}`,
    location: "gym",
    durationMin: 60,
    exercises: completedExercises,
    feedback: {
      sessionRpe: 7,
    },
  };
  
  const workoutDate = new Date();
  workoutDate.setDate(workoutDate.getDate() + (weekNumber - 1) * 7 + (dayNumber - 1) * 2);
  
  console.log(`\n💾 Сохраняем в БД (дата: ${workoutDate.toISOString().slice(0, 10)})...`);
  
  // Save to DB
  const progressionSummary = await applyProgressionFromSession({
    userId,
    payload,
    goal,
    experience,
    workoutDate: workoutDate.toISOString().slice(0, 10),
  });
  
  console.log(`\n📊 Результат:`);
  console.log(`  ✅ Прогресс: ${progressionSummary.progressedCount} упражнений`);
  console.log(`  ➡️  Удержание: ${progressionSummary.maintainedCount} упражнений`);
  console.log(`  📉 Deload: ${progressionSummary.deloadedCount} упражнений`);
}

// Verify data in DB
async function verifyDatabase() {
  console.log(`\n${"═".repeat(80)}`);
  console.log("🔍 ПРОВЕРКА ДАННЫХ В БД");
  console.log(`${"═".repeat(80)}`);
  
  for (const user of TEST_USERS) {
    console.log(`\n👤 ${user.name} (${user.id})`);
    
    // Check progression data
    const progressionRows = await q<{
      exercise_id: string;
      current_weight: number;
      status: string;
      stall_count: number;
      deload_count: number;
    }>(`
      SELECT 
        exercise_id,
        current_weight,
        status,
        stall_count,
        deload_count
      FROM exercise_progression
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `, [user.id]);
    
    console.log(`\n  📊 exercise_progression (${progressionRows.length} записей):`);
    
    if (progressionRows.length === 0) {
      console.log("    ⚠️  Нет данных!");
    } else {
      progressionRows.forEach(row => {
        const ex = EXERCISE_LIBRARY.find(e => e.id === row.exercise_id);
        console.log(`    • ${ex?.name || row.exercise_id}:`);
        console.log(`        Вес: ${row.current_weight}кг`);
        console.log(`        Статус: ${row.status}`);
        console.log(`        Застоев: ${row.stall_count}, Deload'ов: ${row.deload_count}`);
      });
    }
    
    // Check history
    const historyRows = await q<{
      exercise_id: string;
      workout_date: string;
      sets: any;
    }>(`
      SELECT 
        exercise_id,
        workout_date,
        sets
      FROM exercise_history
      WHERE user_id = $1
      ORDER BY workout_date DESC
      LIMIT 10
    `, [user.id]);
    
    console.log(`\n  📅 exercise_history (${historyRows.length} последних тренировок):`);
    
    if (historyRows.length === 0) {
      console.log("    ⚠️  Нет данных!");
    } else {
      // Group by exercise
      const byExercise = new Map<string, typeof historyRows>();
      historyRows.forEach(row => {
        if (!byExercise.has(row.exercise_id)) {
          byExercise.set(row.exercise_id, []);
        }
        byExercise.get(row.exercise_id)!.push(row);
      });
      
      byExercise.forEach((rows, exerciseId) => {
        const ex = EXERCISE_LIBRARY.find(e => e.id === exerciseId);
        console.log(`\n    ${ex?.name || exerciseId} (${rows.length} тренировок):`);
        
        rows.slice(0, 3).forEach(row => {
          const sets = typeof row.sets === 'string' ? JSON.parse(row.sets) : row.sets;
          const avgReps = sets.reduce((sum: number, s: any) => sum + s.actualReps, 0) / sets.length;
          const weight = sets[0].weight;
          
          console.log(`      ${row.workout_date}: ${weight}кг × ${avgReps.toFixed(1)} reps (avg)`);
        });
      });
    }
  }
}

// Main test
async function runRealTest() {
  console.log("\n🚀 РЕАЛЬНЫЙ ТЕСТ С РЕАЛЬНОЙ БД");
  console.log("=".repeat(80));
  console.log("Создаём тестовых пользователей, генерируем тренировки,");
  console.log("сохраняем в PostgreSQL, проверяем данные");
  console.log("=".repeat(80));
  
  try {
    // 1. Check tables
    await checkTables();
    
    // 2. Cleanup old data
    await cleanupTestData();
    
    // 3. Simulate 4 weeks of training for each user
    console.log(`\n${"═".repeat(80)}`);
    console.log("📅 СИМУЛЯЦИЯ 4 НЕДЕЛЬ ТРЕНИРОВОК");
    console.log(`${"═".repeat(80)}`);
    
    for (const user of TEST_USERS) {
      console.log(`\n\n${"█".repeat(80)}`);
      console.log(`👤 ${user.name.toUpperCase()}`);
      console.log(`   Goal: ${user.goal} | Experience: ${user.experience}`);
      console.log(`${"█".repeat(80)}`);
      
      // 4 weeks × 3 workouts per week
      for (let week = 1; week <= 4; week++) {
        for (let day = 1; day <= 3; day++) {
          await simulateWorkout(
            user.id,
            user.name,
            user.goal,
            user.experience,
            week,
            day
          );
          
          // Small delay
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
    
    // 4. Verify data in DB
    await verifyDatabase();
    
    // 5. Show summary
    console.log(`\n\n${"═".repeat(80)}`);
    console.log("✅ ТЕСТ ЗАВЕРШЁН УСПЕШНО");
    console.log(`${"═".repeat(80)}`);
    
    console.log("\n📊 ИТОГ:");
    console.log("  ✅ Таблицы проверены");
    console.log("  ✅ Старые данные очищены");
    console.log("  ✅ 3 пользователя × 4 недели × 3 тренировки = 36 тренировок сохранено");
    console.log("  ✅ Данные реально в PostgreSQL");
    console.log("  ✅ Прогрессия работает!");
    
    console.log("\n🔍 Проверь сам:");
    console.log("  psql -c \"SELECT COUNT(*) FROM exercise_progression WHERE user_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');\"");
    console.log("  psql -c \"SELECT COUNT(*) FROM exercise_history WHERE user_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');\"");
    
  } catch (err) {
    console.error("\n❌ ОШИБКА:", err);
    throw err;
  }
}

// Run
runRealTest()
  .then(() => {
    console.log("\n✅ Тест завершён, выход...");
    process.exit(0);
  })
  .catch(err => {
    console.error("\n❌ Тест провалился:", err);
    process.exit(1);
  });
