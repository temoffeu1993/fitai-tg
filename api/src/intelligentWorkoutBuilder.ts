// Умный сборщик тренировок (AI получает ПРАВИЛА, а не готовую структуру)
// ============================================================================

import OpenAI from "openai";
import { config } from "./config.js";
import { DayTrainingRules, WorkoutGenerationContext } from "./trainingRulesTypes.js";
import { MOVEMENT_PATTERNS_DB } from "./workoutTemplates.js";
import { generateWorkoutRules, TrainingGoal, ExperienceLevel } from "./trainingRulesEngine.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

export type GeneratedWorkout = {
  title: string;
  focus: string;
  mode: string;
  warmup: { duration: number; guidelines: string };
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    rest: number;
    weight?: string;
    notes?: string;
    targetMuscles: string[];
  }>;
  cooldown: { duration: number; guidelines: string };
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
  scientificNotes: string[];
  adaptationNotes?: string[];
  warnings?: string[];
};

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Генерирует тренировку из ПРАВИЛ (не из готовой структуры!)
 */
export async function buildIntelligentWorkout(params: {
  rules: DayTrainingRules;
  userProfile: {
    experience: ExperienceLevel;
    goal: TrainingGoal;
    timeAvailable: number;
    daysPerWeek: number;
  };
  checkIn?: {
    energy?: string;
    pain?: Array<{ location: string; level: number }>;
    injuries?: string[];
    mode?: string;
  };
  history?: {
    recentExercises: string[];
    weightHistory: Record<string, string>;
  };
}): Promise<GeneratedWorkout> {
  
  const { rules, userProfile, checkIn, history } = params;
  
  console.log("\n🧠 УМНАЯ ГЕНЕРАЦИЯ ТРЕНИРОВКИ");
  console.log(`Template: ${rules.name}`);
  console.log(`Профиль: ${userProfile.experience}, ${userProfile.goal}, ${userProfile.timeAvailable} мин`);
  
  // Научные расчёты
  let scientificParams = generateWorkoutRules({
    experience: userProfile.experience,
    goal: userProfile.goal,
    timeAvailable: userProfile.timeAvailable,
    daysPerWeek: userProfile.daysPerWeek
  });
  
  // Режим тренировки из чекина
  const mode = checkIn?.mode || "normal";
  
  // АДАПТАЦИЯ ПАРАМЕТРОВ ПОД РЕЖИМ
  if (mode === "recovery") {
    // Восстановительный: -50% объём, -40% интенсивность
    scientificParams = {
      ...scientificParams,
      maxExercises: Math.max(3, Math.round(scientificParams.maxExercises * 0.5)),
      totalSets: Math.round(scientificParams.totalSets * 0.5)
    };
    console.log(`⚠️ RECOVERY MODE: Снижено до ${scientificParams.maxExercises} упражнений, ${scientificParams.totalSets} подходов`);
  } else if (mode === "light") {
    // Облегчённый: -30% объём, -20% интенсивность
    scientificParams = {
      ...scientificParams,
      maxExercises: Math.max(4, Math.round(scientificParams.maxExercises * 0.7)),
      totalSets: Math.round(scientificParams.totalSets * 0.7)
    };
    console.log(`⚠️ LIGHT MODE: Снижено до ${scientificParams.maxExercises} упражнений, ${scientificParams.totalSets} подходов`);
  } else if (mode === "push") {
    // Усиленный: +15% объём
    scientificParams = {
      ...scientificParams,
      maxExercises: Math.min(9, Math.round(scientificParams.maxExercises * 1.15)),
      totalSets: Math.round(scientificParams.totalSets * 1.15)
    };
    console.log(`💪 PUSH MODE: Увеличено до ${scientificParams.maxExercises} упражнений, ${scientificParams.totalSets} подходов`);
  } else {
    console.log(`✓ NORMAL MODE: ${scientificParams.maxExercises} упражнений, ${scientificParams.totalSets} подходов`);
  }
  
  // Строим контекст для AI
  const context: WorkoutGenerationContext = {
    rules,
    userProfile,
    checkIn: checkIn ? {
      energy: (checkIn.energy as any) || "medium",
      pain: checkIn.pain || [],
      injuries: checkIn.injuries || [],
      mode: (mode as any)
    } : undefined,
    history: history || { recentExercises: [], weightHistory: {} }
  };
  
  // AI генерирует тренировку
  const aiWorkout = await callAIForWorkout(context, scientificParams, mode);
  
  // Финальная сборка
  const totalSets = aiWorkout.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const estimatedDuration = rules.warmup.durationMinutes + 
                           (aiWorkout.exercises.length * 8) + // ~8 мин на упражнение
                           rules.cooldown.durationMinutes;
  
  return {
    title: rules.name,
    focus: rules.focus,
    mode,
    warmup: {
      duration: rules.warmup.durationMinutes,
      guidelines: rules.warmup.guidelines
    },
    exercises: aiWorkout.exercises,
    cooldown: {
      duration: rules.cooldown.durationMinutes,
      guidelines: rules.cooldown.guidelines
    },
    totalExercises: aiWorkout.exercises.length,
    totalSets,
    estimatedDuration,
    scientificNotes: [
      ...rules.scientificNotes,
      `Расчёт под ${userProfile.experience}/${userProfile.goal}: ${scientificParams.maxExercises} упражнений, ${scientificParams.totalSets} подходов`
    ],
    adaptationNotes: aiWorkout.adaptationNotes,
    warnings: aiWorkout.warnings
  };
}

