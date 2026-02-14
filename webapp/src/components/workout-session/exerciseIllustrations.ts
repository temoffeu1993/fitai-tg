/**
 * Mapping of exercise IDs to anatomical illustration assets.
 * Each illustration shows a 3D anatomical figure performing the exercise
 * with primary muscles highlighted in red/orange.
 * Only exercises with generated illustrations are listed here.
 * Returns undefined for exercises without illustrations.
 */

import squat from "@/assets/exercises/squat.png";
import deadlift from "@/assets/exercises/deadlift.png";
import pullup from "@/assets/exercises/pullup.png";
import overheadPress from "@/assets/exercises/overhead_press.png";

const illustrationMap: Record<string, string> = {
    // Squat pattern
    sq_back_squat: squat,
    sq_front_squat: squat,
    sq_goblet_squat: squat,
    sq_smith_squat: squat,
    sq_smith_squat_heels_elevated: squat,

    // Hip hinge / deadlift
    hi_conventional_deadlift: deadlift,
    hi_sumo_deadlift: deadlift,
    hi_barbell_rdl: deadlift,
    hi_db_rdl: deadlift,
    hi_smith_rdl: deadlift,

    // Vertical pull
    ve_pull_up: pullup,
    ve_assisted_pull_up: pullup,

    // Overhead press
    ve_standing_overhead_press: overheadPress,
    ve_seated_db_shoulder_press: overheadPress,
    ve_machine_shoulder_press: overheadPress,
    ve_arnold_press: overheadPress,
};

export function getExerciseIllustration(exerciseId?: string): string | undefined {
    if (!exerciseId) return undefined;
    return illustrationMap[exerciseId];
}
