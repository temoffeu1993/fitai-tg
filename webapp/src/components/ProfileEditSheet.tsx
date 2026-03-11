import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";

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
      setEditValue(currentVal === "" || currentVal === null || currentVal === undefined ? "" : String(currentVal));
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
      const n = Number(val);
      if (!Number.isFinite(n)) return;
      val = n;
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
          overflow: "visible",
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
        <div style={{ display: "grid", flex: 1, minHeight: 0, overflow: pageAnimating ? "hidden" : "visible" }}>
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
              <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0 }}>
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
                <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flex: 1, minHeight: 0 }}>
                  {activeField.type === "number" ? (
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ position: "relative" as const }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={activeField.min}
                          max={activeField.max}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder={activeField.label}
                          autoFocus
                          style={sh.numberInput}
                        />
                        {activeField.suffix && (
                          <span style={sh.inputSuffix}>{activeField.suffix}</span>
                        )}
                      </div>
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
                <div style={{ padding: "12px 0 0", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    style={sh.saveBtn}
                  >
                    Сохранить
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
    fontSize: 15,
    fontWeight: 500,
    color: "#1e1f22",
  },
  numberInput: {
    width: "100%",
    padding: "14px 18px",
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontWeight: 500,
    color: "#1e1f22",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  inputSuffix: {
    position: "absolute" as const,
    right: 18,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.45)",
    pointerEvents: "none" as const,
  },
  saveBtn: {
    width: "100%",
    padding: "14px 0",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