/**
 * Вызов AI с профессиональным промптом
 */
async function callAIForWorkout(
  context: WorkoutGenerationContext,
  scientificParams: any,
  mode: string
): Promise<{ exercises: any[]; adaptationNotes?: string[]; warnings?: string[] }> {
  
  const prompt = buildProfessionalPrompt(context, scientificParams, mode);
  
  console.log("\n🤖 Вызов AI (gpt-4o-mini)...");
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: PROFESSIONAL_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,  // Больше креативности
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI не вернул ответ");
    }
    
    const result = JSON.parse(content);
    
    if (!result.exercises || !Array.isArray(result.exercises)) {
      throw new Error("AI вернул некорректный формат");
    }
    
    console.log(`✓ AI сгенерировал ${result.exercises.length} упражнений`);
    result.exercises.forEach((ex: any, i: number) => {
      console.log(`  ${i + 1}. ${ex.name} - ${ex.sets}×${ex.reps}, отдых ${ex.rest}с ${ex.weight ? `(${ex.weight})` : ''}`);
    });
    
    return {
      exercises: result.exercises.map((ex: any) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        weight: ex.weight,
        notes: ex.cues || ex.technique,
        targetMuscles: ex.targetMuscles || []
      })),
      adaptationNotes: result.adaptationNotes,
      warnings: result.warnings
    };
    
  } catch (error) {
    console.error("❌ Ошибка AI:", error);
    throw error;
  }
}

/**
 * Системный промпт (определяет роль AI)
 */
