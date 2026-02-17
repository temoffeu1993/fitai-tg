import placeholderIllustration from "@/assets/zhim.webp";

export function getExerciseIllustration(exerciseId?: string): string | undefined {
    if (!exerciseId) return undefined;
    return placeholderIllustration;
}
