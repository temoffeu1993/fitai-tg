// periodization/userFacingLabels.ts
// ============================================================================
// USER-FACING LABELS — Russian-language explanations for the periodization
// system. Used by the API response to tell the user WHY their workout
// looks the way it does today.
//
// These are purely presentational — they don't affect workout logic.
// ============================================================================

import type { DayStyle, DUPIntensity, LoadBucket, WeekMode } from "./periodizationTypes.js";

// ============================================================================
// DAY STYLE LABELS
// ============================================================================

const DAY_STYLE_LABELS: Record<DayStyle, { title: string; subtitle: string }> = {
  strength_biased: {
    title: "Силовой день",
    subtitle: "Меньше повторов, больше вес, длиннее отдых",
  },
  hypertrophy_biased: {
    title: "Объёмный день",
    subtitle: "Больше повторов, умеренный вес, короче отдых",
  },
  balanced: {
    title: "Сбалансированная тренировка",
    subtitle: "Стандартный режим по твоей программе",
  },
  recovery: {
    title: "Восстановительная тренировка",
    subtitle: "Облегчённый режим для восстановления",
  },
  deload: {
    title: "Разгрузочная тренировка",
    subtitle: "Плановое снижение нагрузки для суперкомпенсации",
  },
};

// ============================================================================
// DUP INTENSITY LABELS
// ============================================================================

const DUP_LABELS: Record<DUPIntensity, string> = {
  heavy: "💪 Тяжёлый: акцент на силу (4–6 повторов)",
  medium: "⚖️ Средний: стандартный объём",
  light: "🔄 Лёгкий: больше повторов, меньше вес",
};

// ============================================================================
// WEEK MODE LABELS
// ============================================================================

const WEEK_MODE_LABELS: Record<WeekMode, string> = {
  accumulation: "📈 Неделя накопления — набираем объём",
  intensification: "🔥 Неделя интенсификации — увеличиваем нагрузку",
  deload: "🛌 Разгрузочная неделя — восстановление",
  realization: "🏆 Неделя реализации — закрепляем результат",
  normal: "Обычная тренировочная неделя",
};

// ============================================================================
// LOAD BUCKET LABELS
// ============================================================================

const LOAD_BUCKET_LABELS: Record<LoadBucket, string> = {
  calibration: "🎯 Подбор веса — пробуем найти рабочий вес",
  low_rep: "🏋️ Силовой режим — тяжёлые подходы",
  moderate_rep: "💪 Гипертрофия — рост мышц",
  high_rep: "🔥 Объёмный режим — лёгкий вес, много повторов",
};

// ============================================================================
// MAIN: Generate user-facing labels from periodization summary
// ============================================================================

export interface PeriodizationLabels {
  /** Day style title + subtitle */
  dayStyleLabel: string;
  dayStyleSubtitle: string;

  /** DUP info (null if DUP off) */
  periodizationNote: string | null;

  /** Week mode info */
  weekModeNote: string;

  /** Per-exercise load guidance (empty if no exercises) */
  loadGuidance: string | null;

  /** Adaptation reason (why this day differs from standard) */
  adaptationReason: string | null;
}

/**
 * Build user-facing labels from the serialized periodization summary.
 * Handles backward compat: if summary is null/undefined, returns neutral labels.
 */
export function buildPeriodizationLabels(summary: {
  dayStyle?: string;
  dayStyleReason?: string;
  dupIntensity?: string | null;
  weekMode?: string;
  isDeloadWeek?: boolean;
  splitFamily?: string;
  periodizationScope?: string;
  globalCalibrationMode?: boolean;
  allowedAggressiveness?: string;
} | null | undefined): PeriodizationLabels {
  if (!summary) {
    // Backward compat: old plans without periodization data
    return {
      dayStyleLabel: DAY_STYLE_LABELS.balanced.title,
      dayStyleSubtitle: DAY_STYLE_LABELS.balanced.subtitle,
      periodizationNote: null,
      weekModeNote: WEEK_MODE_LABELS.normal,
      loadGuidance: null,
      adaptationReason: null,
    };
  }

  // Day style
  const dayStyle = (summary.dayStyle ?? "balanced") as DayStyle;
  const styleInfo = DAY_STYLE_LABELS[dayStyle] ?? DAY_STYLE_LABELS.balanced;

  // DUP
  let periodizationNote: string | null = null;
  if (summary.dupIntensity && summary.periodizationScope !== "off") {
    periodizationNote = DUP_LABELS[summary.dupIntensity as DUPIntensity] ?? null;
  }

  // Week mode
  const weekMode = (summary.weekMode ?? "normal") as WeekMode;
  const weekModeNote = WEEK_MODE_LABELS[weekMode] ?? WEEK_MODE_LABELS.normal;

  // Load guidance
  let loadGuidance: string | null = null;
  if (summary.globalCalibrationMode) {
    loadGuidance = LOAD_BUCKET_LABELS.calibration;
  }

  // Adaptation reason
  const adaptationReason = summary.dayStyleReason ?? null;

  return {
    dayStyleLabel: styleInfo.title,
    dayStyleSubtitle: styleInfo.subtitle,
    periodizationNote,
    weekModeNote,
    loadGuidance,
    adaptationReason,
  };
}