const PROFESSIONAL_SYSTEM_PROMPT = `Ты элитный персональный тренер с 15+ годами опыта работы с профессиональными спортсменами.

ТВОЯ ЗАДАЧА: Создать ПЕРСОНАЛЬНУЮ тренировку на основе ПРАВИЛ и КОНТЕКСТА.

КЛЮЧЕВЫЕ ПРИНЦИПЫ:

1. ПРОФЕССИОНАЛИЗМ
   - Это реальная тренировка, а не щадящая зарядка
   - Нагрузка должна быть ощутимой и эффективной
   - Восстановительный режим ≠ бесполезная тренировка

2. ПЕРСОНАЛИЗАЦИЯ
   - Учитывай историю (НЕ ПОВТОРЯЙ последние упражнения!)
   - Подбирай веса на основе прогресса
   - Адаптируйся под чекин (травмы, усталость, энергия)

3. РАЗНООБРАЗИЕ БЕЗ ДУБЛИРОВАНИЯ
   - Не повторяй упражнения из последних 2-3 тренировок
   - Меняй углы, оборудование, вариации
   - Но сохраняй основные паттерны движений
   - ⚠️ КРИТИЧНО: НЕ дублируй функции движений в одной тренировке!
     Примеры дублирования (ИЗБЕГАЙ):
     * Армейский жим + жим гантелей сидя = оба overhead press
     * Разводки гантелей + разводки в тренажере = один и тот же pec fly
     * Французский жим лёжа + разгибания в блоке = оба triceps extension
   - Один паттерн движения = ОДНО упражнение (кроме явных исключений)
   - Исключения: разные углы для груди (горизонтальный + наклонный ОК)

4. ПРОГРЕССИЯ
   - Если есть история с весом → увеличивай на 2.5-5 кг
   - Если нет истории → дай рекомендацию стартового веса
   - Учитывай уровень опыта при выборе упражнений

5. НАУЧНОСТЬ
   - Следуй правилам структуры (compound → secondary → isolation)
   - Соблюдай диапазоны подходов/повторений/отдыха
   - Первыми ставь тяжелые базовые, потом лёгкие изоляционные

6. БЕЗОПАСНОСТЬ
   - При травмах - избегай проблемных зон
   - При низкой энергии - снижай интенсивность, но не делай бесполезным
   - Для новичков - проще упражнения (машины, гантели)

СВОБОДА ВЫБОРА:
- Ты САМ выбираешь упражнения из рекомендованных паттернов
- Ты САМ решаешь точное количество в рамках диапазона
- Ты САМ определяешь порядок (но базовые первыми!)

Возвращай ТОЛЬКО валидный JSON, без markdown и пояснений.`;

/**
 * Строит промпт для AI
 */
