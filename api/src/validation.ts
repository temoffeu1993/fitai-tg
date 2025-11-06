// Валидация с использованием zod
import { z } from 'zod';

export const TelegramAuthSchema = z.object({
  initData: z.string().min(1)
});

export const OnboardingDataSchema = z.object({
  age: z.number().min(10).max(100).optional(),
  sex: z.enum(['m', 'f']).optional(),
  height: z.number().min(100).max(250).optional(),
  weight: z.number().min(30).max(300).optional(),
  goal: z.string().optional(),
  experience: z.enum(['novice', 'intermediate', 'advanced']).optional(),
  freq: z.number().min(1).max(7).optional(),
  duration: z.number().min(15).max(180).optional(),
  location: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional()
});

export const SaveOnboardingSchema = z.object({
  data: OnboardingDataSchema
});

export const CompleteWorkoutSchema = z.object({
  workoutId: z.string().uuid(),
  result: z.object({
    completed: z.boolean(),
    exercises: z.array(z.object({
      name: z.string(),
      sets: z.array(z.object({
        reps: z.number().min(0),
        weight: z.number().min(0).optional()
      }))
    })),
    notes: z.string().optional()
  })
});

// Функция для валидации
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true, data: T } | { success: false, error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      };
    }
    return { success: false, error: 'Validation failed' };
  }
}