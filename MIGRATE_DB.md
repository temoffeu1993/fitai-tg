# 🔧 Миграция БД для схем тренировок

## Проблема
Таблицы созданы с UUID типом, а scheme_id должен быть TEXT

## Решение

### Вариант 1: Быстрая миграция (меняет типы колонок)

```bash
cd /Users/artemryzih/Desktop/fitai-tg

psql 'postgresql://neondb_owner:npg_bv1Fpq4HDXCg@ep-broad-breeze-ag7l1a52.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -f api/sql/fix_scheme_id_type.sql
```

### Вариант 2: Полное пересоздание (если миграция не работает)

```bash
cd /Users/artemryzih/Desktop/fitai-tg

# 1. Пересоздаём таблицы
psql 'postgresql://neondb_owner:npg_bv1Fpq4HDXCg@ep-broad-breeze-ag7l1a52.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -f api/sql/migrate_schemes_to_text_id.sql

# 2. Загружаем схемы
psql 'postgresql://neondb_owner:npg_bv1Fpq4HDXCg@ep-broad-breeze-ag7l1a52.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -f api/sql/seed_all_schemes.sql
```

## После миграции

Проверь что всё работает:

```sql
-- Проверить тип колонки
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'workout_schemes' AND column_name = 'id';

-- Должно быть: data_type = 'text'

-- Проверить количество схем
SELECT COUNT(*) FROM workout_schemes;
-- Должно быть: 26
```

## Тестирование

После миграции:
1. Пройди онбординг
2. Выбери схему тренировки
3. Нажми "Подтвердить выбор"
4. Должен быть редирект на дашборд без ошибок

✅ Готово!
