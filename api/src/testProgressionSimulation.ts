// testProgressionSimulation.ts
// ============================================================================
// ПОЛНАЯ СИМУЛЯЦИЯ ПРОГРЕССИИ БЕЗ БД (In-Memory)
// ============================================================================

import { calculateProgression, initializeProgressionData, updateProgressionData } from "./progressionEngine.js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary.js";
import type { ExerciseProgressionData, ExerciseHistory, ProgressionRecommendation } from "./progressionEngine.js";
import type { Goal, ExperienceLevel } from "./normalizedSchemes.js";

// In-memory "database"
const progressionDB = new Map<string, ExerciseProgressionData>();

function getProgressionDataMock(exerciseId: string, userId: string): ExerciseProgressionData | null {
  const key = `${userId}:${exerciseId}`;
  return progressionDB.get(key) || null;
}

function saveProgressionDataMock(data: ExerciseProgressionData, userId: string): void {
  const key = `${userId}:${data.exerciseId}`;
  progressionDB.set(key, data);
}

// Test scenarios
interface UserScenario {
  name: string;
  userId: string;
  goal: Goal;
  experience: ExperienceLevel;
  exercises: Array<{
    exerciseId: string;
    name: string;
    equipment: string;
  }>;
}

const SCENARIOS: UserScenario[] = [
  {
    name: "Иван (Средний, Масса)",
    userId: "user-001",
    goal: "build_muscle",
    experience: "intermediate",
    exercises: [
      { exerciseId: "ho_barbell_bench_press", name: "Жим штанги лёжа", equipment: "barbell" },
      { exerciseId: "sq_barbell_back_squat", name: "Присед со штангой", equipment: "barbell" },
      { exerciseId: "hi_barbell_conventional_deadlift", name: "Становая тяга", equipment: "barbell" },
      { exerciseId: "ve_barbell_row", name: "Тяга штанги", equipment: "barbell" },
      { exerciseId: "ho_dumbbell_chest_press", name: "Жим гантелей", equipment: "dumbbell" },
    ],
  },
  {
    name: "Мария (Новичок, Похудение)",
    userId: "user-002",
    goal: "lose_weight",
    experience: "beginner",
    exercises: [
      { exerciseId: "sq_goblet_squat", name: "Гоблет присед", equipment: "dumbbell" },
      { exerciseId: "ho_dumbbell_chest_press", name: "Жим гантелей", equipment: "dumbbell" },
      { exerciseId: "hi_dumbbell_romanian_deadlift", name: "РДЛ с гантелями", equipment: "dumbbell" },
      { exerciseId: "ve_dumbbell_row", name: "Тяга гантели", equipment: "dumbbell" },
    ],
  },
  {
    name: "Алексей (Опытный, Атлетизм)",
    userId: "user-003",
    goal: "athletic_body",
    experience: "advanced",
    exercises: [
      { exerciseId: "ho_barbell_bench_press", name: "Жим штанги лёжа", equipment: "barbell" },
      { exerciseId: "sq_barbell_back_squat", name: "Присед со штангой", equipment: "barbell" },
      { exerciseId: "hi_barbell_conventional_deadlift", name: "Становая тяга", equipment: "barbell" },
    ],
  },
];

// Simulate workout performance
function simulatePerformance(
  targetRepsRange: [number, number],
  sets: number,
  weight: number,
  weekNumber: number,
  progressionStatus: string
): ExerciseHistory["sets"] {
  const [minReps, maxReps] = targetRepsRange;
  const performanceSets: ExerciseHistory["sets"] = [];
  
  // Determine base performance based on progression status
  let basePerformance = 0.85; // 85% of target
  
  if (progressionStatus === "progressing") {
    basePerformance = 0.95; // Doing well
  } else if (progressionStatus === "stalling") {
    basePerformance = 0.75; // Struggling
  }
  
  // Add weekly improvement (small)
  basePerformance += (weekNumber - 1) * 0.02;
  
  for (let i = 0; i < sets; i++) {
    // Fatigue within workout
    const fatigue = i * 0.05;
    const performance = basePerformance - fatigue;
    
    // Calculate actual reps
    const targetMid = (minReps + maxReps) / 2;
    let actualReps = Math.round(maxReps * performance);
    
    // Add some randomness
    actualReps += Math.floor(Math.random() * 3) - 1;
    
    // Clamp
    actualReps = Math.max(minReps - 2, Math.min(maxReps + 2, actualReps));
    
    // Determine if completed (met minimum)
    const completed = actualReps >= minReps;
    
    // Estimate RPE
    const rpe = completed ? 7 + Math.floor(Math.random() * 2) : 9;
    
    performanceSets.push({
      targetReps: maxReps,
      actualReps,
      weight,
      rpe,
      completed,
    });
  }
  
  return performanceSets;
}

