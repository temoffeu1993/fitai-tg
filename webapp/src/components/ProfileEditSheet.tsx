import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";
import { fireHapticImpact } from "@/utils/haptics";

// ─── Animation constants (same as Schedule.tsx) ─────────────────────────────
const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const OPEN_TICK_MS = 12;
const CONTENT_ANIM_MS = 280;
const SPRING_CONTENT = "cubic-bezier(0.36, 0.66, 0.04, 1)";

// ─── Field definitions ──────────────────────────────────────────────────────

type Option = { value: any; label: string };

type FieldDef = {
  key: string;
  label: string;
  type: "select" | "number" | "multi-select";
  options?: Option[];
  min?: number;
  max?: number;
  suffix?: string;
  /** For multi-select: if this value is selected, deselect all others */
  exclusiveValue?: any;
};

const HERO_FIELDS: FieldDef[] = [
  { key: "age", label: "Возраст", type: "number", min: 14, max: 99 },
  {
    key: "sex", label: "Пол", type: "select",
    options: [{ value: "male", label: "Мужской" }, { value: "female", label: "Женский" }],
  },
  { key: "height", label: "Рост", type: "number", min: 100, max: 250, suffix: "см" },
  { key: "weight", label: "Вес", type: "number", min: 30, max: 300, suffix: "кг" },
];

const PLAN_FIELDS: FieldDef[] = [
  {
    key: "goal", label: "Цель", type: "select",
    options: [
      { value: "lose_weight", label: "Сбросить лишнее" },
      { value: "build_muscle", label: "Набрать мышцы" },
      { value: "athletic_body", label: "Быть в форме" },
      { value: "health_wellness", label: "Здоровье" },
    ],
  },
  {
    key: "experience", label: "Опыт", type: "select",
    options: [
      { value: "beginner", label: "Новичок" },
      { value: "intermediate", label: "Любитель" },
      { value: "advanced", label: "Опытный" },
    ],
  },
  {
    key: "perWeek", label: "Частота", type: "select",
    options: [
      { value: 2, label: "2 раза" },
      { value: 3, label: "3 раза" },
      { value: 4, label: "4 раза" },
      { value: 5, label: "5 раз" },
      { value: 6, label: "6 раз" },
    ],
  },
  {
    key: "minutes", label: "Длительность", type: "select",
    options: [
      { value: 45, label: "45 минут" },
      { value: 60, label: "60 минут" },
      { value: 90, label: "90 минут" },
    ],
  },
  {
    key: "place", label: "Место", type: "select",
    options: [
      { value: "gym", label: "Тренажерный зал" },
      { value: "home_no_equipment", label: "Дом, без инвентаря" },
      { value: "home_with_gear", label: "Дом, с резинками и гантелями" },
    ],
  },
];

const LIFESTYLE_FIELDS: FieldDef[] = [
  {
    key: "dietStyles", label: "Стиль питания", type: "multi-select",
    options: [
      { value: "Всеядный", label: "Всеядный" },
      { value: "Вегетарианец", label: "Вегетарианец" },
      { value: "Веган", label: "Веган" },
      { value: "Халяль", label: "Халяль" },
      { value: "Кошер", label: "Кошер" },
    ],
  },
  {
    key: "restrictions", label: "Ограничения", type: "multi-select",
    exclusiveValue: "Нет",
    options: [
      { value: "Лактоза", label: "Лактоза" },
      { value: "Орехи", label: "Орехи" },
      { value: "Глютен", label: "Глютен" },
      { value: "Свинина", label: "Свинина" },
      { value: "Нет", label: "Нет" },
    ],
  },
  {
    key: "activity", label: "Активность", type: "select",
    options: [
      { value: "sedentary", label: "Мало подвижности" },
      { value: "balanced", label: "Иногда двигаюсь" },
      { value: "on_feet", label: "Весь день на ногах" },
      { value: "heavy_work", label: "Постоянно в движении" },
    ],
  },
];

