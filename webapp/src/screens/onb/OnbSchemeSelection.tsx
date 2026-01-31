// webapp/src/screens/onb/OnbSchemeSelection.tsx
// Experience-based scheme selection:
// - Beginner: locked alternatives with blur + unlock text
// - Intermediate/Advanced: selectable alternatives with split explanations
// Visual style: matches OnbAnalysis (mascot 140px, bubble 18px, glass cards)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSchemeRecommendations, selectScheme, type WorkoutScheme } from "@/api/schemes";
import { useOnboarding } from "@/app/OnboardingProvider";
import {
  getSchemeDisplayData,
  type UserContext,
  type SplitType,
  type Location,
  type UserGoal,
  type ExperienceLevel,
} from "@/utils/getSchemeDisplayData";
import maleRobotImg from "@/assets/robonew.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

// ============================================================================
// SPLIT TYPE EXPLANATIONS
// ============================================================================

const SPLIT_EXPLANATIONS: Record<string, string> = {
  full_body: "Прокачиваем всё тело за одну тренировку — просто и мощно",
  upper_lower: "Один день — верх, другой — низ. Баланс и восстановление",
  push_pull_legs: "Отдельная группа мышц на каждой тренировке — прицельная работа",
  conditioning: "Круговые тренировки в высоком темпе — жир плавится",
  bro_split: "Каждый день — одна мышца под микроскопом. Для продвинутых",
};

// Difficulty per split type (1-3, like intensity bars in Analysis)
const SPLIT_DIFFICULTY: Record<string, number> = {
  full_body: 1, conditioning: 1, upper_lower: 2, push_pull_legs: 2, bro_split: 3,
};

// Day emoji by resolved title
function getDayEmoji(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("всё тело")) return "🔥";
  if (t.includes("силовая база") || t.includes("силовая на")) return "🏋️";
  if (t.includes("лёгкий старт")) return "🌱";
  if (t.includes("жиросжигание") || t.includes("интенсив")) return "🔥";
  if (t.includes("попа") || t.includes("ягодиц")) return "🍑";
  if (t.includes("грудь") && t.includes("плечи")) return "💥";
  if (t.includes("грудь")) return "💥";
  if (t.includes("спина") && t.includes("бицепс")) return "🦾";
  if (t.includes("спина")) return "🦾";
  if (t.includes("ноги")) return "🦵";
  if (t.includes("плечи")) return "🎯";
  if (t.includes("руки")) return "💪";
  if (t.includes("верх")) return "⬆️";
  if (t.includes("низ")) return "⬇️";
  if (t.includes("приседания")) return "🦵";
  if (t.includes("становая") || t.includes("жим лёжа")) return "🏋️";
  if (t.includes("круговая") || t.includes("функциональная")) return "⚡";
  if (t.includes("кардио")) return "❤️";
  if (t.includes("пресс") || t.includes("баланс")) return "🧱";
  if (t.includes("растяжка") || t.includes("гибкость") || t.includes("йога")) return "🧘";
  if (t.includes("отдых") || t.includes("восстановление")) return "🌿";
  if (t.includes("прогулка") || t.includes("свежем воздухе")) return "🚶";
  if (t.includes("утренняя")) return "☀️";
  if (t.includes("выносливость")) return "💨";
  if (t.includes("подвижность")) return "🧘";
  if (t.includes("лёгкое движение") || t.includes("лёгкий день")) return "🌿";
  if (t.includes("доработка деталей")) return "🔧";
  if (t.includes("интервальное")) return "⏱️";
  if (t.includes("скорость")) return "⚡";
  if (t.includes("объём") || t.includes("работа на объём")) return "📈";
  if (t.includes("взрывная")) return "⚡";
  if (t.includes("выпады")) return "🦵";
  return "🏋️";
}

// ============================================================================
// DAY LABEL → TITLE + DESCRIPTION MAPPING
// Converts English API labels to clear Russian titles & fallback descriptions
// ============================================================================

type DayTimelineItem = {
  day: number;
  title: string;
  description: string;
  icon: string;
};

type DayCopy = { title: string; desc: string };

