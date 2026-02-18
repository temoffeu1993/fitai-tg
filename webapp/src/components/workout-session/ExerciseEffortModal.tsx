import { useEffect, useRef, useState } from "react";
import { workoutTheme } from "./theme";
import type { EffortTag } from "./types";

const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const OVERLAY_ENTER_MS = 320;
const OPEN_TICK_MS = 12;

const EFFORT_OPTIONS: Array<{ value: Exclude<EffortTag, null>; emoji: string; label: string }> = [
  { value: "easy", emoji: "🙂", label: "Легко" },
  { value: "working", emoji: "💪", label: "Рабоче" },
  { value: "quite_hard", emoji: "😮‍💨", label: "Тяжеловато" },
  { value: "hard", emoji: "😵", label: "Тяжело" },
  { value: "max", emoji: "🥵", label: "Предел" },
];

type Props = {
  open: boolean;
  exerciseName: string;
  onSelect: (value: Exclude<EffortTag, null>) => void;
};

export default function ExerciseEffortModal({ open, exerciseName, onSelect }: Props) {
  const [renderOpen, setRenderOpen] = useState(open);
  const [entered, setEntered] = useState(open);
  const enteredRef = useRef(open);

  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const applyEntered = (v: boolean) => { enteredRef.current = v; setEntered(v); };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    };
  }, []);

  // Lock body scroll
  useEffect(() => {
    if (!renderOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [renderOpen]);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current != null) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      if (!renderOpen || !enteredRef.current) {
        setRenderOpen(true);
        applyEntered(false);
        if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(() => { applyEntered(true); openTimerRef.current = null; }, OPEN_TICK_MS);
        return;
      }
      applyEntered(true);
      return;
    }
    if (!renderOpen) return;
    if (openTimerRef.current != null) { window.clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    applyEntered(false);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_MS + 20);
  }, [open, renderOpen]);

  if (!renderOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 72,
          background: workoutTheme.overlayStrong,
          opacity: entered ? 1 : 0,
          transition: `opacity ${entered ? OVERLAY_ENTER_MS : SHEET_EXIT_MS}ms ease`,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 73,
          borderRadius: "24px 24px 0 0",
          border: workoutTheme.cardBorder,
          background: "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(242,242,247,0.975) 100%)",
          boxShadow: workoutTheme.cardShadow,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          willChange: "transform, opacity",
          transform: entered ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          opacity: entered ? 1 : 0,
          transition: entered
            ? `transform ${SHEET_ENTER_MS}ms ${SPRING_OPEN}, opacity ${Math.round(SHEET_ENTER_MS * 0.6)}ms ease`
            : `transform ${SHEET_EXIT_MS}ms ${SPRING_CLOSE}, opacity ${SHEET_EXIT_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2 }} aria-hidden>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.16)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "8px 16px 4px", display: "grid", gap: 2 }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.25,
            color: workoutTheme.textPrimary,
            textAlign: "center",
          }}>
            Насколько тяжело?
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.3,
            color: workoutTheme.textSecondary,
            textAlign: "center",
          }}>
            {exerciseName}
          </div>
        </div>

        {/* Options */}
        <div style={{ display: "grid", gap: 6, padding: "8px 16px" }}>
          {EFFORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="eas-sheet-btn"
              style={{
                width: "100%",
                minHeight: 58,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.4)",
                background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                boxShadow: "0 10px 22px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
                padding: "12px 14px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                WebkitTapHighlightColor: "transparent",
              }}
              onClick={() => onSelect(option.value)}
            >
              <span style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: workoutTheme.pillBg,
                boxShadow: workoutTheme.pillShadow,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 18,
                lineHeight: 1,
              }}>
                {option.emoji}
              </span>
              <span style={{
                flex: 1,
                fontSize: 18,
                fontWeight: 500,
                color: workoutTheme.textPrimary,
                lineHeight: 1.25,
                textAlign: "left",
              }}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