const SECTION_TITLES: Record<string, string> = {
  hero: "Мои данные",
  plan: "Мой план",
  lifestyle: "Образ жизни",
};

// ─── Helpers to read/write summary fields ───────────────────────────────────

function getFieldValue(summary: any, section: string, fieldKey: string): any {
  const s = summary || {};
  if (section === "hero") {
    if (fieldKey === "age") return s.ageSex?.age ?? s.age ?? "";
    if (fieldKey === "sex") return s.ageSex?.sex ?? s.sex ?? "";
    if (fieldKey === "height") return s.body?.height ?? s.height ?? "";
    if (fieldKey === "weight") return s.body?.weight ?? s.weight ?? "";
  }
  if (section === "plan") {
    if (fieldKey === "goal") return s.motivation?.goal ?? s.goals?.primary ?? "";
    if (fieldKey === "experience") {
      const e = s.experience;
      return typeof e === "string" ? e : e?.level ?? "";
    }
    if (fieldKey === "perWeek") return s.schedule?.perWeek ?? s.schedule?.daysPerWeek ?? s.daysPerWeek ?? s.perWeek ?? "";
    if (fieldKey === "minutes") return s.schedule?.minutesPerSession ?? s.schedule?.minutes ?? s.schedule?.sessionMinutes ?? s.minutes ?? s.minutesPerSession ?? "";
    if (fieldKey === "place") return s.trainingPlace?.place ?? s.environment?.location ?? "";
  }
  if (section === "lifestyle") {
    if (fieldKey === "dietStyles") return s.dietPrefs?.styles || [];
    if (fieldKey === "restrictions") return s.dietPrefs?.restrictions || [];
    if (fieldKey === "activity") return s.lifestyle?.workStyle ?? "";
  }
  return "";
}

function getDisplayValue(summary: any, section: string, field: FieldDef): string {
  const val = getFieldValue(summary, section, field.key);
  if (field.type === "multi-select") {
    const arr = Array.isArray(val) ? val : [];
    return arr.length > 0 ? arr.join(", ") : "—";
  }
  if (field.type === "number") {
    if (val === "" || val === null || val === undefined) return "—";
    return field.suffix ? `${val} ${field.suffix}` : String(val);
  }
  // select
  if (!val && val !== 0) return "—";
  const opt = field.options?.find((o) => String(o.value) === String(val));
  return opt?.label ?? String(val);
}

function setFieldValue(summary: any, section: string, fieldKey: string, value: any): any {
  const s = JSON.parse(JSON.stringify(summary || {}));
  if (section === "hero") {
    if (fieldKey === "age") {
      if (!s.ageSex) s.ageSex = {};
      s.ageSex.age = value;
    }
    if (fieldKey === "sex") {
      if (!s.ageSex) s.ageSex = {};
      s.ageSex.sex = value;
    }
    if (fieldKey === "height") {
      if (!s.body) s.body = {};
      s.body.height = value;
    }
    if (fieldKey === "weight") {
      if (!s.body) s.body = {};
      s.body.weight = value;
    }
  }
  if (section === "plan") {
    if (fieldKey === "goal") {
      if (!s.motivation) s.motivation = {};
      s.motivation.goal = value;
    }
    if (fieldKey === "experience") {
      // Preserve format: if original was object with level, keep it
      if (typeof s.experience === "object" && s.experience !== null) {
        s.experience = { ...s.experience, level: value };
      } else {
        s.experience = value;
      }
    }
    if (fieldKey === "perWeek") {
      if (!s.schedule) s.schedule = {};
      s.schedule.perWeek = value;
    }
    if (fieldKey === "minutes") {
      if (!s.schedule) s.schedule = {};
      s.schedule.minutesPerSession = value;
    }
    if (fieldKey === "place") {
      if (!s.trainingPlace) s.trainingPlace = {};
      s.trainingPlace.place = value;
    }
  }
  if (section === "lifestyle") {
    if (fieldKey === "dietStyles") {
      if (!s.dietPrefs) s.dietPrefs = {};
      s.dietPrefs.styles = value;
    }
    if (fieldKey === "restrictions") {
      if (!s.dietPrefs) s.dietPrefs = {};
      s.dietPrefs.restrictions = value;
    }
    if (fieldKey === "activity") {
      if (!s.lifestyle) s.lifestyle = {};
      s.lifestyle.workStyle = value;
    }
  }
  return s;
}