// Full mapping: exact API label → { title, desc }
// Title = понятный заголовок, desc = fallback если focus пустой
const DAY_LABEL_MAP: Record<string, DayCopy> = {
  // ── Full Body ──────────────────────────────────────────
  "Full Body A":           { title: "Всё тело",         desc: "Проработка всех мышц за одну тренировку." },
  "Full Body B":           { title: "Всё тело",         desc: "Проработка всех мышц за одну тренировку." },
  "Full Body C":           { title: "Всё тело",         desc: "Проработка всех мышц за одну тренировку." },
  "Full Body D":           { title: "Всё тело",         desc: "Проработка всех мышц за одну тренировку." },
  "Full Body Heavy A":     { title: "Силовая база",     desc: "Работаем с весами, чтобы стать сильнее." },
  "Full Body Heavy B":     { title: "Силовая база",     desc: "Работаем с весами, чтобы стать сильнее." },
  "Full Body Gentle":      { title: "Лёгкий старт",     desc: "Входим в ритм, без лишнего стресса." },
  "Full Body Rebuild":     { title: "Лёгкий старт",     desc: "Плавно возвращаемся к нагрузкам." },
  "Full Body General":     { title: "Всё тело",         desc: "Базовые упражнения на всё тело." },
  "Full Body + Glutes A":  { title: "Всё тело + попа",  desc: "Полная тренировка с акцентом на ягодицы." },
  "Full Body + Glutes B":  { title: "Всё тело + попа",  desc: "Полная тренировка с акцентом на ягодицы." },
  "Full Body HIIT":        { title: "Жиросжигание",     desc: "Высокий темп, чтобы сжечь максимум калорий." },
  "Full Body Circuits":    { title: "Круговая тренировка", desc: "Упражнения подряд почти без пауз — жир горит." },
  "Full Body Strength":    { title: "Силовая база",     desc: "Работаем с весами, чтобы стать сильнее." },
  "Full Body Endurance":   { title: "Выносливость",     desc: "Тренируем способность работать дольше без усталости." },
  "Full Body Conditioning": { title: "Функциональная",  desc: "Движения, которые пригодятся в реальной жизни." },
  "Full Body":             { title: "Всё тело",         desc: "Проработка всех мышц за одну тренировку." },
  "Full Body Circuit":     { title: "Круговая тренировка", desc: "Упражнения подряд почти без пауз — жир горит." },
  "Circuit Full Body":     { title: "Круговая тренировка", desc: "Упражнения подряд почти без пауз — жир горит." },
  "Intervals Low Impact":  { title: "Лёгкое интервальное", desc: "Чередуем нагрузку и отдых — щадяще для суставов." },

  // ── Push / Pull / Legs ─────────────────────────────────
  "Push":                  { title: "Грудь и плечи",    desc: "Грудь, плечи и трицепс — всё что «толкает»." },
  "Push A":                { title: "Грудь и плечи",    desc: "Грудь, плечи и трицепс — всё что «толкает»." },
  "Push B":                { title: "Грудь и плечи",    desc: "Грудь, плечи и трицепс — другие углы нагрузки." },
  "Push Heavy":            { title: "Грудь и плечи",    desc: "Тяжёлые жимы — строим силу верха." },
  "Push Volume":           { title: "Грудь и плечи",    desc: "Больше подходов для объёма и рельефа." },

  "Pull":                  { title: "Спина и бицепс",   desc: "Укрепляем осанку и качаем бицепс." },
  "Pull A":                { title: "Спина и бицепс",   desc: "Укрепляем осанку и качаем бицепс." },
  "Pull B":                { title: "Спина и бицепс",   desc: "Тяги и подтягивания — другие варианты." },
  "Pull Heavy":            { title: "Спина и бицепс",   desc: "Тяжёлые тяги — мощная спина." },
  "Pull Volume":           { title: "Спина и бицепс",   desc: "Больше подходов для ширины спины." },

  "Legs":                  { title: "Ноги",             desc: "Приседания и выпады для сильных ног." },
  "Legs A":                { title: "Ноги",             desc: "Приседания и выпады для сильных ног." },
  "Legs B":                { title: "Ноги",             desc: "Другие варианты упражнений на ноги." },
  "Legs Heavy":            { title: "Ноги",             desc: "Тяжёлые приседания — строим силу ног." },
  "Legs + Glutes A":       { title: "Ноги и попа",      desc: "Приседания и мост — крепкие ноги и ягодицы." },
  "Legs + Glutes B":       { title: "Ноги и попа",      desc: "Выпады и изоляция — форма ног и ягодиц." },

  // ── Upper / Lower ─────────────────────────────────────
  "Upper A":               { title: "Верх тела",        desc: "Весь торс: спина, грудь, плечи и руки." },
  "Upper B":               { title: "Верх тела",        desc: "Весь торс: другие углы нагрузки." },
  "Upper Body":            { title: "Верх тела",        desc: "Весь торс: спина, грудь, плечи и руки." },
  "Upper Focus":           { title: "Верх тела",        desc: "Весь торс: спина, грудь, плечи и руки." },
  "Upper Heavy":           { title: "Верх тела",        desc: "Тяжёлые жимы и тяги для силы верха." },
  "Upper Volume":          { title: "Верх тела",        desc: "Больше подходов — объём для верха." },
  "Upper Pump":            { title: "Верх тела",        desc: "Лёгкие веса с пампингом — добиваем мышцы." },
  "Upper Push Basics":     { title: "Жимы для верха",   desc: "Учимся жать: жим лёжа, отжимания, жим гантелей." },
  "Upper Pull Basics":     { title: "Тяги для верха",   desc: "Учимся тянуть: подтягивания, тяга блока." },
  "Upper Push":            { title: "Жимы для верха",   desc: "Грудь и плечи — всё что «толкает»." },
  "Upper Pull":            { title: "Тяги для верха",   desc: "Спина и бицепс — всё что «тянет»." },
  "Upper Compound":        { title: "Верх тела",        desc: "Только базовые движения на верх." },

  "Lower A":               { title: "Низ тела",         desc: "Бёдра, ягодицы и икры — полный комплект." },
  "Lower B":               { title: "Низ тела",         desc: "Бёдра, ягодицы и икры — другие упражнения." },
  "Lower Body":            { title: "Низ тела",         desc: "Бёдра, ягодицы и икры — полный комплект." },
  "Lower Focus":           { title: "Низ тела",         desc: "Бёдра, ягодицы и икры — полный комплект." },
  "Lower Heavy":           { title: "Низ тела",         desc: "Тяжёлые приседания и тяги — строим ноги." },
  "Lower Volume":          { title: "Низ тела",         desc: "Объёмная работа на бёдра и ягодицы." },
  "Lower Pump":            { title: "Низ тела",         desc: "Лёгкие веса, много повторений — добиваем ноги." },
  "Lower Compound":        { title: "Низ тела",         desc: "Только базовые движения на низ." },
  "Lower + Glutes A":      { title: "Низ тела + попа",  desc: "Приседания и мост — ноги и ягодицы." },
  "Lower + Glutes B":      { title: "Низ тела + попа",  desc: "Выпады и изоляция — форма ног и ягодиц." },
  "Lower Squat Focus":     { title: "Приседания",       desc: "Техника приседаний — основа сильных ног." },
  "Lower Deadlift Focus":  { title: "Становая тяга",    desc: "Тянем с пола — сила ног и спины." },
  "Lower Body Strength":   { title: "Силовая на низ",   desc: "Тяжёлые приседания и тяги для мощных ног." },
  "Upper Body Strength":   { title: "Силовая на верх",  desc: "Тяжёлый жим и тяги для мощного торса." },

  // ── Ягодицы и специализация ног ────────────────────────
  "Glute Focus":           { title: "Акцент на ягодицы", desc: "Прицельная работа для формы и объёма." },
  "Glute Activation":      { title: "Акцент на ягодицы", desc: "Учим ягодицы включаться в работу." },
  "Glute Pump":            { title: "Ягодицы",          desc: "Много повторений — кровь, форма, рельеф." },
  "Glute Isolation":       { title: "Изоляция ягодиц",  desc: "Точечная работа: мост, отведения, толчки." },
  "Glutes & Accessories":  { title: "Ягодицы и мелочи", desc: "Ягодицы + дополнительная работа на детали." },
  "Glutes & Quads":        { title: "Ягодицы и бёдра",  desc: "Формируем красивые ноги спереди и сзади." },
  "Glutes & Hamstrings":   { title: "Ягодицы и задняя", desc: "Подтягиваем заднюю поверхность бедра." },
  "Glutes + Hamstrings":   { title: "Ягодицы и задняя", desc: "Подтягиваем заднюю поверхность бедра." },
  "Hamstrings & Glutes":   { title: "Ягодицы и задняя", desc: "Подтягиваем заднюю поверхность бедра." },
  "Glutes & Legs":         { title: "Ноги и попа",      desc: "Полная тренировка ног с акцентом на ягодицы." },
  "Hamstrings Focus":      { title: "Задняя поверхность бедра", desc: "Подтягиваем заднюю часть ног." },
  "Hamstring Focus":       { title: "Задняя поверхность бедра", desc: "Подтягиваем заднюю часть ног." },
  "Hip Thrust Heavy":      { title: "Ягодичный мост",   desc: "Тяжёлый мост — максимальная нагрузка на попу." },
  "Quad Focus":            { title: "Передняя часть ног", desc: "Приседания и выпады для мощных бёдер." },
  "Legs Volume":           { title: "Ноги (объём)",     desc: "Много подходов — ноги растут в объёме." },
  "Quad Dominant":         { title: "Передняя часть ног", desc: "Приседания и выпады — ягодицы работают тоже." },
  "Full Legs Pump":        { title: "Ноги (добивка)",   desc: "Много повторений, лёгкие веса — форма и рельеф." },
  "Leg Volume Pump":       { title: "Ноги (добивка)",   desc: "Объёмный день — максимум крови в мышцах." },
  "Full Lower Body":       { title: "Ноги целиком",     desc: "Все мышцы ног: для баланса и восстановления." },
  "Lunge Variations":      { title: "Выпады",           desc: "Вперёд, назад, в сторону — баланс и форма." },
  "Legs Priority":         { title: "Ноги",             desc: "Сегодня ноги — главный приоритет." },

  // ── Bro-split (отдельные мышцы) ────────────────────────
  "Chest":                 { title: "Грудь",            desc: "Мощный жим и детальная проработка." },
  "Back":                  { title: "Спина",            desc: "Ширина спины и здоровая поясница." },
  "Shoulders":             { title: "Плечи",            desc: "Делаем плечи округлыми и сильными." },
  "Arms":                  { title: "Руки",             desc: "Бицепс и трицепс — ничего лишнего." },
  "Accessories":           { title: "Доработка деталей", desc: "Слабые места, пресс и мелкие мышцы." },

  // ── Сила / Объём / Мощность ────────────────────────────
  "Strength":              { title: "Силовая",          desc: "Тяжёлые веса — строим фундамент." },
  "Strength Basics":       { title: "Силовая",          desc: "Базовые движения для крепкого тела." },
  "Strength + Cardio":     { title: "Сила + кардио",    desc: "Силовые упражнения плюс лёгкое кардио." },
  "Strength Light":        { title: "Лёгкая силовая",   desc: "Поддерживаем мышцы без перегрузок." },
  "Strength Upper":        { title: "Силовая на верх",  desc: "Строим мышцы, которые сжигают калории." },
  "Strength Lower":        { title: "Силовая на низ",   desc: "Ноги и ягодицы — самые энергозатратные мышцы." },
  "Strength Full Body":    { title: "Силовая на всё тело", desc: "Поддерживаем мышцы при похудении." },
  "Strength & Mobility":   { title: "Сила + растяжка",  desc: "Силовые упражнения плюс подвижность суставов." },
  "Strength Circuits":     { title: "Круговая силовая", desc: "Силовые упражнения подряд — и мышцы, и пульс." },
  "Strength Endurance":    { title: "Силовая выносливость", desc: "Силовые упражнения с упором на выносливость." },
  "Hypertrophy":           { title: "Работа на объём",  desc: "Средние веса, много повторений — мышцы растут." },
  "Upper Hypertrophy":     { title: "Верх (объём)",     desc: "Много подходов на верх — мышцы растут." },
  "Lower Hypertrophy":     { title: "Низ (объём)",      desc: "Много подходов на ноги — мышцы растут." },
  "Power":                 { title: "Взрывная сила",    desc: "Быстрые мощные движения — скорость и реакция." },
  "Power/Speed":           { title: "Сила и скорость",  desc: "Взрывные движения для мощи и реакции." },
  "Upper Power":           { title: "Верх (сила)",      desc: "Мощные жимы и тяги на верхнюю часть тела." },
  "Lower Power":           { title: "Низ (сила)",       desc: "Мощные движения на ноги — присед и рывок." },
  "Volume":                { title: "Объёмная тренировка", desc: "Много подходов — плотная «забивка» мышц." },
  "Volume & Shape":        { title: "Объём и форма",    desc: "Много повторений для красивого рельефа." },
  "Squat Focus":           { title: "Приседания",       desc: "День вокруг приседаний — основа сильных ног." },
  "Bench Focus":           { title: "Жим лёжа",         desc: "День вокруг жима — мощная грудь и плечи." },
  "Deadlift Focus":        { title: "Становая тяга",    desc: "Тянем с пола — сила ног и спины." },
  "Squat Day":             { title: "День приседаний",   desc: "Все варианты приседаний для полного развития ног." },
  "Deadlift Day":          { title: "День становой",    desc: "Классика, румынская, сумо — задняя цепь." },
  "Essential Strength":    { title: "Базовая силовая",  desc: "Только самое нужное: присед, тяга, жим." },
  "Heavy Compound":        { title: "Тяжёлая база",     desc: "Базовые движения с большим весом — сила и масса." },
  "Heavy Strength":        { title: "Тяжёлая силовая",  desc: "Большие веса — строим силу и массу." },
  "High Volume Sculpt":    { title: "Объёмная для рельефа", desc: "Много повторений с умеренным весом — форма." },
  "Upper Maintenance":     { title: "Поддержка верха",  desc: "Лёгкая работа, чтобы не потерять баланс." },
  "Lower Body Focus":      { title: "Упор на ноги",     desc: "Ноги — главный приоритет сегодня." },

  // ── Кардио и жиросжигание ──────────────────────────────
  "HIIT Upper":            { title: "Интенсив (верх)",  desc: "Быстрая тренировка верха — пропотеешь." },
  "HIIT Lower":            { title: "Интенсив (низ)",   desc: "Быстрая тренировка ног — пропотеешь." },
  "HIIT Full Body":        { title: "Жиросжигание",     desc: "Высокий темп, чтобы сжечь максимум калорий." },
  "Metabolic Circuits":    { title: "Круговая тренировка", desc: "Упражнения подряд почти без пауз — жир горит." },
  "Metabolic Conditioning": { title: "Функциональная",  desc: "Разгоняем обмен веществ круговой тренировкой." },
  "Metabolic Strength":    { title: "Силовое жиросжигание", desc: "Силовые с минимальным отдыхом — и мышцы, и жир." },
  "Circuit Training":      { title: "Круговая тренировка", desc: "Много движений, высокий расход энергии." },
  "Cardio Intervals":      { title: "Интервальное кардио", desc: "Чередуем усилие и отдых — пульс работает." },
  "Cardio + Core":         { title: "Кардио + пресс",   desc: "Выносливость и плоский живот." },
  "Cardio Health":         { title: "Кардио",           desc: "Тренируем сердце и выносливость." },
  "Steady State Cardio":   { title: "Лёгкое кардио",    desc: "Ровная нагрузка — жиросжигание без стресса." },
  "Conditioning":          { title: "Функциональная",   desc: "Движения, которые пригодятся в реальной жизни." },
  "Upper Body Burn":       { title: "Интенсив (верх)",  desc: "Верх тела с высоким пульсом — сжигаем жир." },
  "Lower Body Burn":       { title: "Интенсив (низ)",   desc: "Ноги и ягодицы — самые энергозатратные мышцы." },
  "Daily Burn":            { title: "Жиросжигание",     desc: "Каждый день — шаг к цели." },

  // ── Восстановление и здоровье ──────────────────────────
  "Recovery":              { title: "Активный отдых",   desc: "Лёгкое движение, чтобы тело отдохнуло." },
  "Active Recovery":       { title: "Активный отдых",   desc: "Лёгкое движение, чтобы тело отдохнуло." },
  "Walk + Stretch":        { title: "Прогулка + растяжка", desc: "Лёгкое кардио и растяжка для восстановления." },
  "Walk & Breathe":        { title: "Прогулка",         desc: "Простое движение для здоровья." },
  "Stretch & Flow":        { title: "Растяжка",         desc: "Гибкость, чтобы ничего не болело." },
  "Yoga & Stretch":        { title: "Йога + растяжка",  desc: "Восстановление и подвижность суставов." },
  "Balance & Core":        { title: "Пресс и баланс",   desc: "Плоский живот и крепкая спина." },
  "Core & Balance":        { title: "Пресс и баланс",   desc: "Плоский живот и крепкая спина." },
  "Functional Training":   { title: "Функциональная",   desc: "Движения для повседневной жизни." },
  "Functional Fitness":    { title: "Функциональная",   desc: "Движения для повседневной жизни." },
  "Mind-Body Connection":  { title: "Йога и расслабление", desc: "Баланс тела и разума." },
  "Mobility & Flexibility": { title: "Растяжка и подвижность", desc: "Профилактика боли и травм." },
  "Morning Movement":      { title: "Утренняя зарядка", desc: "Лёгкие упражнения для бодрого утра." },
  "Nature Activity":       { title: "На свежем воздухе", desc: "Велосипед, плавание или прогулка — в удовольствие." },
  "Light Strength":        { title: "Лёгкая силовая",   desc: "Поддерживаем мышцы без перегрузок." },
  "Light Movement":        { title: "Лёгкое движение",  desc: "Минимальная нагрузка для восстановления." },
  "Light Day":             { title: "Лёгкий день",      desc: "Простые упражнения, чтобы тело отдохнуло." },
  "Mobility":              { title: "Подвижность",       desc: "Растяжка и разминка суставов." },
};

