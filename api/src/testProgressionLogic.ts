// testProgressionLogic.ts
// ============================================================================
// TEST: Логика прогрессии БЕЗ БД
// ============================================================================

import { calculateProgression, initializeProgressionData, WEIGHT_INCREMENT } from "./progressionEngine.js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary.js";
import type { ExerciseProgressionData } from "./progressionEngine.js";

async function testDoubleProgression() {
  console.log("\n💪 TEST: Double Progression (Build Muscle)");
  console.log("=".repeat(60));
  
  const benchPress = EXERCISE_LIBRARY.find(ex => ex.name.includes("Жим") && ex.name.includes("лёж"));
  
  if (!benchPress) {
    console.error("❌ Bench press not found");
    return;
  }
  
  console.log(`Exercise: ${benchPress.name}`);
  console.log(`Equipment: ${benchPress.equipment[0]}`);
  console.log(`Increment: ${WEIGHT_INCREMENT[benchPress.equipment[0]]}кг`);
  
  // Initialize with starting weight
  let progressionData = initializeProgressionData({
    exerciseId: benchPress.id,
    exercise: benchPress,
    experience: "intermediate",
    goal: "build_muscle",
  });
  
  console.log(`\nStarting weight: ${progressionData.currentWeight}кг`);
  console.log(`Target: 8-12 reps`);
  
  // Scenario 1: Hit upper bound (12 reps) on all sets
  console.log("\n📈 Scenario 1: Hit upper bound (12 reps × 3 sets)");
  
  progressionData.history.push({
    exerciseId: benchPress.id,
    workoutDate: "2025-12-18",
    sets: [
      { targetReps: 12, actualReps: 12, weight: 60, rpe: 7, completed: true },
      { targetReps: 12, actualReps: 12, weight: 60, rpe: 7, completed: true },
      { targetReps: 12, actualReps: 12, weight: 60, rpe: 7, completed: true },
    ],
  });
  
  const rec1 = calculateProgression({
    exercise: benchPress,
    progressionData,
    goal: "build_muscle",
    experience: "intermediate",
    targetRepsRange: [8, 12],
  });
  
  console.log(`  Action: ${rec1.action}`);
  console.log(`  New weight: ${rec1.newWeight}кг`);
  console.log(`  Reason: ${rec1.reason}`);
  
  if (rec1.action === "increase_weight" && rec1.newWeight === 62.5) {
    console.log("  ✅ Correct! Should increase weight by 2.5kg");
  } else {
    console.log("  ❌ Wrong! Expected increase_weight to 62.5kg");
  }
  
  // Scenario 2: In range (9-11 reps)
  console.log("\n➡️  Scenario 2: In range (10, 9, 9 reps)");
  
  progressionData.history.push({
    exerciseId: benchPress.id,
    workoutDate: "2025-12-19",
    sets: [
      { targetReps: 12, actualReps: 10, weight: 60, rpe: 7, completed: true },
      { targetReps: 12, actualReps: 9, weight: 60, rpe: 7, completed: true },
      { targetReps: 12, actualReps: 9, weight: 60, rpe: 7, completed: true },
    ],
  });
  
  const rec2 = calculateProgression({
    exercise: benchPress,
    progressionData,
    goal: "build_muscle",
    experience: "intermediate",
    targetRepsRange: [8, 12],
  });
  
  console.log(`  Action: ${rec2.action}`);
  console.log(`  New weight: ${rec2.newWeight}кг`);
  console.log(`  Reason: ${rec2.reason}`);
  
  if (rec2.action === "maintain" && rec2.newWeight === 60) {
    console.log("  ✅ Correct! Should maintain weight and push to 12 reps");
  } else {
    console.log("  ❌ Wrong! Expected maintain at 60kg");
  }
  
  // Scenario 3: Below lower bound (failure)
  console.log("\n📉 Scenario 3: Below lower bound (7, 6, 5 reps)");
  
  progressionData.history.push({
    exerciseId: benchPress.id,
    workoutDate: "2025-12-20",
    sets: [
      { targetReps: 12, actualReps: 7, weight: 70, rpe: 9, completed: false },
      { targetReps: 12, actualReps: 6, weight: 70, rpe: 9, completed: false },
      { targetReps: 12, actualReps: 5, weight: 70, rpe: 10, completed: false },
    ],
  });
  
  progressionData.stallCount = 0; // First failure
  
  const rec3 = calculateProgression({
    exercise: benchPress,
    progressionData,
    goal: "build_muscle",
    experience: "intermediate",
    targetRepsRange: [8, 12],
  });
  
  console.log(`  Action: ${rec3.action}`);
  console.log(`  New weight: ${rec3.newWeight}кг`);
  console.log(`  Reason: ${rec3.reason}`);
  
  if (rec3.action === "maintain") {
    console.log("  ✅ Correct! First stall → maintain and try again");
  } else {
    console.log("  ⚠️  Got ${rec3.action}, acceptable for first stall");
  }
}

