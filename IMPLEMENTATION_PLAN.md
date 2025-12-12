# План реализации системы с минимумами объёма

> Упрощённая система: одно упражнение = одна PRIMARY группа

---

## 🎯 Цель

Добавить гарантии минимального объёма по целевым группам мышц без усложнения с синергистами.

---

## 📋 План реализации (поэтапно)

### ✅ Этап 0: Документация (ГОТОВО)
- [x] MUSCLE_VOLUME_TARGETS.md - целевые объёмы
- [x] SCIENTIFIC_TRAINING_STRUCTURE.md - научная структура
- [x] TRAINING_RULES_ARCHITECTURE.md - архитектура правил
- [x] IMPLEMENTATION_PLAN.md - этот документ

---

### 🔄 Этап 1: Обновление типов (БОЛЬШАЯ ЗАДАЧА)

**Файл:** `api/src/workoutTemplates.ts`

**Изменения:**
1. Добавить `MuscleGroup` type
2. Добавить `Exercise` type с `primaryMuscle`
3. Изменить `MOVEMENT_PATTERNS_DB: Record<MovementPattern, string[]>` 
   → `Record<MovementPattern, Exercise[]>`

**Проблема:** ~200+ упражнений нужно переписать!

**Решение:** Делать постепенно, начиная с Push Day паттернов.

---

### 🔄 Этап 2: Обновление trainingRulesLibrary

**Файл:** `api/src/trainingRulesLibrary.ts`

**Добавить в каждый DayTrainingRules:**

```typescript
targetMuscleVolume: {
  chest: {
    beginner: {
      60: { min: 8, max: 10 },
      75: { min: 10, max: 12 },
      90: { min: 12, max: 14 }
    },
    intermediate: {
      60: { min: 10, max: 12 },
      75: { min: 12, max: 14 },
      90: { min: 14, max: 16 }
    },
    advanced: {
      60: { min: 12, max: 14 },
      75: { min: 14, max: 16 },
      90: { min: 16, max: 18 }
    }
  },
  shoulders: { /* аналогично */ },
  triceps: { /* аналогично */ }
}
```

**Для каждого дня:**
- Push Day: chest, shoulders, triceps
- Pull Day: back, rear_delts, biceps
- Legs Day: quads, hamstrings, glutes, calves
- Upper Body: chest, back, shoulders, triceps, biceps
- Lower Body: quads, hamstrings, glutes, calves
- Full Body: упрощённо (верх + низ)

---

### 🔄 Этап 3: Обновление intelligentWorkoutBuilder

**Файл:** `api/src/intelligentWorkoutBuilder.ts`

**Добавить функцию подсчёта объёма:**

```typescript
function calculateMuscleVolume(
  exercises: Array<{ name: string; sets: number }>,
  rules: DayTrainingRules
): Record<MuscleGroup, number> {
  const volume: Record<string, number> = {};
  
  exercises.forEach(ex => {
    // Найти упражнение в базе
    const exercise = findExerciseByName(ex.name, rules);
    if (exercise) {
      const muscle = exercise.primaryMuscle;
      volume[muscle] = (volume[muscle] || 0) + ex.sets;
    }
  });
  
  return volume;
}
```

**Добавить проверку минимумов:**

```typescript
function checkVolumeGaps(
  actualVolume: Record<MuscleGroup, number>,
  targets: TargetMuscleVolume,
  level: string,
  time: number
): Record<MuscleGroup, number> {
  const gaps: Record<string, number> = {};
  
  Object.keys(targets).forEach(muscle => {
    const target = targets[muscle][level][time];
    const actual = actualVolume[muscle] || 0;
    const gap = Math.max(0, target.min - actual);
    if (gap > 0) {
      gaps[muscle] = gap;
    }
  });
  
  return gaps;
}
```

**Обновить промпт AI:**

```typescript
if (hasGaps) {
  prompt += `
⚠️ ТЕКУЩИЙ ОБЪЁМ НЕ ДОСТИГНУТ!