// Fallback titles per split type (if label not found in map)
const FALLBACK_DAY_TITLES: Record<string, string[]> = {
  full_body: ["Всё тело", "Всё тело", "Всё тело"],
  upper_lower: ["Верх тела", "Низ тела", "Верх тела", "Низ тела"],
  push_pull_legs: ["Грудь и плечи", "Спина и бицепс", "Ноги"],
  conditioning: ["Круговая тренировка", "Круговая тренировка", "Круговая тренировка"],
  bro_split: ["Грудь", "Спина", "Ноги", "Плечи", "Руки"],
};

// Fallback descriptions per split type
const FALLBACK_DAY_DESCS: Record<string, string[]> = {
  full_body: ["Проработка всех мышц за одну тренировку."],
  upper_lower: ["Весь торс: спина, грудь, плечи и руки.", "Бёдра, ягодицы и икры — полный комплект."],
  push_pull_legs: ["Грудь, плечи и трицепс — всё что «толкает».", "Укрепляем осанку и качаем бицепс.", "Приседания и выпады для сильных ног."],
  conditioning: ["Упражнения подряд почти без пауз — жир горит."],
  bro_split: ["Мощный жим и детальная проработка.", "Ширина спины и здоровая поясница.", "Приседания и выпады для сильных ног.", "Делаем плечи округлыми и сильными.", "Бицепс и трицепс — ничего лишнего."],
};

