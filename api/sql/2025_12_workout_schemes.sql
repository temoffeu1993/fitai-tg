-- Таблица для хранения готовых схем тренировок
CREATE TABLE IF NOT EXISTS workout_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  days_per_week INT NOT NULL,
  min_minutes INT NOT NULL, -- минимальная рекомендуемая длительность
  max_minutes INT NOT NULL, -- максимальная рекомендуемая длительность
  split_type TEXT NOT NULL, -- 'full_body', 'upper_lower', 'push_pull_legs', 'bro_split', etc.
  experience_levels TEXT[] NOT NULL, -- ['never_trained', 'long_break', 'training_regularly', 'training_experienced']
  goals TEXT[] NOT NULL, -- ['lose_weight', 'build_muscle', 'athletic_body', 'lower_body_focus', 'strength', 'health_wellness']
  equipment_required TEXT[] NOT NULL, -- ['bodyweight', 'dumbbells', 'barbell', 'gym_full']
  day_labels JSONB NOT NULL, -- [{day: 1, label: 'Push', focus: '...'}]
  benefits TEXT[] NOT NULL, -- Преимущества этой схемы
  notes TEXT, -- Дополнительные заметки
  intensity TEXT NOT NULL DEFAULT 'moderate', -- 'low', 'moderate', 'high'
  target_sex TEXT DEFAULT 'any', -- 'male', 'female', 'any'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы для быстрого поиска подходящих схем
CREATE INDEX IF NOT EXISTS idx_schemes_days_per_week ON workout_schemes(days_per_week);
CREATE INDEX IF NOT EXISTS idx_schemes_experience_gin ON workout_schemes USING GIN (experience_levels);
CREATE INDEX IF NOT EXISTS idx_schemes_goals_gin ON workout_schemes USING GIN (goals);

-- Таблица для хранения выбранной схемы пользователя
CREATE TABLE IF NOT EXISTS user_workout_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id UUID NOT NULL REFERENCES workout_schemes(id),
  selected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_schemes_user ON user_workout_schemes(user_id);