НУЖНО ДОБАВИТЬ:
${Object.entries(gaps).map(([muscle, gap]) => 
  `- ${muscle}: +${gap} подходов`
).join('\n')}

Выбери ещё упражнения из изоляции чтобы покрыть недостаток!
`;
}
```

---

### 🔄 Этап 4: Тестирование

**Файл:** `api/src/scientificWorkoutTest.ts`

**Добавить тесты:**
- Проверка минимумов по группам
- Проверка что AI добавляет упражнения
- Проверка разных уровней/времени

---

## ⚠️ ПРОБЛЕМА: Слишком большая задача!

**Этап 1** требует переписать ~200+ упражнений:
```typescript
// БЫЛО:
horizontal_press: ["Жим лёжа", "Жим гантелей", ...]

// СТАЛО:
horizontal_press: [
  { name: "Жим лёжа", pattern: "horizontal_press", primaryMuscle: "chest", type: "compound" },
  { name: "Жим гантелей", pattern: "horizontal_press", primaryMuscle: "chest", type: "compound" },
  ...
]
```

Это займёт много времени и может внести ошибки!

---

## 💡 АЛЬТЕРНАТИВНОЕ РЕШЕНИЕ: Упрощённое

### Вариант A: Маппинг паттернов → мышцы (БЫСТРО!)

**Не переписывать упражнения, а добавить маппинг:**

```typescript
// api/src/patternMuscleMapping.ts
export const PATTERN_TO_MUSCLE: Record<MovementPattern, MuscleGroup> = {
  // PUSH
  horizontal_press: "chest",
  incline_press: "chest",
  decline_press: "chest",
  overhead_press: "shoulders",
  dips: "chest",  // или "triceps" для отжиманий от скамьи
  
  // PULL
  horizontal_pull: "mid_back",
  vertical_pull: "lats",
  deadlift: "lower_back",
  row: "mid_back",
  
  // LEGS
  squat_pattern: "quads",
  hip_hinge: "hamstrings",
  lunge_pattern: "quads",
  hip_thrust: "glutes",
  leg_extension: "quads",
  leg_curl: "hamstrings",
  calf_raise: "calves",
  
  // ISOLATION
  lateral_raise: "side_delts",
  front_raise: "front_delts",
  rear_delt_fly: "rear_delts",
  chest_fly: "chest",
  triceps_extension: "triceps",
  triceps_pushdown: "triceps",
  biceps_curl: "biceps",
  hammer_curl: "biceps"
};
```

**Преимущества:**
- ✅ Быстро (1 файл, ~50 строк)
- ✅ Не ломает существующий код
- ✅ Легко поддерживать

**Недостатки:**
- ⚠️ Один паттерн = одна мышца (упрощение)
- ⚠️ Не учитывает что "Отжимания на брусьях" могут быть на грудь или трицепс

---

### Вариант B: Полная переработка (ДОЛГО!)

Переписать все упражнения с метаданными.

**Преимущества:**
- ✅ Гибко
- ✅ Точно

**Недостатки:**
- ❌ Долго (~2-3 часа работы)
- ❌ Риск ошибок
- ❌ Сложно тестировать

---

## 🎯 РЕКОМЕНДАЦИЯ

**Начать с Варианта A (маппинг паттернов):**

1. Создать `patternMuscleMapping.ts` (5 минут)
2. Обновить `intelligentWorkoutBuilder.ts` (30 минут)
3. Добавить `targetMuscleVolume` в `trainingRulesLibrary.ts` (1 час)
4. Протестировать (30 минут)

**Итого: ~2 часа вместо 5-6 часов!**

**Потом (если нужно):**
- Постепенно переписывать упражнения
- Добавлять детали (difficulty, вариации)

---

## ✅ Следующий шаг

Что делаем?

1. **Вариант A** - быстрый маппинг паттернов (рекомендую!)
2. **Вариант B** - полная переработа (долго)
3. **Отложить** - сначала протестировать текущую систему

Скажи что предпочитаешь! 🚀

