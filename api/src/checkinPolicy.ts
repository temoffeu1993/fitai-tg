// checkinPolicy.ts
// ============================================================================
// CHECK-IN DECISION POLICY
// 
// Определяет, можно ли выполнять запланированный день или нужен swap/recovery
// на основе чек-ина (боль, травмы, усталость)
// 
// ИСПОЛЬЗУЕТ: readiness.ts для единой оценки готовности
// ============================================================================

import type { NormalizedWorkoutScheme } from "./normalizedSchemes.js";
import { type DayType, type Readiness } from "./readiness.js";

// ============================================================================
// TYPES
// ============================================================================

export type StartDecision =
  | { action: "keep_day"; notes?: string[] }
  | { action: "swap_day"; targetDayIndex: number; targetDayLabel: string; notes: string[] }
  | { action: "recovery"; notes: string[] }
  | { action: "skip"; notes: string[] };

// ============================================================================
// MAIN FUNCTION: Decide what action to take
// ============================================================================

export function decideStartAction(args: {
  scheme: NormalizedWorkoutScheme;
  dayIndex: number;
  readiness: Readiness; // ИЗМЕНЕНО: принимаем готовый readiness
}): StartDecision {
  const { scheme, dayIndex, readiness } = args;

  console.log("\n🎯 [DECISION POLICY] ================================");
  console.log(`  Scheme: ${scheme.id} | Day ${dayIndex}: ${scheme.days[dayIndex].label}`);
  console.log(`  Focus: ${scheme.days[dayIndex].focus || 'N/A'}`);
  console.log(`  Readiness: severity=${readiness.severity}, intent=${readiness.intent}, pain=${readiness.maxPainLevel}/10`);

  // КРИТИЧЕСКИЙ уровень → skip (боль 8-10, множественные травмы)
  if (readiness.severity === "critical") {
    return {
      action: "skip",
      notes: [
        "⚠️ Сегодня лучше пропустить силовую тренировку.",
        ...readiness.reasons,
        "Рекомендуем: отдых, лёгкую прогулку 20-30 мин или консультацию специалиста.",
      ],
    };
  }

  // Определяем тип текущего дня
  const currentDayType = determineDayType(scheme, dayIndex);

  // Проверяем, конфликтует ли день с ограничениями
  const isBlocked = readiness.blockedDayTypes.includes(currentDayType);

  if (!isBlocked) {
    // День не заблокирован → можно выполнять. Не обещаем изменения объёма/упражнений на этом уровне:
    // фактические изменения формируются генератором/trim-логикой и возвращаются отдельно.
    const notes: string[] = [];
    if (readiness.reasons.length > 0) notes.push(...readiness.reasons);

    console.log(`  ✅ KEEP_DAY (severity: ${readiness.severity}, not blocked)`);
    console.log("==================================================\n");
    return {
      action: "keep_day",
      notes: notes.length > 0 ? notes : undefined,
    };
  }

  // День заблокирован → ищем замену
  const swapTarget = findSwapDay(scheme, dayIndex, readiness.blockedDayTypes);

  if (swapTarget !== null) {
    const targetDay = scheme.days[swapTarget];
    console.log(`  🔄 SWAP_DAY: ${scheme.days[dayIndex].label} → Day ${swapTarget}: ${targetDay.label}`);
    console.log("==================================================\n");
    return {
      action: "swap_day",
      targetDayIndex: swapTarget,
      targetDayLabel: targetDay.label,
      notes: [
        `🔄 Сегодня делаем "${targetDay.label}" вместо "${scheme.days[dayIndex].label}"`,
        ...readiness.reasons,
        `"${scheme.days[dayIndex].label}" перенесём на ближайший подходящий день.`,
      ],
    };
  }

  // Не нашли подходящий swap → recovery
  console.log(`  🧘 RECOVERY (no swap found)`);
  console.log("==================================================\n");
  return {
    action: "recovery",
    notes: [
      "🛌 Сегодня заменяем тренировку на восстановительную сессию",
      ...readiness.reasons,
      "Рекомендуем: 15-25 мин лёгкой мобильности или прогулку.",
    ],
  };
}

// analyzeCheckinLimitations() УДАЛЕНА - теперь используем computeReadiness()
// mapPainToBlocks() УДАЛЕНА - перенесена в readiness.ts

// ============================================================================
// HELPER: Determine day type from scheme
// ============================================================================

function determineDayType(scheme: NormalizedWorkoutScheme, dayIndex: number): DayType {
  const day = scheme.days[dayIndex];
  if (!day) return "unknown";

  const label = day.label.toLowerCase();
  const focus = day.focus.toLowerCase();

  // Push days
  if (label.includes("push") || focus.includes("chest") || focus.includes("shoulder") || focus.includes("грудь") || focus.includes("плеч")) {
    return "push";
  }

  // Pull days
  if (label.includes("pull") || focus.includes("back") || focus.includes("спин")) {
    return "pull";
  }

  // Legs days
  if (label.includes("legs") || label.includes("ноги") || focus.includes("legs") || focus.includes("ног")) {
    return "legs";
  }

  // Upper days
  if (label.includes("upper") || label.includes("верх")) {
    return "upper";
  }

  // Lower days
  if (label.includes("lower") || label.includes("низ")) {
    return "lower";
  }

  // Full body
  if (label.includes("full") || label.includes("всё тело") || scheme.daysPerWeek <= 3) {
    return "full_body";
  }

  return "unknown";
}

// ============================================================================
// HELPER: Find swap day
// ============================================================================

function findSwapDay(
  scheme: NormalizedWorkoutScheme,
  currentDayIndex: number,
  blockedDayTypes: DayType[]
): number | null {
  // Приоритет swap (для PPL/UL схем)
  const currentType = determineDayType(scheme, currentDayIndex);

  // Список приоритетов замены
  let priorities: DayType[] = [];

  if (currentType === "push") {
    // Push заблокирован → сначала Legs, потом Pull
    priorities = ["legs", "lower", "pull"];
  } else if (currentType === "pull") {
    // Pull заблокирован → Legs, потом Push
    priorities = ["legs", "lower", "push"];
  } else if (currentType === "legs") {
    // Legs заблокирован → Pull, потом Push
    priorities = ["pull", "upper", "push"];
  } else if (currentType === "upper") {
    priorities = ["lower", "legs"];
  } else if (currentType === "lower") {
    priorities = ["upper", "pull", "push"];
  }

  // Ищем первый подходящий день
  for (const priority of priorities) {
    for (let i = 0; i < scheme.daysPerWeek; i++) {
      if (i === currentDayIndex) continue;

      const dayType = determineDayType(scheme, i);
      if (dayType === priority && !blockedDayTypes.includes(dayType)) {
        return i;
      }
    }
  }

  // Не нашли → null (будет recovery)
  return null;
}


