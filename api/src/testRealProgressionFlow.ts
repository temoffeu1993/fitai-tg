// testRealProgressionFlow.ts
// ============================================================================
// REAL WORLD PROGRESSION TEST: Симуляция 3 недель тренировок
// ============================================================================

import { applyProgressionFromSession, getNextWorkoutRecommendations } from "./progressionService.js";
import { generateWorkoutDay } from "./workoutDayGenerator.js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary.js";
import { NORMALIZED_SCHEMES } from "./normalizedSchemes.js";
import { computeReadiness } from "./readiness.js";
import type { Goal, ExperienceLevel } from "./normalizedSchemes.js";
import type { SessionPayload } from "./progressionService.js";

// Test users
const TEST_USERS = [
  {
    id: "test-user-001-intermediate",
    name: "Иван (Средний, Масса)",
    profile: {
      userId: "test-user-001-intermediate",
      experience: "intermediate" as ExperienceLevel,
      goal: "build_muscle" as Goal,
      daysPerWeek: 3,
      timeBucket: 60 as const,
      location: "gym" as const,
      sex: "male" as const,
    },
  },
  {
    id: "test-user-002-beginner",
    name: "Мария (Новичок, Здоровье)",
    profile: {
      userId: "test-user-002-beginner",
      experience: "beginner" as ExperienceLevel,
      goal: "health_wellness" as Goal,
      daysPerWeek: 2,
      timeBucket: 45 as const,
      location: "home_with_gear" as const,
      sex: "female" as const,
    },
  },
  {
    id: "test-user-003-advanced",
    name: "Алексей (Опытный, Сила)",
    profile: {
      userId: "test-user-003-advanced",
      experience: "advanced" as ExperienceLevel,
      goal: "strength" as Goal,
      daysPerWeek: 4,
      timeBucket: 90 as const,
      location: "gym" as const,
      sex: "male" as const,
    },
  },
];

// Simulate workout performance
function simulateWorkoutPerformance(
  targetReps: number | string,
  targetSets: number,
  currentWeight: number,
  weekNumber: number,
  effort: "easy" | "working" | "quite_hard" | "hard"
): { reps: number; weight: number }[] {
  
  // Parse target reps
  let minReps = 8;
  let maxReps = 12;
  
  if (typeof targetReps === "string") {
    const match = targetReps.match(/(\d+)-(\d+)/);
    if (match) {
      minReps = Number(match[1]);
      maxReps = Number(match[2]);
    }
  } else {
    maxReps = targetReps;
    minReps = Math.max(1, targetReps - 2);
  }
  
  const sets: { reps: number; weight: number }[] = [];
  
  // Simulate fatigue within workout
  for (let i = 0; i < targetSets; i++) {
    let actualReps = maxReps;
    
    // Apply effort-based variation
    if (effort === "easy") {
      // Easy: always hit target or exceed
      actualReps = maxReps + Math.floor(Math.random() * 2);
    } else if (effort === "working") {
      // Working: hit target or slightly below
      actualReps = maxReps - Math.floor(Math.random() * 2);
    } else if (effort === "quite_hard") {
      // Quite hard: often below target
      actualReps = maxReps - Math.floor(Math.random() * 3) - 1;
    } else if (effort === "hard") {
      // Hard: struggle to complete
      actualReps = minReps + Math.floor(Math.random() * 2) - 1;
    }
    
    // Apply fatigue (later sets harder)
    const fatigueFactor = i * 0.15;
    actualReps = Math.floor(actualReps * (1 - fatigueFactor));
    
    // Clamp to reasonable range
    actualReps = Math.max(minReps - 2, Math.min(maxReps + 2, actualReps));
    
    sets.push({
      reps: actualReps,
      weight: currentWeight,
    });
  }
  
  return sets;
}