function resolveDayCopy(label: string, splitType: string, index: number): DayCopy {
  // 1. Try exact match
  const exact = DAY_LABEL_MAP[label.trim()];
  if (exact) return exact;

  // 2. Try without trailing A/B/C/D/etc.
  const stripped = label.trim().replace(/\s+[A-D]$/i, "").trim();
  const strippedMatch = DAY_LABEL_MAP[stripped];
  if (strippedMatch) return strippedMatch;

  // 3. Fallback per split type
  const titles = FALLBACK_DAY_TITLES[splitType];
  const descs = FALLBACK_DAY_DESCS[splitType];
  return {
    title: titles ? titles[index % titles.length] : `День ${index + 1}`,
    desc: descs ? descs[index % descs.length] : "",
  };
}

function buildDayTimeline(scheme: WorkoutScheme): DayTimelineItem[] {
  const labels = Array.isArray(scheme.dayLabels) ? scheme.dayLabels : [];
  const limit = scheme.daysPerWeek || labels.length;

  return Array.from({ length: limit }, (_, idx) => {
    const dayLabel = labels[idx];
    const rawLabel = dayLabel?.label || "";
    const copy = resolveDayCopy(rawLabel, scheme.splitType, idx);
    // Our copywriting takes priority; API focus only as last resort
    const description = (copy.desc || dayLabel?.focus || "").trim();
    return {
      day: (dayLabel?.day) || idx + 1,
      title: copy.title,
      description,
      icon: getDayEmoji(copy.title),
    };
  });
}