function buildProfessionalPrompt(
  context: WorkoutGenerationContext,
  scientificParams: any,
  mode: string
): string {
  
  const { rules, userProfile, checkIn, history } = context;
  
  // Формируем список доступных упражнений С ПАТТЕРНАМИ (чтобы избежать дублирования)
  const availableExercises = {
    compound: rules.recommendedPatterns.compound.flatMap(pattern => 
      (MOVEMENT_PATTERNS_DB[pattern] || []).map(name => ({ name, pattern }))
    ).slice(0, 30),
    secondary: rules.recommendedPatterns.secondary.flatMap(pattern => 
      (MOVEMENT_PATTERNS_DB[pattern] || []).map(name => ({ name, pattern }))
    ).slice(0, 30),
    isolation: rules.recommendedPatterns.isolation.flatMap(pattern => 
      (MOVEMENT_PATTERNS_DB[pattern] || []).map(name => ({ name, pattern }))
    ).slice(0, 30)
  };
  
  return `
# ЗАДАНИЕ: Создай персональную тренировку "${rules.name}"

## ПРАВИЛА ТРЕНИРОВКИ

**Фокус:** ${rules.focus}

**Структура:**
- Всего упражнений: **${scientificParams.maxExercises}** (адаптировано под ${mode} режим)
- Подходов всего: **~${scientificParams.totalSets}**

${formatStructureRules(rules.structure, mode)}

**Формат тренировки:** ${rules.format.type}
${rules.format.notes}

---

## ПРОФИЛЬ КЛИЕНТА

- Уровень: **${userProfile.experience}** (beginner/intermediate/advanced)
- Цель: **${userProfile.goal}** (strength/hypertrophy/metabolic)
- Время: **${userProfile.timeAvailable} минут**
- Частота: ${userProfile.daysPerWeek} раз/нед

---

## ИСТОРИЯ ТРЕНИРОВОК

${history.recentExercises.length > 0 ? `
**Недавние упражнения (НЕ ПОВТОРЯТЬ!):**
${history.recentExercises.slice(0, 20).map((ex, i) => `${i + 1}. ${ex}`).join('\n')}
` : '**История пуста** - первая тренировка, выбирай классические упражнения'}

${Object.keys(history.weightHistory).length > 0 ? `
**История весов (используй для прогрессии!):**
${Object.entries(history.weightHistory).slice(0, 10).map(([ex, w]) => `- ${ex}: ${w}`).join('\n')}
` : '**Весов в истории нет** - подбери стартовые рекомендации'}

---

${checkIn ? `
## АДАПТАЦИЯ ПОД ЧЕКИН

- Режим: **${checkIn.mode.toUpperCase()}**
${checkIn.mode === 'recovery' ? '  ⚠️ ВОССТАНОВИТЕЛЬНЫЙ: Снижен объём, меньше интенсивность, НО тренировка должна быть эффективной!' : ''}
${checkIn.mode === 'light' ? '  ⚠️ ОБЛЕГЧЁННЫЙ: Снижен объём на 30%, фокус на технику' : ''}
${checkIn.mode === 'push' ? '  💪 УСИЛЕННЫЙ: Отличное состояние, можно дать больше!' : ''}
- Энергия: ${checkIn.energy}
${checkIn.injuries.length > 0 ? `- ⛔ ТРАВМЫ/ОГРАНИЧЕНИЯ: ${checkIn.injuries.join(', ')}` : '- Травм нет'}
${checkIn.pain.length > 0 ? `- ⚠️ БОЛЬ: ${checkIn.pain.map(p => `${p.location} (${p.level}/10)`).join(', ')}` : ''}
` : '**Чекин не пройден** - стандартная нагрузка'}

---

## ДОСТУПНЫЕ УПРАЖНЕНИЯ (С ПАТТЕРНАМИ)

⚠️ КРИТИЧНО: Каждое упражнение имеет [паттерн]. НЕ выбирай два упражнения с одинаковым паттерном!

### БАЗОВЫЕ (Compound) - выбери ${rules.structure.compound.count[0]}-${rules.structure.compound.count[1]}:
${availableExercises.compound.map((ex: any, i) => `${i + 1}. ${ex.name} [${ex.pattern}]`).join('\n')}

### ВТОРИЧНЫЕ (Secondary) - выбери ${rules.structure.secondary.count[0]}-${rules.structure.secondary.count[1]}:
${availableExercises.secondary.map((ex: any, i) => `${i + 1}. ${ex.name} [${ex.pattern}]`).join('\n')}

### ИЗОЛЯЦИЯ (Isolation) - выбери ${rules.structure.isolation.count[0]}-${rules.structure.isolation.count[1]}:
${availableExercises.isolation.map((ex: any, i) => `${i + 1}. ${ex.name} [${ex.pattern}]`).join('\n')}

---

## ТВОЯ ЗАДАЧА

1. Выбери ${scientificParams.maxExercises} упражнений из списков выше
2. ⚠️ ОБЯЗАТЕЛЬНО: Каждое упражнение должно иметь УНИКАЛЬНЫЙ [паттерн]
   - Если выбрал "Армейский жим [overhead_press]", НЕ выбирай "Жим гантелей сидя [overhead_press]"
   - Если выбрал "Разводки гантелей [pec_fly]", НЕ выбирай "Разводки в тренажере [pec_fly]"
   - AI должен гарантировать: все паттерны РАЗНЫЕ!
3. Начни с базовых (самые тяжелые), закончи изоляцией
4. НЕ повторяй упражнения из истории
5. Подбери веса на основе прогресса (или дай рекомендации)
6. Для каждого упражнения дай 1-2 технических подсказки

---

## ФОРМАТ ОТВЕТА

\`\`\`json
{
  "exercises": [
    {
      "name": "Жим штанги лёжа",
      "type": "compound",
      "sets": 4,
      "reps": "6-8",
      "rest": 120,
      "weight": "62.5 кг",
      "cues": "Лопатки сведены, ноги в пол, локти под 45°",
      "targetMuscles": ["грудь", "трицепс", "передние дельты"]
    },
    ... (ещё ${scientificParams.maxExercises - 1} упражнений)
  ],
  "adaptationNotes": ["Заметка об адаптации под чекин если нужно"],
  "warnings": ["Предупреждения если есть"]
}
\`\`\`

**ВАЖНО:**
- Количество упражнений = ${scientificParams.maxExercises}
- ⚠️ КАЖДОЕ упражнение должно иметь УНИКАЛЬНЫЙ [паттерн]!
  * Проверь: все [паттерны] в твоём выборе РАЗНЫЕ
  * Если два упражнения имеют одинаковый [паттерн] → выбери только ОДНО
- Начни с compound, закончи isolation
- НЕ повторяй недавние упражнения
- Возвращай ТОЛЬКО JSON
`.trim();
}