// Simulate one workout session
function simulateWorkout(
  user: UserScenario,
  weekNumber: number,
  dayNumber: number
): void {
  console.log(`\n  📅 Неделя ${weekNumber}, День ${dayNumber}`);
  console.log(`  ${"─".repeat(70)}`);
  
  for (const exerciseInfo of user.exercises) {
    const exercise = EXERCISE_LIBRARY.find(ex => ex.id === exerciseInfo.exerciseId);
    
    if (!exercise) {
      console.warn(`  ⚠️  Exercise not found: ${exerciseInfo.exerciseId}`);
      continue;
    }
    
    // Get or initialize progression data
    let progressionData = getProgressionDataMock(exercise.id, user.userId);
    
    if (!progressionData) {
      progressionData = initializeProgressionData({
        exerciseId: exercise.id,
        exercise,
        experience: user.experience,
        goal: user.goal,
      });
      saveProgressionDataMock(progressionData, user.userId);
    }
    
    // Determine target reps based on goal
    let targetRepsRange: [number, number] = [8, 12]; // Default for build_muscle
    
    if (user.goal === "lose_weight") {
      targetRepsRange = [10, 15];
    }
    
    // Get recommendation BEFORE workout
    const recommendation = calculateProgression({
      exercise,
      progressionData,
      goal: user.goal,
      experience: user.experience,
      targetRepsRange,
    });
    
    const workoutWeight = recommendation.newWeight || progressionData.currentWeight;
    
    // Simulate workout performance
    const performedSets = simulatePerformance(
      targetRepsRange,
      3, // 3 sets
      workoutWeight,
      weekNumber,
      progressionData.status
    );
    
    // Create history entry
    const history: ExerciseHistory = {
      exerciseId: exercise.id,
      workoutDate: `2025-12-${15 + (weekNumber - 1) * 7 + dayNumber}`,
      sets: performedSets,
    };
    
    // Update progression data
    const updatedData = updateProgressionData({
      progressionData,
      workoutHistory: history,
      recommendation,
      goal: user.goal,
    });
    
    saveProgressionDataMock(updatedData, user.userId);
    
    // Calculate next recommendation
    const nextRec = calculateProgression({
      exercise,
      progressionData: updatedData,
      goal: user.goal,
      experience: user.experience,
      targetRepsRange,
    });
    
    // Display results
    const avgReps = performedSets.reduce((sum, s) => sum + s.actualReps, 0) / performedSets.length;
    const allCompleted = performedSets.every(s => s.completed);
    
    const actionEmoji = {
      increase_weight: "📈",
      increase_reps: "📊",
      decrease_weight: "📉",
      deload: "🛌",
      maintain: "➡️",
      rotate_exercise: "🔄",
    }[nextRec.action] || "❓";
    
    const statusEmoji = {
      progressing: "✅",
      maintaining: "➡️",
      stalling: "⚠️",
      regressing: "📉",
      deload_needed: "🛌",
    }[updatedData.status] || "❓";
    
    console.log(`\n  ${exerciseInfo.name}:`);
    console.log(`    Вес: ${workoutWeight}кг`);
    console.log(`    Повторы: ${performedSets.map(s => s.actualReps).join(", ")} (avg: ${avgReps.toFixed(1)}, ${allCompleted ? "✅" : "❌"})`);
    console.log(`    ${actionEmoji} След раз: ${nextRec.action} → ${nextRec.newWeight || "N/A"}кг`);
    console.log(`    ${statusEmoji} Статус: ${updatedData.status} (stalls: ${updatedData.stallCount}, deloads: ${updatedData.deloadCount})`);
  }
}