// ============================================================================
// LOCKED CARD CONTENT (for beginner)
// Each locked alternative gets a motivational unlock message
// ============================================================================

function getLockedCardContent(scheme: WorkoutScheme): { unlockWeeks: number; motivationText: string } {
  const split = scheme.splitType;
  if (split === "upper_lower") {
    return { unlockWeeks: 8, motivationText: "Когда освоишь базу — усложним" };
  }
  if (split === "push_pull_legs") {
    return { unlockWeeks: 12, motivationText: "Для детальной проработки" };
  }
  if (split === "bro_split") {
    return { unlockWeeks: 12, motivationText: "Для детальной проработки" };
  }
  // Default
  return {
    unlockWeeks: scheme.intensity === "high" ? 12 : 8,
    motivationText: "Когда будешь готов к новому уровню",
  };
}

// ============================================================================
// BUBBLE TEXT PER EXPERIENCE
// ============================================================================

function getBubbleText(experience: ExperienceLevel, schemesCount: number): string {
  if (experience === "beginner") {
    return "Готово! Вот план тренировок, который идеально подходит под твой профиль";
  }
  if (experience === "intermediate" || experience === "advanced") {
    return "Готово! Выбери план тренировок: всё тело за раз или делим по мышцам?";
  }
  return schemesCount > 1
    ? "Готово! Выбери план тренировок: всё тело за раз или делим по мышцам?"
    : "Готово! Вот план тренировок, который идеально подходит под твой профиль";
}

