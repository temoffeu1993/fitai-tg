// Проверка что Face Pull больше не в Push
import { generateWorkoutDay } from "./src/workoutDayGenerator.js";
import { NORMALIZED_SCHEMES } from "./src/normalizedSchemes.js";

const ppl3 = NORMALIZED_SCHEMES.find(s => s.id === "ppl_3x_condensed")!;

const pushWorkout = generateWorkoutDay({
  scheme: ppl3,
  dayIndex: 0,
  userProfile: {
    experience: "advanced",
    goal: "build_muscle",
    daysPerWeek: 3,
    timeBucket: 90,
    equipment: "gym_full",
  },
  checkin: { energyLevel: "medium", sleepHours: 7, stressLevel: "medium" },
});

console.log("✅ PUSH ДЕНЬ - ПОСЛЕ ИСПРАВЛЕНИЯ:\n");

pushWorkout.exercises.forEach((ex, i) => {
  console.log(`${i + 1}. ${ex.exercise.name} (${ex.exercise.patterns.join(", ")})`);
  
  if (ex.exercise.patterns.includes("rear_delts")) {
    console.log(`   ❌ ОШИБКА! rear_delts всё ещё есть!`);
  }
});

const hasFacePull = pushWorkout.exercises.some(ex => 
  ex.exercise.name.toLowerCase().includes("лицу") || 
  ex.exercise.name.toLowerCase().includes("face")
);

console.log(`\n${hasFacePull ? "❌ Face Pull ВСЁ ЕЩЁ в Push дне!" : "✅ Face Pull НЕТ в Push дне!"}`);