/**
 * Форматирует правила структуры для промпта (с адаптацией под режим)
 */
function formatStructureRules(structure: any, mode: string): string {
  // Адаптация подходов под режим
  const setsMultiplier = mode === "recovery" ? 0.75 : mode === "light" ? 0.85 : mode === "push" ? 1.1 : 1.0;
  const restMultiplier = mode === "recovery" ? 1.3 : mode === "light" ? 1.15 : mode === "push" ? 0.9 : 1.0;
  
  const compoundSets = Math.max(2, Math.round(structure.compound.sets * setsMultiplier));
  const secondarySets = Math.max(2, Math.round(structure.secondary.sets * setsMultiplier));
  const isolationSets = Math.max(2, Math.round(structure.isolation.sets * setsMultiplier));
  
  const compoundRest = Math.round(structure.compound.rest * restMultiplier);
  const secondaryRest = Math.round(structure.secondary.rest * restMultiplier);
  const isolationRest = Math.round(structure.isolation.rest * restMultiplier);
  
  // Адаптация количества упражнений каждого типа
  const getAdaptedCount = (baseCount: [number, number]): [number, number] => {
    if (mode === "recovery") {
      return [Math.max(1, baseCount[0] - 1), Math.max(2, baseCount[1] - 1)];
    } else if (mode === "light") {
      return [Math.max(1, baseCount[0]), Math.max(2, baseCount[1] - 1)];
    } else if (mode === "push") {
      return [baseCount[0], Math.min(4, baseCount[1] + 1)];
    }
    return baseCount;
  };
  
  const compoundCount = getAdaptedCount(structure.compound.count);
  const secondaryCount = getAdaptedCount(structure.secondary.count);
  const isolationCount = getAdaptedCount(structure.isolation.count);
  
  return `
**БАЗОВЫЕ (Compound):**
- Количество: ${compoundCount[0]}-${compoundCount[1]} упражнений ${mode !== "normal" ? `(адаптировано под ${mode})` : ''}
- Подходы: ${compoundSets} ${setsMultiplier !== 1.0 ? `(адаптировано: ${structure.compound.sets} → ${compoundSets})` : ''}
- Повторения: ${structure.compound.reps}
- Отдых: ${compoundRest} сек ${restMultiplier !== 1.0 ? `(адаптировано: ${structure.compound.rest} → ${compoundRest})` : ''}
- Приоритет: Выполняются ПЕРВЫМИ
- Примечание: ${structure.compound.notes}

**ВТОРИЧНЫЕ (Secondary):**
- Количество: ${secondaryCount[0]}-${secondaryCount[1]} упражнений ${mode !== "normal" ? `(адаптировано)` : ''}
- Подходы: ${secondarySets}
- Повторения: ${structure.secondary.reps}
- Отдых: ${secondaryRest} сек
- Приоритет: После базовых
- Примечание: ${structure.secondary.notes}

**ИЗОЛЯЦИЯ (Isolation):**
- Количество: ${isolationCount[0]}-${isolationCount[1]} упражнений ${mode !== "normal" ? `(адаптировано)` : ''}
- Подходы: ${isolationSets}
- Повторения: ${structure.isolation.reps}
- Отдых: ${isolationRest} сек
- Приоритет: В КОНЦЕ тренировки
- Примечание: ${structure.isolation.notes}
  `.trim();
}