// ─── Scroller constants ─────────────────────────────────────────────────────

const AGE_MIN = 14, AGE_MAX = 99, AGE_ITEM_H = 56;
const WT_MIN = 30, WT_MAX = 300, WT_ITEM_W = 12, WT_TICKS = 5;
const HT_MIN = 100, HT_MAX = 250, HT_ITEM_H = 12, HT_TICKS = 5;
const HT_EDGE = HT_ITEM_H * HT_TICKS * 2 - HT_ITEM_H / 2;

// ─── Age Scroller ───────────────────────────────────────────────────────────

function AgeScroller({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<number>(0);
  const lastTick = useRef<number | null>(null);
  const suppressSync = useRef(false);
  const suppressHaptics = useRef(true);

  const ages = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => AGE_MIN + i);

  useEffect(() => {
    const t = window.setTimeout(() => { suppressHaptics.current = false; }, 200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list || suppressSync.current) { suppressSync.current = false; return; }
    const index = value - AGE_MIN;
    list.scrollTop = index * AGE_ITEM_H;
    lastTick.current = index;
  }, [value]);

  const maybeHaptic = () => { if (!suppressHaptics.current) fireHapticImpact("light"); };

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const liveIndex = Math.round(list.scrollTop / AGE_ITEM_H);
    if (lastTick.current !== liveIndex) { lastTick.current = liveIndex; maybeHaptic(); }
    clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => {
      const index = Math.round(list.scrollTop / AGE_ITEM_H);
      const nextAge = AGE_MIN + index;
      if (nextAge >= AGE_MIN && nextAge <= AGE_MAX) {
        suppressSync.current = true;
        onChange(nextAge);
      }
    }, 60);
  };

  return (
    <div style={scr.ageWrap}>
      <div style={scr.ageIndicator} />
      <div style={scr.ageFadeTop} />
      <div style={scr.ageFadeBottom} />
      <div ref={listRef} style={scr.ageList} className="profile-scroller-list" onScroll={handleScroll}>
        <div style={{ height: AGE_ITEM_H * 2 }} />
        {ages.map((v) => (
          <button
            key={v} type="button"
            style={{ ...scr.ageItem, ...(value === v ? scr.ageItemActive : {}) }}
            onClick={() => { suppressSync.current = true; onChange(v); maybeHaptic(); }}
          >
            {v}
          </button>
        ))}
        <div style={{ height: AGE_ITEM_H * 2 }} />
      </div>
    </div>
  );
}

// ─── Weight Scroller ────────────────────────────────────────────────────────