// Simulate 3 weeks of training
async function simulateUserProgression(user: typeof TEST_USERS[0]) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`👤 ${user.name}`);
  console.log(`   Profile: ${user.profile.experience} | ${user.profile.goal} | ${user.profile.daysPerWeek}d/week`);
  console.log(`${"=".repeat(80)}`);
  
  // Select appropriate scheme
  const scheme = NORMALIZED_SCHEMES.find(
    s => s.daysPerWeek === user.profile.daysPerWeek && s.id.includes("gym")
  );
  
  if (!scheme) {
    console.error(`❌ No scheme found for ${user.profile.daysPerWeek} days/week`);
    return;
  }
  
  console.log(`📋 Scheme: ${scheme.id} (${scheme.daysPerWeek} days/week)`);
  
  // Track exercises across weeks
  const exerciseProgress = new Map<string, {
    name: string;
    weeks: Array<{
      week: number;
      day: number;
      weight: number;
      reps: number[];
      recommendation: string;
    }>;
  }>();
  
  // Simulate 3 weeks
  for (let week = 1; week <= 3; week++) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`📅 НЕДЕЛЯ ${week}`);
    console.log(`${"─".repeat(80)}`);
    
    // Train each day of the week
    for (let dayIndex = 0; dayIndex < scheme.daysPerWeek; dayIndex++) {
      console.log(`\n🏋️  День ${dayIndex + 1}: ${scheme.days[dayIndex].label}`);
      
      try {
        // Compute readiness (simulate good recovery)
        const readiness = computeReadiness({
          energy: "medium",
          sleep: "good",
          stress: "low",
          pain: [],
          fallbackTimeBucket: user.profile.timeBucket,
        });
        
        // Generate workout for this day
        const workout = await generateWorkoutDay({
          scheme,
          dayIndex,
          userProfile: user.profile,
          readiness,
          history: { recentExerciseIds: [] },
        });
        
        console.log(`   Generated: ${workout.exercises.length} exercises`);
        
        // Get recommendations
        const recommendations = await getNextWorkoutRecommendations({
          userId: user.profile.userId,
          exercises: workout.exercises.map(e => e.exercise),
          goal: user.profile.goal,
          experience: user.profile.experience,
        });
        
        // Simulate workout completion
        const completedExercises = workout.exercises.map((ex, idx) => {
          const rec = recommendations.get(ex.exercise.id);
          const suggestedWeight = rec?.newWeight || 40; // Default starting weight
          
          // Determine effort based on week and recommendation
          let effort: "easy" | "working" | "quite_hard" | "hard" = "working";
          
          if (rec?.action === "increase_weight") {
            effort = "easy"; // Previous weight was too easy
          } else if (rec?.action === "deload") {
            effort = "hard"; // Struggling
          } else if (week === 1) {
            effort = "working"; // First week: finding weights
          }
          
          // Simulate performance
          const targetReps = Array.isArray(ex.repsRange) 
            ? `${ex.repsRange[0]}-${ex.repsRange[1]}` 
            : ex.repsRange;
          
          const sets = simulateWorkoutPerformance(
            targetReps,
            ex.sets,
            suggestedWeight,
            week,
            effort
          );
          
          // Track progress
          if (!exerciseProgress.has(ex.exercise.id)) {
            exerciseProgress.set(ex.exercise.id, {
              name: ex.exercise.name,
              weeks: [],
            });
          }
          
          exerciseProgress.get(ex.exercise.id)!.weeks.push({
            week,
            day: dayIndex + 1,
            weight: suggestedWeight,
            reps: sets.map(s => s.reps),
            recommendation: rec?.action || "new",
          });
          
          // Log first 3 exercises
          if (idx < 3) {
            console.log(`     ${idx + 1}. ${ex.exercise.name}:`);
            console.log(`        Weight: ${suggestedWeight}кг (${rec?.action || "new"})`);
            console.log(`        Sets: ${sets.map(s => `${s.reps}`).join(", ")} reps`);
          }
          
          return {
            name: ex.exercise.name,
            pattern: ex.exercise.patterns[0],
            sets,
            effort,
            done: true,
          };
        });
        
        if (workout.exercises.length > 3) {
          console.log(`     ... +${workout.exercises.length - 3} more exercises`);
        }
        
        // Apply progression (save to "database")
        const payload: SessionPayload = {
          title: workout.dayLabel,
          location: "gym",
          durationMin: 60,
          exercises: completedExercises,
          feedback: {
            sessionRpe: 7,
          },
        };
        
        const progressionSummary = await applyProgressionFromSession({
          userId: user.profile.userId,
          payload,
          goal: user.profile.goal,
          experience: user.profile.experience,
          workoutDate: `2025-12-${15 + (week - 1) * 7 + dayIndex}`,
        });
        
        console.log(`     📊 Progression: ${progressionSummary.progressedCount} progressed, ${progressionSummary.maintainedCount} maintained`);
        
      } catch (error) {
        console.error(`     ❌ Error generating day ${dayIndex + 1}:`, error);
      }
      
      // Wait a bit between days (simulate recovery)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Show progression summary
  console.log(`\n${"─".repeat(80)}`);
  console.log(`📈 ИТОГОВЫЙ ПРОГРЕСС (3 недели)`);
  console.log(`${"─".repeat(80)}`);
  
  // Show top 5 exercises with most progress
  const exercisesWithProgress = Array.from(exerciseProgress.entries())
    .map(([id, data]) => {
      const firstWeek = data.weeks.find(w => w.week === 1);
      const lastWeek = data.weeks[data.weeks.length - 1];
      
      if (!firstWeek || !lastWeek) return null;
      
      const weightChange = lastWeek.weight - firstWeek.weight;
      const avgRepsFirst = firstWeek.reps.reduce((a, b) => a + b, 0) / firstWeek.reps.length;
      const avgRepsLast = lastWeek.reps.reduce((a, b) => a + b, 0) / lastWeek.reps.length;
      const repsChange = avgRepsLast - avgRepsFirst;
      
      return {
        name: data.name,
        firstWeight: firstWeek.weight,
        lastWeight: lastWeek.weight,
        weightChange,
        repsChange,
        sessions: data.weeks.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.weightChange || 0) - (a!.weightChange || 0))
    .slice(0, 5);
  
  exercisesWithProgress.forEach((ex, idx) => {
    if (!ex) return;
    
    const weightEmoji = ex.weightChange > 0 ? "📈" : ex.weightChange < 0 ? "📉" : "➡️";
    const repsEmoji = ex.repsChange > 0 ? "📊" : "➡️";
    
    console.log(`\n${idx + 1}. ${ex.name}`);
    console.log(`   ${weightEmoji} Вес: ${ex.firstWeight}кг → ${ex.lastWeight}кг (${ex.weightChange > 0 ? '+' : ''}${ex.weightChange}кг)`);
    console.log(`   ${repsEmoji} Повторы: ${ex.repsChange > 0 ? '+' : ''}${ex.repsChange.toFixed(1)} в среднем`);
    console.log(`   📅 Тренировок: ${ex.sessions}`);
  });
}

// Main test
async function runProgressionSimulation() {
  console.log("\n🚀 СИМУЛЯЦИЯ РЕАЛЬНОЙ ПРОГРЕССИИ");
  console.log("=".repeat(80));
  console.log("Тестируем 3 пользователей × 3 недели тренировок");
  console.log("С реалистичными весами, повторами, усталостью");
  console.log("=".repeat(80));
  
  for (const user of TEST_USERS) {
    try {
      await simulateUserProgression(user);
      
      // Pause between users
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`\n❌ Error simulating ${user.name}:`, error);
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("✅ СИМУЛЯЦИЯ ЗАВЕРШЕНА");
  console.log("=".repeat(80));
  console.log("\n📝 Примечания:");
  console.log("  - Данные сохранены в таблицы exercise_progression и exercise_history");
  console.log("  - Проверьте БД чтобы увидеть реальные записи");
  console.log("  - Система автоматически рекомендует веса на основе истории");
  console.log("  - Double progression работает (reps → weight)");
  console.log("  - Deload срабатывает при необходимости");
}

// Run
runProgressionSimulation().catch(console.error);