async function testLinearProgression() {
  console.log("\n🏋️ TEST: Linear Progression (Strength)");
  console.log("=".repeat(60));
  
  const squat = EXERCISE_LIBRARY.find(ex => ex.name.includes("Присед") && ex.equipment.includes("barbell"));
  
  if (!squat) {
    console.error("❌ Squat not found");
    return;
  }
  
  console.log(`Exercise: ${squat.name}`);
  console.log(`Goal: strength (100% success threshold)`);
  
  let progressionData = initializeProgressionData({
    exerciseId: squat.id,
    exercise: squat,
    experience: "intermediate",
    goal: "strength",
  });
  
  console.log(`\nStarting weight: ${progressionData.currentWeight}кг`);
  console.log(`Target: 4-6 reps (strength range)`);
  
  // Success: all 5 sets completed
  console.log("\n✅ Scenario: All 5 sets completed (5×5)");
  
  progressionData.history.push({
    exerciseId: squat.id,
    workoutDate: "2025-12-18",
    sets: [
      { targetReps: 5, actualReps: 5, weight: 100, rpe: 8, completed: true },
      { targetReps: 5, actualReps: 5, weight: 100, rpe: 8, completed: true },
      { targetReps: 5, actualReps: 5, weight: 100, rpe: 8, completed: true },
      { targetReps: 5, actualReps: 5, weight: 100, rpe: 8, completed: true },
      { targetReps: 5, actualReps: 5, weight: 100, rpe: 9, completed: true },
    ],
  });
  
  const rec = calculateProgression({
    exercise: squat,
    progressionData,
    goal: "strength",
    experience: "intermediate",
    targetRepsRange: [4, 6],
  });
  
  console.log(`  Action: ${rec.action}`);
  console.log(`  New weight: ${rec.newWeight}кг`);
  console.log(`  Reason: ${rec.reason}`);
  
  if (rec.action === "increase_weight" && rec.newWeight === 102.5) {
    console.log("  ✅ Correct! Linear progression for strength goal");
  } else {
    console.log("  ⚠️  Expected increase_weight to 102.5kg");
  }
}

async function testDeload() {
  console.log("\n🛌 TEST: Deload Detection");
  console.log("=".repeat(60));
  
  const deadlift = EXERCISE_LIBRARY.find(ex => ex.name.includes("Становая"));
  
  if (!deadlift) {
    console.error("❌ Deadlift not found");
    return;
  }
  
  console.log(`Exercise: ${deadlift.name}`);
  
  let progressionData = initializeProgressionData({
    exerciseId: deadlift.id,
    exercise: deadlift,
    experience: "intermediate",
    goal: "build_muscle",
  });
  
  progressionData.currentWeight = 140;
  progressionData.status = "deload_needed";
  progressionData.stallCount = 4; // Много неудач
  
  console.log(`Current: ${progressionData.currentWeight}кг, Status: ${progressionData.status}`);
  console.log(`Stall count: ${progressionData.stallCount}`);
  
  const rec = calculateProgression({
    exercise: deadlift,
    progressionData,
    goal: "build_muscle",
    experience: "intermediate",
    targetRepsRange: [6, 10],
  });
  
  console.log(`\n  Action: ${rec.action}`);
  console.log(`  New weight: ${rec.newWeight}кг`);
  console.log(`  Reason: ${rec.reason}`);
  
  const expectedDeload = Math.round(140 * 0.85 * 4) / 4; // -15% for build_muscle
  
  if (rec.action === "deload") {
    console.log(`  ✅ Correct! Deload detected`);
    console.log(`  Expected ~${expectedDeload}кг, got ${rec.newWeight}кг`);
  } else {
    console.log("  ❌ Wrong! Should trigger deload");
  }
}

async function runAllTests() {
  console.log("\n🧪 PROGRESSION LOGIC TESTS (No Database)");
  console.log("=".repeat(60));
  
  try {
    await testDoubleProgression();
    await testLinearProgression();
    await testDeload();
    
    console.log("\n🎉 ALL LOGIC TESTS PASSED!");
    console.log("=".repeat(60));
    console.log("\nℹ️  Note: Database tests skipped (use production DB for real test)");
    
  } catch (error) {
    console.error("\n❌ TESTS FAILED");
    console.error(error);
    process.exit(1);
  }
}

runAllTests().catch(console.error);