function ProfileWeightScroller({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<number>(0);
  const suppressSync = useRef(false);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || suppressSync.current) { suppressSync.current = false; return; }
    const idx = (value - WT_MIN) * WT_TICKS;
    list.scrollLeft = idx * WT_ITEM_W;
    lastTick.current = Math.round(idx / WT_TICKS) * WT_TICKS;
  }, [value]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const raw = Math.round(list.scrollLeft / WT_ITEM_W);
    const major = Math.round(raw / WT_TICKS) * WT_TICKS;
    if (lastTick.current !== major) { lastTick.current = major; fireHapticImpact("light"); }
    clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => {
      const r = Math.round(list.scrollLeft / WT_ITEM_W);
      const m = Math.round(r / WT_TICKS) * WT_TICKS;
      const w = WT_MIN + m / WT_TICKS;
      if (w >= WT_MIN && w <= WT_MAX) { suppressSync.current = true; onChange(w); }
    }, 80);
  };

  const ticks = Array.from({ length: (WT_MAX - WT_MIN) * WT_TICKS + 1 }, (_, i) => ({
    index: i, value: WT_MIN + i / WT_TICKS, isMajor: i % WT_TICKS === 0,
  }));

  const trackW = WT_ITEM_W * WT_TICKS * 5;

  return (
    <div style={{ ...scr.trackWrap, width: trackW }}>
      <div style={scr.trackIndicator} />
      <div style={{ ...scr.trackFade, left: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)" }} />
      <div style={{ ...scr.trackFade, right: 0, background: "linear-gradient(270deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)" }} />
      <div
        ref={listRef}
        className="profile-scroller-list"
        onScroll={handleScroll}
        style={{
          overflowX: "auto", overflowY: "hidden", whiteSpace: "nowrap" as const,
          scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch",
          padding: "16px 0 20px",
          paddingLeft: `calc(50% - ${WT_ITEM_W / 2}px)`,
          paddingRight: `calc(50% - ${WT_ITEM_W / 2}px)`,
          scrollbarWidth: "none" as const,
        }}
      >
        {ticks.map((t) => (
          <button
            key={t.index} type="button"
            style={{
              width: WT_ITEM_W, background: "transparent", display: "inline-flex",
              flexDirection: "column" as const, alignItems: "center", justifyContent: "flex-end",
              gap: 14, border: "none", cursor: "pointer", padding: 0,
              scrollSnapAlign: t.isMajor ? "center" : "none",
            }}
            onClick={() => {
              const m = Math.round(t.index / WT_TICKS) * WT_TICKS;
              const w = WT_MIN + m / WT_TICKS;
              if (w >= WT_MIN && w <= WT_MAX) { suppressSync.current = true; onChange(w); listRef.current?.scrollTo({ left: m * WT_ITEM_W, behavior: "smooth" }); }
            }}
          >
            <div style={{
              fontSize: t.isMajor ? (value === t.value ? 22 : 18) : 0, height: 22,
              color: value === t.value ? "#111" : "rgba(15,23,42,0.45)",
              fontWeight: value === t.value ? 700 : 500,
            }}>
              {t.isMajor ? t.value : ""}
            </div>
            <div style={{ width: "100%", height: 18, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <span style={{
                width: 2, borderRadius: 999,
                height: t.isMajor ? 22 : 12,
                background: value === t.value ? "rgba(15,23,42,0.75)" : "rgba(15,23,42,0.35)",
              }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Height (cm) Scroller ───────────────────────────────────────────────────

function HeightScroller({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<number>(0);
  const suppressSync = useRef(false);
  const lastTop = useRef(0);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || suppressSync.current) { suppressSync.current = false; return; }
    const idx = (value - HT_MIN) * HT_TICKS;
    list.scrollTop = idx * HT_ITEM_H;
    lastTick.current = Math.round(idx / HT_TICKS) * HT_TICKS;
  }, [value]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    lastTop.current = list.scrollTop;
    const raw = Math.round(list.scrollTop / HT_ITEM_H);
    const major = Math.round(raw / HT_TICKS) * HT_TICKS;
    if (lastTick.current !== major) { lastTick.current = major; fireHapticImpact("light"); }
    clearTimeout(stopTimer.current);
    const checkStop = () => {
      const cur = list.scrollTop;
      if (Math.abs(cur - lastTop.current) > 0.5) { lastTop.current = cur; stopTimer.current = window.setTimeout(checkStop, 80); return; }
      const r = Math.round(cur / HT_ITEM_H);
      const m = Math.round(r / HT_TICKS) * HT_TICKS;
      const v = HT_MIN + m / HT_TICKS;
      if (v >= HT_MIN && v <= HT_MAX) { suppressSync.current = true; onChange(v); }
    };
    stopTimer.current = window.setTimeout(checkStop, 80);
  };

  const ticks = Array.from({ length: (HT_MAX - HT_MIN) * HT_TICKS + 1 }, (_, i) => ({
    index: i, value: HT_MIN + i / HT_TICKS, isMajor: i % HT_TICKS === 0,
  }));

  return (
    <div style={scr.heightWrap}>
      <div style={scr.heightIndicator} />
      <div style={scr.heightFadeTop} />
      <div style={scr.heightFadeBottom} />
      <div ref={listRef} className="profile-scroller-list" onScroll={handleScroll} style={scr.heightList}>
        <div style={{ height: HT_EDGE }} />
        {ticks.map((t) => (
          <button
            key={t.index} type="button"
            style={{
              border: "none", background: "transparent", height: HT_ITEM_H,
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", gap: 6,
              scrollSnapAlign: t.isMajor ? "center" : "none",
            }}
            onClick={() => {
              const m = Math.round(t.index / HT_TICKS) * HT_TICKS;
              const v = HT_MIN + m / HT_TICKS;
              if (v >= HT_MIN && v <= HT_MAX) { suppressSync.current = true; onChange(v); listRef.current?.scrollTo({ top: m * HT_ITEM_H, behavior: "smooth" }); }
            }}
          >
            <div style={{
              minWidth: 36, textAlign: "right" as const,
              fontSize: value === t.value ? 22 : (t.isMajor ? 18 : 0),
              color: value === t.value ? "#111" : (t.isMajor ? "rgba(15,23,42,0.45)" : "transparent"),
              fontWeight: value === t.value ? 700 : 500,
            }}>
              {t.isMajor ? t.value : ""}
            </div>
            <div style={{ width: 36, height: 12, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              <span style={{
                height: 2, borderRadius: 999,
                width: t.isMajor ? 22 : 12,
                background: value === t.value ? "rgba(15,23,42,0.75)" : "rgba(15,23,42,0.35)",
              }} />
            </div>
          </button>
        ))}
        <div style={{ height: HT_EDGE }} />
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export type ProfileEditSheetProps = {
  section: "hero" | "plan" | "lifestyle" | null;
  summary: any;
  onSave: (updatedSummary: any) => void;
  onClose: () => void;
};

export default function ProfileEditSheet({ section, summary, onSave, onClose }: ProfileEditSheetProps) {
  if (!section) return null;
  return <SheetInner section={section} summary={summary} onSave={onSave} onClose={onClose} />;
}

function SheetInner({
  section,
  summary,
  onSave,
  onClose,
}: {
  section: "hero" | "plan" | "lifestyle";
  summary: any;
  onSave: (updatedSummary: any) => void;
  onClose: () => void;
}) {
  const fields = section === "hero" ? HERO_FIELDS : section === "plan" ? PLAN_FIELDS : LIFESTYLE_FIELDS;

  // ── Animation state (same pattern as Schedule.tsx) ──
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const animDoneTimerRef = useRef<number | null>(null);
  const pageTimerRef = useRef<number | null>(null);

  // ── Page navigation state ──
  const [activeField, setActiveField] = useState<FieldDef | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [slideDir, setSlideDir] = useState<"forward" | "backward">("forward");
  const [prevPage, setPrevPage] = useState<string | null>(null);
  const [pageAnimating, setPageAnimating] = useState(false);

  const applyEntered = (v: boolean) => {
    enteredRef.current = v;
    setEntered(v);
  };

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
      if (animDoneTimerRef.current != null) window.clearTimeout(animDoneTimerRef.current);
      if (pageTimerRef.current != null) window.clearTimeout(pageTimerRef.current);
    };
  }, []);

  const goToPage = (direction: "forward" | "backward") => {
    if (pageTimerRef.current != null) window.clearTimeout(pageTimerRef.current);
    setPrevPage("snapshot");
    setSlideDir(direction);
    setPageAnimating(true);
    pageTimerRef.current = window.setTimeout(() => {
      setPrevPage(null);
      setPageAnimating(false);
      pageTimerRef.current = null;
    }, CONTENT_ANIM_MS + 20);
  };

  // Open animation
  useEffect(() => {
    openTimerRef.current = window.setTimeout(() => {
      applyEntered(true);
      openTimerRef.current = null;
      animDoneTimerRef.current = window.setTimeout(() => {
        setAnimDone(true);
        animDoneTimerRef.current = null;
      }, SHEET_ENTER_MS + 50);
    }, OPEN_TICK_MS);
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setAnimDone(false);
    applyEntered(false);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, SHEET_EXIT_MS + 20);
  }, [closing, onClose]);

  const openField = (field: FieldDef) => {
    const currentVal = getFieldValue(summary, section, field.key);
    if (field.type === "number") {
      // Set as number for scrollers; fallback to sensible default
      const n = Number(currentVal);
      const defaults: Record<string, number> = { age: 30, weight: 75, height: 175 };
      setEditValue(Number.isFinite(n) && n > 0 ? n : (defaults[field.key] ?? field.min ?? 0));
    } else if (field.type === "multi-select") {
      setEditValue(Array.isArray(currentVal) ? [...currentVal] : []);
    } else {
      setEditValue(currentVal);
    }
    setActiveField(field);
    goToPage("forward");
  };

  const goBack = () => {
    setActiveField(null);
    setEditValue(null);
    goToPage("backward");
  };

  const handleSave = () => {
    if (!activeField) return;
    let val = editValue;
    if (activeField.type === "number") {
      if (!Number.isFinite(val)) return;
    }
    const updated = setFieldValue(summary, section, activeField.key, val);
    onSave(updated);
    goBack();
  };

  const handleSelectOption = (optionValue: any) => {
    setEditValue(optionValue);
  };

  const handleMultiSelectToggle = (optionValue: any, exclusiveValue?: any) => {
    setEditValue((prev: any[]) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      if (exclusiveValue !== undefined) {
        if (optionValue === exclusiveValue) {
          // Clicking exclusive value: toggle between [exclusive] and []
          return arr.includes(exclusiveValue) ? [] : [exclusiveValue];
        } else {
          // Clicking non-exclusive: remove exclusive, toggle this value
          const without = arr.filter((v) => v !== exclusiveValue);
          if (without.includes(optionValue)) {
            return without.filter((v) => v !== optionValue);
          }
          return [...without, optionValue];
        }
      }
      // No exclusive logic
      if (arr.includes(optionValue)) {
        return arr.filter((v) => v !== optionValue);
      }
      return [...arr, optionValue];
    });
  };

  const title = activeField ? activeField.label : SECTION_TITLES[section] || "";
  const showBack = !!activeField;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          background: "rgba(10,16,28,0.52)",
          opacity: entered && !closing ? 1 : 0,
          transition: `opacity ${entered ? SHEET_ENTER_MS : SHEET_EXIT_MS}ms ease`,
        }}
        onClick={requestClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2001,
          borderRadius: "24px 24px 0 0",
          background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,242,247,0.95) 100%)",
          boxShadow: "0 -8px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
          maxHeight: "85vh",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column" as const,
          padding: "0 16px 16px",
          transform: animDone ? "none" : (entered && !closing ? "translateY(0)" : "translateY(100%)"),
          transition: animDone ? "none" : `transform ${entered && !closing ? SHEET_ENTER_MS : SHEET_EXIT_MS}ms ${entered && !closing ? SPRING_OPEN : SPRING_CLOSE}`,
          willChange: animDone ? "auto" : "transform",
        }}
      >
        <style>{`
          @keyframes sh-in-right { from { opacity: 0; transform: translate3d(44px, 0, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
          @keyframes sh-in-left { from { opacity: 0; transform: translate3d(-44px, 0, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
          @keyframes sh-out-left { from { opacity: 1; transform: translate3d(0, 0, 0); } to { opacity: 0; transform: translate3d(-44px, 0, 0); } }
          @keyframes sh-out-right { from { opacity: 1; transform: translate3d(0, 0, 0); } to { opacity: 0; transform: translate3d(44px, 0, 0); } }
          .profile-scroller-list::-webkit-scrollbar { display: none; }
        `}</style>

        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.18)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 8px 8px", flexShrink: 0 }}>
          {showBack ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Назад"
              style={sh.headerBtn}
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
          ) : (
            <div style={{ width: 32, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, textAlign: "center" as const }}>
            {title}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            style={sh.headerBtn}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        {/* Content with page animations */}
        <div style={{ display: "grid", flex: 1, minHeight: 0 }}>
          {pageAnimating && prevPage ? (
            <div
              style={{
                gridArea: "1 / 1",
                display: "flex",
                flexDirection: "column" as const,
                animation: `${slideDir === "forward" ? "sh-out-left" : "sh-out-right"} ${CONTENT_ANIM_MS}ms ${SPRING_CONTENT} both`,
                pointerEvents: "none" as const,
              }}
            />
          ) : null}
          <div
            style={{
              gridArea: "1 / 1",
              display: "flex",
              flexDirection: "column" as const,
              ...(pageAnimating
                ? { animation: `${slideDir === "forward" ? "sh-in-right" : "sh-in-left"} ${CONTENT_ANIM_MS}ms ${SPRING_CONTENT} both` }
                : null),
            }}
          >
            {!activeField ? (
              /* ── Page 1: Field list ── */
              <div>
                {fields.map((field, idx) => (
                  <div key={field.key}>
                    {idx > 0 && <div style={sh.divider} />}
                    <div
                      style={sh.row}
                      onClick={() => openField(field)}
                    >
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const, gap: 4 }}>
                        <span style={sh.rowLabel}>{field.label}</span>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={sh.rowValue}>{getDisplayValue(summary, section, field)}</span>
                          <Pencil size={18} strokeWidth={2} color="#1e1f22" style={{ flexShrink: 0 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Page 2: Edit field ── */
              <div style={{ display: "flex", flexDirection: "column" as const, flex: 1, minHeight: 0 }}>
                <div>
                  {activeField.type === "number" ? (
                    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8, padding: "10px 0 24px" }}>
                      {activeField.suffix && (
                        <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(15,23,42,0.55)" }}>{activeField.suffix}</span>
                      )}
                      {activeField.key === "age" && (
                        <AgeScroller value={editValue} onChange={setEditValue} />
                      )}
                      {activeField.key === "weight" && (
                        <ProfileWeightScroller value={editValue} onChange={setEditValue} />
                      )}
                      {activeField.key === "height" && (
                        <HeightScroller value={editValue} onChange={setEditValue} />
                      )}
                    </div>
                  ) : activeField.type === "multi-select" ? (
                    activeField.options?.map((opt, idx) => (
                      <div key={String(opt.value)}>
                        {idx > 0 && <div style={sh.divider} />}
                        <div
                          style={sh.optionRow}
                          onClick={() => handleMultiSelectToggle(opt.value, activeField.exclusiveValue)}
                        >
                          <span style={sh.optionText}>{opt.label}</span>
                          {Array.isArray(editValue) && editValue.includes(opt.value) && (
                            <Check size={18} strokeWidth={2.2} color="#1e1f22" />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    activeField.options?.map((opt, idx) => (
                      <div key={String(opt.value)}>
                        {idx > 0 && <div style={sh.divider} />}
                        <div
                          style={sh.optionRow}
                          onClick={() => handleSelectOption(opt.value)}
                        >
                          <span style={sh.optionText}>{opt.label}</span>
                          {String(editValue) === String(opt.value) && (
                            <Check size={18} strokeWidth={2.2} color="#1e1f22" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Save button */}
                <div style={{ padding: "12px 0 0", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    style={sh.saveBtn}
                  >
                    <span style={sh.saveBtnLabel}>Сохранить</span>
                    <span style={sh.saveBtnCircle}><span style={sh.saveBtnCheck}>✓</span></span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const sh: Record<string, CSSProperties> = {
  headerBtn: {
    width: 32,
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: "rgba(15,23,42,0.62)",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    padding: "14px 18px",
    cursor: "pointer",
    gap: 12,
  },
  rowLabel: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    lineHeight: 1.3,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  },
  divider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginRight: -18,
  },
  optionRow: {
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
  },
  optionText: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    lineHeight: 1.3,
  },
  saveBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 50,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
    fontFamily: "inherit",
  },
  saveBtnLabel: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1,
    color: "#fff",
  },
  saveBtnCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
    color: "#0f172a",
  },
  saveBtnCheck: {
    fontSize: 18,
    lineHeight: 1,
    color: "#1e1f22",
    fontWeight: 700,
    textShadow: "0 1px 0 rgba(255,255,255,0.82), 0 -1px 0 rgba(15,23,42,0.15)",
  },
};

// ─── Scroller styles ─────────────────────────────────────────────────────────

const scr: Record<string, CSSProperties> = {
  // Age scroller
  ageWrap: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "hidden",
    width: "min(100px, 30vw)",
    height: AGE_ITEM_H * 5,
    alignSelf: "center",
  },
  ageList: {
    position: "relative",
    zIndex: 2,
    maxHeight: "100%",
    overflowY: "auto",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none" as const,
    WebkitOverflowScrolling: "touch",
  },
  ageIndicator: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: AGE_ITEM_H + 24,
    height: AGE_ITEM_H + 12,
    transform: "translate(-50%, -50%)",
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 12px 26px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    pointerEvents: "none" as const,
    zIndex: 1,
  },
  ageFadeTop: {
    position: "absolute",
    left: 0, right: 0, top: 0,
    height: AGE_ITEM_H * 2,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none" as const,
    zIndex: 3,
  },
  ageFadeBottom: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: AGE_ITEM_H * 2,
    background: "linear-gradient(0deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none" as const,
    zIndex: 3,
  },
  ageItem: {
    border: "none",
    background: "transparent",
    color: "rgba(15, 23, 42, 0.5)",
    fontSize: 24,
    fontWeight: 500,
    height: AGE_ITEM_H,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    scrollSnapAlign: "center",
    cursor: "pointer",
  },
  ageItemActive: {
    color: "#111",
    fontWeight: 700,
  },

  // Weight scroller (horizontal)
  trackWrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    alignSelf: "center",
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  trackIndicator: {
    position: "absolute",
    left: "50%",
    top: 8,
    transform: "translateX(-50%)",
    pointerEvents: "none" as const,
    width: 0, height: 0,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderTop: "8px solid rgba(15,23,42,0.35)",
  },
  trackFade: {
    position: "absolute",
    top: 0, bottom: 0,
    width: WT_ITEM_W * WT_TICKS,
    pointerEvents: "none" as const,
    zIndex: 1,
  },

  // Height scroller (vertical)
  heightWrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    alignSelf: "center",
    width: "min(140px, 36vw)",
    height: HT_ITEM_H * HT_TICKS * 4,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  heightList: {
    maxHeight: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none" as const,
    WebkitOverflowScrolling: "touch",
  },
  heightIndicator: {
    position: "absolute",
    top: "50%",
    left: 12,
    transform: "translateY(-50%)",
    pointerEvents: "none" as const,
    width: 0, height: 0,
    borderTop: "6px solid transparent",
    borderBottom: "6px solid transparent",
    borderLeft: "8px solid rgba(15,23,42,0.35)",
  },
  heightFadeTop: {
    position: "absolute",
    left: 0, right: 0, top: 0,
    height: HT_ITEM_H * HT_TICKS * 2,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none" as const,
    zIndex: 1,
  },
  heightFadeBottom: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: HT_ITEM_H * HT_TICKS * 2,
    background: "linear-gradient(0deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none" as const,
    zIndex: 1,
  },
};