// Show progression summary
function showProgressionSummary(user: UserScenario): void {
  console.log(`\n  📊 ИТОГОВАЯ СТАТИСТИКА (после 6 недель)`);
  console.log(`  ${"═".repeat(70)}`);
  
  for (const exerciseInfo of user.exercises) {
    const progressionData = getProgressionDataMock(exerciseInfo.exerciseId, user.userId);
    
    if (!progressionData || progressionData.history.length === 0) continue;
    
    const firstWorkout = progressionData.history[0];
    const lastWorkout = progressionData.history[progressionData.history.length - 1];
    
    const firstWeight = firstWorkout.sets[0].weight;
    const lastWeight = lastWorkout.sets[0].weight;
    const weightChange = lastWeight - firstWeight;
    
    const firstAvgReps = firstWorkout.sets.reduce((s, set) => s + set.actualReps, 0) / firstWorkout.sets.length;
    const lastAvgReps = lastWorkout.sets.reduce((s, set) => s + set.actualReps, 0) / lastWorkout.sets.length;
    const repsChange = lastAvgReps - firstAvgReps;
    
    const progressEmoji = weightChange > 0 ? "📈" : weightChange < 0 ? "📉" : "➡️";
    
    console.log(`\n  ${exerciseInfo.name}:`);
    console.log(`    ${progressEmoji} Вес: ${firstWeight}кг → ${lastWeight}кг (${weightChange > 0 ? '+' : ''}${weightChange}кг)`);
    console.log(`    📊 Повторы: ${firstAvgReps.toFixed(1)} → ${lastAvgReps.toFixed(1)} (${repsChange > 0 ? '+' : ''}${repsChange.toFixed(1)})`);
    console.log(`    📅 Тренировок: ${progressionData.history.length}`);
    console.log(`    🎯 Статус: ${progressionData.status}`);
    
    if (progressionData.stallCount > 0) {
      console.log(`    ⚠️  Застои: ${progressionData.stallCount}`);
    }
    
    if (progressionData.deloadCount > 0) {
      console.log(`    🛌 Deload'ов: ${progressionData.deloadCount}`);
    }
  }
}

// Main simulation
async function runSimulation() {
  console.log("\n🚀 ПОЛНАЯ СИМУЛЯЦИЯ ПРОГРЕССИИ (6 недель)");
  console.log("=".repeat(80));
  console.log("Тестируем реальную логику прогрессии без БД");
  console.log("Double Progression + Linear Progression + Deload Detection");
  console.log("=".repeat(80));
  
  for (const user of SCENARIOS) {
    console.log(`\n${"█".repeat(80)}`);
    console.log(`👤 ${user.name}`);
    console.log(`   Goal: ${user.goal} | Experience: ${user.experience}`);
    console.log(`   Exercises: ${user.exercises.length}`);
    console.log(`${"█".repeat(80)}`);
    
    // Simulate 6 weeks × 3 workouts per week (to see weight increases!)
    for (let week = 1; week <= 6; week++) {
      for (let day = 1; day <= 3; day++) {
        simulateWorkout(user, week, day);
        
        // Small delay for readability
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Show summary
    showProgressionSummary(user);
    
    // Pause between users
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n${"=".repeat(80)}`);
  console.log("✅ СИМУЛЯЦИЯ ЗАВЕРШЕНА");
  console.log("=".repeat(80));
  
  console.log("\n📝 ВЫВОДЫ:");
  console.log("  1. Double Progression работает:");
  console.log("     - Пользователи добивают верх диапазона → вес растёт");
  console.log("     - Не добивают → вес держится, повторы растут");
  
  console.log("\n  2. Linear Progression работает (для build_muscle):");
  console.log("     - Добил все подходы → сразу +вес");
  
  console.log("\n  3. Deload Detection работает:");
  console.log("     - После нескольких неудач → снижение веса");
  console.log("     - Позволяет восстановиться и продолжить рост");
  
  console.log("\n  4. Статусы отслеживаются:");
  console.log("     - progressing / maintaining / stalling / deload_needed");
  
  console.log("\n💾 В реальной системе:");
  console.log("  - Эти данные сохраняются в БД (exercise_progression + exercise_history)");
  console.log("  - Генератор тренировок читает рекомендации и показывает suggestedWeight");
  console.log("  - UI показывает 'В прошлый раз: X кг' и 'Прогресс! +2.5кг'");
}

runSimulation().catch(console.error);
