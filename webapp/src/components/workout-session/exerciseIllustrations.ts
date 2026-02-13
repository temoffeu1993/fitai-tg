/**
 * Mapping of exercise IDs to mascot illustration assets.
 * Only exercises with generated illustrations are listed here.
 * Returns undefined for exercises without illustrations.
 */

import squat from "@/assets/exercises/squat.png";
import benchPress from "@/assets/exercises/bench_press.png";
import pullup from "@/assets/exercises/pullup.png";
import overheadPress from "@/assets/exercises/overhead_press.png";

const illustrationMap: Record<string, string> = {
    sq_back_squat: squat,
    ho_barbell_bench_press: benchPress,
    ve_pull_up: pullup,
    ve_standing_overhead_press: overheadPress,
    ve_seated_db_shoulder_press: overheadPress, // similar enough
};

export function getExerciseIllustration(exerciseId?: string): string | undefined {
    if (!exerciseId) return undefined;
    return illustrationMap[exerciseId];
}
