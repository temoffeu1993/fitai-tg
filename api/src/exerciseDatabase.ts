// База упражнений для быстрого подбора по паттернам движения
// ============================================================================

import { MovementPattern } from "./workoutTemplates.js";

type Exercise = {
  name: string;
  equipment: "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";
  difficulty: "beginner" | "intermediate" | "advanced";
};

// База упражнений по паттернам движения
// Partial - не все паттерны покрыты, будет расширяться
export const EXERCISE_DATABASE: Partial<Record<MovementPattern, Exercise[]>> = {
  horizontal_press: [
    { name: "Жим штанги лёжа", equipment: "barbell", difficulty: "beginner" },
    { name: "Жим гантелей лёжа", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Жим в тренажёре Смита", equipment: "machine", difficulty: "beginner" },
    { name: "Отжимания на брусьях", equipment: "bodyweight", difficulty: "intermediate" },
  ],
  
  incline_press: [
    { name: "Жим штанги на наклонной скамье", equipment: "barbell", difficulty: "beginner" },
    { name: "Жим гантелей на наклонной скамье", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Жим в Хаммере на наклон", equipment: "machine", difficulty: "beginner" },
  ],
  
  overhead_press: [
    { name: "Жим штанги стоя", equipment: "barbell", difficulty: "intermediate" },
    { name: "Жим гантелей сидя", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Жим в тренажёре на плечи", equipment: "machine", difficulty: "beginner" },
  ],
  
  horizontal_pull: [
    { name: "Тяга штанги в наклоне", equipment: "barbell", difficulty: "intermediate" },
    { name: "Тяга гантелей в наклоне", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Тяга т-грифа", equipment: "barbell", difficulty: "beginner" },
    { name: "Тяга нижнего блока к поясу", equipment: "cable", difficulty: "beginner" },
  ],
  
  vertical_pull: [
    { name: "Подтягивания", equipment: "bodyweight", difficulty: "intermediate" },
    { name: "Тяга верхнего блока к груди", equipment: "cable", difficulty: "beginner" },
    { name: "Тяга верхнего блока за голову", equipment: "cable", difficulty: "intermediate" },
  ],
  
  squat_pattern: [
    { name: "Приседания со штангой на спине", equipment: "barbell", difficulty: "intermediate" },
    { name: "Приседания с гантелями", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Жим ногами", equipment: "machine", difficulty: "beginner" },
    { name: "Гоблет-приседания", equipment: "dumbbell", difficulty: "beginner" },
  ],
  
  hip_hinge: [
    { name: "Румынская тяга со штангой", equipment: "barbell", difficulty: "intermediate" },
    { name: "Румынская тяга с гантелями", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Гиперэкстензии", equipment: "bodyweight", difficulty: "beginner" },
  ],
  
  lunge_pattern: [
    { name: "Выпады с гантелями", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Болгарские сплит-приседания", equipment: "dumbbell", difficulty: "intermediate" },
    { name: "Выпады со штангой", equipment: "barbell", difficulty: "intermediate" },
  ],
  
  hip_thrust: [
    { name: "Ягодичный мост со штангой", equipment: "barbell", difficulty: "beginner" },
    { name: "Ягодичный мост с гантелей", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Тяга ногами в тренажёре", equipment: "machine", difficulty: "beginner" },
  ],
  
  lateral_raise: [
    { name: "Махи гантелями в стороны", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Махи в кроссовере", equipment: "cable", difficulty: "beginner" },
  ],
  
  triceps_extension: [
    { name: "Французский жим лёжа", equipment: "barbell", difficulty: "intermediate" },
    { name: "Разгибания на трицепс в блоке", equipment: "cable", difficulty: "beginner" },
    { name: "Разгибания с гантелей из-за головы", equipment: "dumbbell", difficulty: "beginner" },
  ],
  
  biceps_curl: [
    { name: "Подъём штанги на бицепс", equipment: "barbell", difficulty: "beginner" },
    { name: "Подъём гантелей на бицепс", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Подъём на бицепс в блоке", equipment: "cable", difficulty: "beginner" },
  ],
  
  core_anti_extension: [
    { name: "Планка", equipment: "bodyweight", difficulty: "beginner" },
    { name: "Rollout на ролике", equipment: "bodyweight", difficulty: "intermediate" },
    { name: "Подъём ног в висе", equipment: "bodyweight", difficulty: "intermediate" },
  ],
  
  core_anti_rotation: [
    { name: "Боковая планка", equipment: "bodyweight", difficulty: "beginner" },
    { name: "Паллоф-пресс", equipment: "cable", difficulty: "intermediate" },
  ],
  
  core_flexion: [
    { name: "Скручивания на пресс", equipment: "bodyweight", difficulty: "beginner" },
    { name: "Скручивания на блоке", equipment: "cable", difficulty: "beginner" },
  ],
  
  carry: [
    { name: "Прогулка фермера", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Прогулка с гантелями над головой", equipment: "dumbbell", difficulty: "intermediate" },
  ],
  
  cardio_steady: [
    { name: "Бег на дорожке", equipment: "machine", difficulty: "beginner" },
    { name: "Велотренажёр", equipment: "machine", difficulty: "beginner" },
    { name: "Эллипс", equipment: "machine", difficulty: "beginner" },
  ],
  
  cardio_intervals: [
    { name: "Интервальный бег", equipment: "machine", difficulty: "intermediate" },
    { name: "Бёрпи", equipment: "bodyweight", difficulty: "intermediate" },
    { name: "Скакалка", equipment: "bodyweight", difficulty: "beginner" },
  ],
  
  decline_press: [
    { name: "Жим штанги на скамье с отрицательным наклоном", equipment: "barbell", difficulty: "intermediate" },
    { name: "Жим гантелей на скамье с отрицательным наклоном", equipment: "dumbbell", difficulty: "intermediate" },
  ],
  
  dips: [
    { name: "Отжимания на брусьях", equipment: "bodyweight", difficulty: "intermediate" },
    { name: "Отжимания на брусьях с весом", equipment: "bodyweight", difficulty: "advanced" },
  ],
  
  deadlift: [
    { name: "Становая тяга классическая", equipment: "barbell", difficulty: "advanced" },
    { name: "Становая тяга сумо", equipment: "barbell", difficulty: "advanced" },
  ],
  
  row: [
    { name: "Тяга штанги к поясу", equipment: "barbell", difficulty: "intermediate" },
    { name: "Тяга гантели одной рукой", equipment: "dumbbell", difficulty: "beginner" },
  ],
  
  leg_extension: [
    { name: "Разгибание ног сидя", equipment: "machine", difficulty: "beginner" },
  ],
  
  leg_curl: [
    { name: "Сгибание ног лёжа", equipment: "machine", difficulty: "beginner" },
  ],
  
  calf_raise: [
    { name: "Подъём на носки стоя", equipment: "machine", difficulty: "beginner" },
    { name: "Подъём на носки сидя", equipment: "machine", difficulty: "beginner" },
  ],
  
  front_raise: [
    { name: "Подъём гантелей перед собой", equipment: "dumbbell", difficulty: "beginner" },
  ],
  
  rear_delt_fly: [
    { name: "Разводка на задние дельты", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Обратные разводки в тренажёре", equipment: "machine", difficulty: "beginner" },
  ],
  
  chest_fly: [
    { name: "Разводка гантелей лёжа", equipment: "dumbbell", difficulty: "beginner" },
    { name: "Сведение рук в кроссовере", equipment: "cable", difficulty: "beginner" },
  ],
  
  triceps_pushdown: [
    { name: "Разгибания на трицепс в блоке", equipment: "cable", difficulty: "beginner" },
  ],
  
  hammer_curl: [
    { name: "Молотковые подъёмы", equipment: "dumbbell", difficulty: "beginner" },
  ],
  
  glute_isolation: [
    { name: "Отведение ноги назад в кроссовере", equipment: "cable", difficulty: "beginner" },
    { name: "Ягодичные махи", equipment: "bodyweight", difficulty: "beginner" },
  ],
  
  adductor: [
    { name: "Сведение ног в тренажёре", equipment: "machine", difficulty: "beginner" },
  ],
  
  abductor: [
    { name: "Отведение ног в тренажёре", equipment: "machine", difficulty: "beginner" },
  ],
};

/**
 * Подбирает конкретное упражнение по паттерну движения
 */
export function selectExerciseByPattern(
  pattern: MovementPattern,
  userLevel: "beginner" | "intermediate" | "advanced",
  usedExercises: Set<string> = new Set()
): string {
  const exercises = EXERCISE_DATABASE[pattern] || [];
  
  if (exercises.length === 0) {
    return `Упражнение на ${pattern}`;
  }
  
  // Фильтруем: подходящие по уровню и не использованные
  const suitable = exercises.filter(ex => {
    // Упражнение не должно быть использовано
    if (usedExercises.has(ex.name)) return false;
    
    // Упражнение должно быть по уровню или легче
    if (userLevel === "beginner") return ex.difficulty === "beginner";
    if (userLevel === "intermediate") return ex.difficulty !== "advanced";
    return true; // advanced может всё
  });
  
  // Если подходящих нет - берём любое не использованное
  const available = suitable.length > 0 ? suitable : exercises.filter(ex => !usedExercises.has(ex.name));
  
  if (available.length === 0) {
    // Все использованы - берём первое
    return exercises[0].name;
  }
  
  // Выбираем случайное из подходящих
  const selected = available[Math.floor(Math.random() * available.length)];
  return selected.name;
}