export default function OnbSchemeSelection({ onComplete, onBack }: Props) {
  const { draft } = useOnboarding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<WorkoutScheme[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [bubbleText, setBubbleText] = useState("Цель без плана - просто мечта! выберите план тренировок");
  const [mascotReady, setMascotReady] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  const experience = (draft.experience?.level || draft.experience || "beginner") as ExperienceLevel;
  const isBeginner = experience === "beginner";

  const userContext: UserContext = useMemo(() => ({
    goal: (draft.motivation?.goal || "athletic_body") as UserGoal,
    experience,
    location: (draft.trainingPlace?.place || "gym") as Location,
    sex: draft.ageSex?.sex as "male" | "female" | undefined,
    age: draft.ageSex?.age,
    bmi: draft.body?.weight && draft.body?.height
      ? draft.body.weight / ((draft.body.height / 100) ** 2)
      : undefined,
  }), [draft]);

  const bubbleTarget = "Цель без плана - просто мечта! выберите план тренировок";
  const isReady = !loading && schemes.length > 0;

  // Preload mascot
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = maleRobotImg;
    const done = () => { if (!cancelled) setMascotReady(true); };
    const anyImg = img as any;
    if (typeof anyImg.decode === "function") {
      anyImg.decode().then(done).catch(() => { img.onload = done; img.onerror = done; });
    } else {
      img.onload = done;
      img.onerror = done;
    }
    return () => { cancelled = true; };
  }, []);

  // Keep the same screen while loading: only update bubble text
  useEffect(() => {
    if (!loading) return;
    setBubbleText("Цель без плана - просто мечта! выберите план тренировок");
    setShowContent(false);
  }, [loading]);

  // Scroll to top
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Cleanup leave timer
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // Load recommendations
  useEffect(() => {
    loadRecommendations();
  }, []);

  // Reveal content when ready (no artificial delays)
  useEffect(() => {
    if (loading || schemes.length === 0) return;
    setShowContent(true);
    setBubbleText(bubbleTarget);
  }, [loading, schemes, bubbleTarget]);

  async function loadRecommendations() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSchemeRecommendations();
      const allSchemes = [data.recommended, ...data.alternatives];
      setSchemes(allSchemes);
      setSelectedId(data.recommended.id);
      setRecommendedId(data.recommended.id);
      setLoading(false);
    } catch (err: any) {
      console.error("Failed to load recommendations:", err);
      setError(err.message || "Не удалось загрузить рекомендации");
      setLoading(false);
    }
  }

  const handleNext = () => {
    if (isLeaving || !selectedId) return;
    fireHapticImpact("rigid");
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const doSelect = async () => {
      try {
        setSaving(true);
        setError(null);
        await selectScheme(selectedId);
        localStorage.setItem("scheme_selected", "1");
        try { window.dispatchEvent(new Event("scheme_selected")); } catch {}
        onComplete();
      } catch (err: any) {
        console.error("Failed to select scheme:", err);
        setError(err.message || "Не удалось сохранить выбор");
        setSaving(false);
        setIsLeaving(false);
      }
    };

    if (prefersReduced) {
      doSelect();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(doSelect, 220);
  };

  const handleBack = () => {
    if (isLeaving || !onBack) return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) { onBack(); return; }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onBack(), 220);
  };

  // Error state
  if (error && schemes.length === 0) {
    return (
      <div style={s.page}>
        <ScreenStyles />
        <div style={{ ...s.mascotRow, opacity: 1 }}>
          <img src={maleRobotImg} alt="" style={s.mascotImg} />
          <div style={s.bubble} className="speech-bubble">
            <span style={s.bubbleText}>Упс, что-то пошло не так...</span>
          </div>
        </div>
        <div style={s.errorCard}>
          <p>{error}</p>
          <button style={s.retryBtn} onClick={loadRecommendations}>Попробовать снова</button>
        </div>
      </div>
    );
  }

  const recommendedScheme = isReady ? schemes.find(s => s.id === recommendedId) || null : null;
  const alternatives = isReady ? schemes.filter(s => s.id !== recommendedId) : [];
  const activeId = selectedId || recommendedId;
  const bubbleDisplayText = bubbleText || "\u00A0";

  return (
    <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
      <ScreenStyles />

      {/* Mascot + Bubble */}
      <div
        style={s.mascotRow}
        className="onb-fade onb-fade-delay-2"
      >
        <img
          src={maleRobotImg}
          alt=""
          style={{ ...s.mascotImg, ...(mascotReady ? undefined : s.mascotHidden) }}
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>{bubbleDisplayText}</span>
        </div>
      </div>

      {/* Cards */}
      <div style={s.cardsContainer}>
        {/* Recommended Scheme Card */}
        {recommendedScheme && (
          <div className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}>
            <RecommendedCard
              scheme={recommendedScheme}
              userContext={userContext}
              isActive={activeId === recommendedScheme.id}
              onSelect={!isBeginner ? () => setSelectedId(recommendedScheme.id) : undefined}
            />
          </div>
        )}

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div
            style={s.altSection}
            className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
          >
            {isBeginner ? (
              alternatives.map(scheme => (
                <LockedCard key={scheme.id} scheme={scheme} userContext={userContext} />
              ))
            ) : (
              alternatives.map(scheme => (
                <SelectableCard
                  key={scheme.id}
                  scheme={scheme}
                  userContext={userContext}
                  isActive={scheme.id === activeId}
                  onSelect={() => setSelectedId(scheme.id)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Error inline */}
      {error && <div style={s.errorText}>{error}</div>}

      {/* Actions */}
      {recommendedScheme && (
        <div
          style={s.actions}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
        >
          <button
            type="button"
            style={s.primaryBtn}
            className="intro-primary-btn"
            onClick={handleNext}
            disabled={!selectedId || saving || isLeaving}
          >
            {saving ? "Сохраняем..." : isBeginner ? "Начать тренировки" : "Далее"}
          </button>
          {onBack && (
            <button type="button" style={s.backBtn} onClick={handleBack}>
              Назад
            </button>
          )}
        </div>
      )}

    </div>
  );
}

// ============================================================================
// DIFFICULTY BARS (like intensity in OnbAnalysis)
// ============================================================================

function DifficultyBars({ splitType }: { splitType: string }) {
  const level = SPLIT_DIFFICULTY[splitType] ?? 1;
  return (
    <div style={s.difficultyRow}>
      <span style={s.difficultyLabel}>Сложность</span>
      <div style={s.difficultyBars}>
        <div style={{ ...s.diffBar, ...s.diffBar1, background: level >= 1 ? "#1e1f22" : "#e5e7eb" }} />
        <div style={{ ...s.diffBar, ...s.diffBar2, background: level >= 2 ? "#1e1f22" : "#e5e7eb" }} />
        <div style={{ ...s.diffBar, ...s.diffBar3, background: level >= 3 ? "#1e1f22" : "#e5e7eb" }} />
      </div>
    </div>
  );
}

// ============================================================================
// SHARED CARD BODY — title + difficulty + description + timeline
// ============================================================================

function SchemeCardBody({
  scheme,
  userContext,
  showTimeline,
  headerLabel,
  headerEmoji,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  showTimeline: boolean;
  headerLabel?: string;
  headerEmoji?: string;
}) {
  const displayData = getSchemeDisplayData(
    {
      id: scheme.id,
      name: scheme.name,
      splitType: scheme.splitType as SplitType,
      intensity: scheme.intensity,
      daysPerWeek: scheme.daysPerWeek,
      locations: scheme.equipmentRequired as Location[],
    },
    userContext,
  );
  const splitDesc = SPLIT_EXPLANATIONS[scheme.splitType] || displayData.description;
  const dayTimeline = buildDayTimeline(scheme);

  return (
    <>
      {headerLabel && (
        <div style={s.planHeader}>
          {headerEmoji && <span style={s.planHeaderIcon}>{headerEmoji}</span>}
          <span style={s.planHeaderLabel}>{headerLabel}</span>
        </div>
      )}
      <div style={s.cardTitle}>
        {displayData.title}
      </div>

      <DifficultyBars splitType={scheme.splitType} />

      <p style={s.cardDescription}>{splitDesc}</p>

      {showTimeline && dayTimeline.length > 0 && (
        <div style={s.dayTimeline}>
          <div style={s.timelineList}>
            {dayTimeline.map((item, idx) => (
              <div key={`${item.day}-${idx}`} style={s.timelineItem}>
                <div style={s.timelineLeft}>
                  <div style={s.timelineIcon}>{item.icon}</div>
                  {idx < dayTimeline.length - 1 && <div style={s.timelineLine} />}
                </div>
                <div style={s.timelineRight}>
                  <div style={s.timelineWeek}>День {item.day}</div>
                  <div style={s.timelineTitle}>{item.title}</div>
                  {item.description && <p style={s.timelineDesc}>{item.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// RECOMMENDED CARD — glass card
// ============================================================================

function RecommendedCard({
  scheme,
  userContext,
  isActive,
  onSelect,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  isActive: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      className="scheme-card"
      style={{
        ...s.recommendedCard,
        ...(isActive ? undefined : s.cardInactive),
        ...(onSelect ? s.cardClickable : {}),
      }}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <SchemeCardBody
        scheme={scheme}
        userContext={userContext}
        showTimeline={isActive}
        headerLabel="Рекомендую этот план"
        headerEmoji="⭐"
      />
    </div>
  );
}

// ============================================================================
// SELECTABLE CARD (for intermediate / advanced)
// Same content as recommended, collapsed when inactive
// ============================================================================

function SelectableCard({
  scheme,
  userContext,
  isActive,
  onSelect,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="scheme-card"
      style={{ ...s.recommendedCard, ...(isActive ? undefined : s.cardInactive) }}
      onClick={onSelect}
    >
      <SchemeCardBody
        scheme={scheme}
        userContext={userContext}
        showTimeline={isActive}
        headerLabel="Альтернативный план"
        headerEmoji="💡"
      />
    </button>
  );
}

// ============================================================================
// LOCKED CARD (for beginner — blurred with lock overlay)
// ============================================================================

function LockedCard({
  scheme,
  userContext,
}: {
  scheme: WorkoutScheme;
  userContext: UserContext;
}) {
  const splitExplanation = SPLIT_EXPLANATIONS[scheme.splitType] || "";
  const { unlockWeeks, motivationText } = getLockedCardContent(scheme);

  return (
    <div style={s.lockedCardWrap}>
      {/* Blurred background content */}
      <div style={s.lockedBlurLayer} />

      {/* Lock content on top */}
      <div style={s.lockedContent}>
        <div style={s.planHeader}>
          <span style={s.planHeaderIcon}>💡</span>
          <span style={s.planHeaderLabel}>Альтернативный план</span>
        </div>
        <div style={s.lockedLockRow}>
          <span style={s.lockedLockEmoji}>🔒</span>
          <span style={s.lockedUnlockText}>Откроется через {unlockWeeks} недель</span>
        </div>
        {splitExplanation && (
          <div style={s.lockedSplitText}>«{splitExplanation}»</div>
        )}
        <div style={s.lockedMotivation}>{motivationText}</div>
      </div>
    </div>
  );
}

// ============================================================================
// SPINNER
// ============================================================================

// ============================================================================
// SCREEN STYLES (animations, bubble, button)
// ============================================================================

function ScreenStyles() {
  return (
    <style>{`
      @keyframes onbFadeUp {
        0% { opacity: 0; transform: translateY(14px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes onbFadeDown {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(12px); }
      }
      .onb-fade-target { opacity: 0; }
      .onb-fade { animation: onbFadeUp 520ms ease-out both; }
      .onb-fade-delay-1 { animation-delay: 80ms; }
      .onb-fade-delay-2 { animation-delay: 160ms; }
      .onb-fade-delay-3 { animation-delay: 240ms; }
      .onb-leave { animation: onbFadeDown 220ms ease-in both; }
      .speech-bubble:before {
        content: ""; position: absolute;
        left: -8px; top: 18px; width: 0; height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid rgba(255,255,255,0.9);
        filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
      }
      .intro-primary-btn {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation; user-select: none;
        transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }
      .intro-primary-btn:active:not(:disabled) {
        transform: translateY(1px) scale(0.99) !important;
        background-color: #141619 !important;
      }
      .scheme-roll {
        overflow: hidden;
        max-height: 1200px;
        transform: translateY(0);
        transition: max-height 520ms cubic-bezier(0.22, 1, 0.36, 1),
          transform 520ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 420ms ease;
        will-change: max-height, transform;
        opacity: 1;
      }
      .scheme-roll.collapsed {
        max-height: 0;
        transform: translateY(-6px);
        opacity: 0;
      }
      .scheme-card {
        appearance: none; outline: none; cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
        transition: background 320ms ease, border-color 320ms ease, color 320ms ease, transform 220ms ease;
        will-change: transform, background, border-color;
      }
      .scheme-card:active:not(:disabled) {
        transform: translateY(1px) scale(0.99);
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .intro-primary-btn, .scheme-card, .scheme-roll { transition: none !important; }
      }
    `}</style>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 160px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
  },

  // Mascot Row — same as OnbAnalysis
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: 140,
    height: "auto",
    objectFit: "contain",
  },
  mascotHidden: {
    opacity: 0,
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#1e1f22",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#1e1f22",
    whiteSpace: "pre-line",
  },

  // Cards
  cardsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 4,
  },

  // Card base (active state — full glass 3D)
  recommendedCard: {
    borderRadius: 20,
    padding: "20px 18px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    position: "relative",
    width: "100%",
    textAlign: "left",
    display: "block",
    overflow: "visible",
  },
  // Inactive card — more transparent, keep 3D depth
  cardInactive: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.28) 100%)",
    border: "1px solid rgba(255,255,255,0.3)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)",
  },
  cardClickable: {
    cursor: "pointer",
  },

  // Plan header (like Strategy header in analysis)
  planHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  planHeaderIcon: {
    fontSize: 18,
  },
  planHeaderLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },


  // Title with emoji
  cardTitle: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: -0.5,
    color: "#1e1f22",
    marginTop: 2,
  },

  // Difficulty bars (like intensity in OnbAnalysis)
  difficultyRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  difficultyLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1,
    paddingBottom: 0,
    transform: "translateY(2px)",
  },
  difficultyBars: {
    display: "flex",
    alignItems: "flex-end",
    gap: 3,
  },
  diffBar: {
    width: 6,
    borderRadius: 2,
  },
  diffBar1: {
    height: 8,
  },
  diffBar2: {
    height: 14,
  },
  diffBar3: {
    height: 20,
  },

  // Description (Duolingo-style)
  cardDescription: {
    margin: "8px 0 0",
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(30,31,34,0.55)",
    fontWeight: 500,
  },

  // Day timeline
  dayTimeline: {
    marginTop: 16,
  },
  timelineList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  timelineItem: {
    display: "flex",
    gap: 12,
  },
  timelineLeft: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: 32,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(30,31,34,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 14,
    background: "rgba(30,31,34,0.08)",
    margin: "4px 0",
    borderRadius: 1,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineWeek: {
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(30,31,34,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1e1f22",
    marginTop: 2,
  },
  timelineDesc: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "rgba(30,31,34,0.5)",
    lineHeight: 1.4,
  },

  // Alternatives section
  altSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  // Locked card (beginner)
  lockedCardWrap: {
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    width: "100%",
  },
  lockedBlurLayer: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.15) 100%)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 18,
  },
  lockedContent: {
    position: "relative",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  lockedLockRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  lockedLockEmoji: {
    fontSize: 16,
  },
  lockedUnlockText: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(30,31,34,0.45)",
  },
  lockedSplitText: {
    fontSize: 16,
    fontWeight: 600,
    color: "rgba(30,31,34,0.55)",
    lineHeight: 1.3,
  },
  lockedMotivation: {
    fontSize: 13,
    fontWeight: 500,
    color: "rgba(30,31,34,0.35)",
    lineHeight: 1.4,
  },

  // Actions — same as OnbAnalysis
  actions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 10,
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
    zIndex: 10,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  backBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 16,
    fontWeight: 600,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
  },

  // Error
  errorCard: {
    padding: 24,
    textAlign: "center",
    color: "rgba(15, 23, 42, 0.7)",
  },
  retryBtn: {
    marginTop: 16,
    padding: "12px 24px",
    borderRadius: 12,
    border: "none",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  errorText: {
    padding: 12,
    background: "rgba(255,102,102,0.15)",
    color: "#dc2626",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 10,
    textAlign: "center",
  },
};
