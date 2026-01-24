// webapp/src/screens/onb/OnbDietStyle.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Budget } from "./OnbDiet";

const OPTIONS = ["Всеядный", "Вегетарианец", "Веган", "Халяль", "Кошер", "Другое"] as const;

export type OnbDietStyleData = {
  preferences: { dislike: string[] };
  dietPrefs: {
    restrictions: string[];
    restrictionOther?: string;
    styles: string[];
    styleOther?: string;
    budgetLevel: Budget;
  };
};

type Props = {
  initial?: Partial<OnbDietStyleData>;
  loading?: boolean;
  onSubmit: (patch: OnbDietStyleData) => void;
  onBack?: () => void;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

export default function OnbDietStyle({ initial, loading, onSubmit, onBack }: Props) {
  const navigate = useNavigate();
  const [stylesSel, setStylesSel] = useState<string[]>(initial?.dietPrefs?.styles ?? []);
  const [styleOther, setStyleOther] = useState<string>(initial?.dietPrefs?.styleOther ?? "");
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const otherInputRef = useRef<HTMLInputElement | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevOverflow = root?.style.overflowY;
    const prevOverscroll = root?.style.overscrollBehaviorY;
    const prevScrollBehavior = root?.style.scrollBehavior;
    if (root) {
      root.style.overflowY = "hidden";
      root.style.overscrollBehaviorY = "none";
      root.style.scrollBehavior = "auto";
      root.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    return () => {
      if (root) {
        root.style.overflowY = prevOverflow || "";
        root.style.overscrollBehaviorY = prevOverscroll || "";
        root.style.scrollBehavior = prevScrollBehavior || "";
      }
    };
  }, []);

  useEffect(() => {
    if (!otherOpen) return;
    const id = window.setTimeout(() => {
      otherInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [otherOpen]);

  const toggle = (value: string) => {
    if (value === "Другое") {
      setStylesSel((prev) => (prev.includes("Другое") ? prev : [...prev, "Другое"]));
      setOtherOpen(true);
      return;
    }
    setStylesSel((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const handleOtherSave = () => {
    if (styleOther.trim()) {
      setOtherOpen(false);
      return;
    }
    setStylesSel((prev) => prev.filter((item) => item !== "Другое"));
    setStyleOther("");
    setOtherOpen(false);
  };

  const handleNext = () => {
    if (loading || isLeaving) return;
    const outStyles = (() => {
      if (!stylesSel.length) return [];
      if (stylesSel.includes("Другое") && styleOther.trim()) {
        return Array.from(new Set([...stylesSel.filter((s) => s !== "Другое"), styleOther.trim()]));
      }
      return stylesSel;
    })();

    const restrictions = initial?.dietPrefs?.restrictions ?? initial?.preferences?.dislike ?? [];

    const patch: OnbDietStyleData = {
      preferences: { dislike: restrictions },
      dietPrefs: {
        restrictions,
        restrictionOther: initial?.dietPrefs?.restrictionOther ?? "",
        styles: outStyles,
        styleOther: styleOther.trim(),
        budgetLevel: initial?.dietPrefs?.budgetLevel ?? "medium",
      },
    };
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onSubmit(patch);
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      onSubmit(patch);
    }, 220);
  };

  return (
    <>
      <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
        <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes onbFadeDown {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(12px); }
        }
        .onb-fade {
          animation: onbFadeUp 520ms ease-out both;
        }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 240ms; }
        .onb-leave {
          animation: onbFadeDown 220ms ease-in both;
        }
        .gender-card {
          appearance: none;
          outline: none;
          -webkit-tap-highlight-color: transparent;
          transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
          will-change: transform, background, border-color;
        }
        .gender-card:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
          background: var(--tile-bg) !important;
          border-color: var(--tile-border) !important;
          color: var(--tile-color) !important;
        }
        .intro-primary-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .intro-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #141619 !important;
          box-shadow: 0 6px 12px rgba(0,0,0,0.14) !important;
          filter: brightness(0.99) !important;
        }
        .sheet-fade {
          animation: sheetFadeIn 220ms ease-out both;
        }
        .sheet-card {
          animation: sheetPop 240ms ease-out both;
        }
        @keyframes sheetFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes sheetPop {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (hover: hover) {
          .intro-primary-btn:hover:not(:disabled) {
            filter: brightness(1.03);
          }
        }
        .intro-primary-btn:focus-visible {
          outline: 3px solid rgba(15, 23, 42, 0.18);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade,
          .onb-fade-delay-1,
          .onb-fade-delay-2,
          .onb-fade-delay-3 { animation: none !important; }
          .onb-leave { animation: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
        `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 5 из 5</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Выберите стиль питания</h1>
        <p style={s.subtitle}>
          Это нужно, чтобы план питания соответствовал вашим правилам и предпочтениям
        </p>
      </div>

      <div style={s.tiles} className="onb-fade onb-fade-delay-3">
        {OPTIONS.map((value) => {
          const isActive = stylesSel.includes(value);
          return (
            <button
              key={value}
              type="button"
              className="gender-card"
              style={{
                ...s.tile,
                ["--tile-bg" as never]:
                  isActive
                    ? "#1e1f22"
                    : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                ["--tile-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                ["--tile-color" as never]: isActive ? "#fff" : "#1e1f22",
                ...(isActive ? s.tileActive : {}),
              }}
              onClick={() => toggle(value)}
            >
              {value}
            </button>
          );
        })}
      </div>

      <div style={s.inputWrap}>
        {styleOther.trim() ? (
          <div style={s.tilesExtra} className="onb-fade onb-fade-delay-3">
            <button
              type="button"
              className="gender-card"
              style={{
                ...s.tile,
                ["--tile-bg" as never]: "#1e1f22",
                ["--tile-border" as never]: "#1e1f22",
                ["--tile-color" as never]: "#fff",
                ...s.tileActive,
              }}
              onClick={() => {
                setStyleOther("");
                setStylesSel((prev) => prev.filter((item) => item !== "Другое"));
                setOtherOpen(false);
              }}
            >
              {styleOther.trim()}
            </button>
          </div>
        ) : null}
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: loading ? 0.5 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={loading || isLeaving}
        >
          Далее
        </button>
        {onBack ? (
          <button
            style={s.backBtn}
            className="onb-fade onb-fade-delay-3"
            onClick={() => {
              if (isLeaving) return;
              const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
              if (prefersReduced) {
                navigate("/onb/diet");
                return;
              }
              setIsLeaving(true);
              leaveTimerRef.current = window.setTimeout(() => {
                navigate("/onb/diet");
              }, 220);
            }}
            type="button"
          >
            Назад
          </button>
        ) : null}
      </div>
      </div>
      {otherOpen ? (
        <div style={s.sheetWrap} className="sheet-fade" onClick={() => setOtherOpen(false)}>
          <div style={s.sheet} className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              style={s.sheetClose}
              onClick={() => setOtherOpen(false)}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <input
              ref={otherInputRef}
              value={styleOther}
              onChange={(e) => setStyleOther(e.target.value)}
              placeholder="Уточни свой вариант"
              style={s.sheetInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOtherSave();
              }}
            />
            <button
              type="button"
              style={s.sheetPrimary}
              className="intro-primary-btn"
              onClick={handleOtherSave}
            >
              Сохранить
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#0f172a",
    overflow: "hidden",
  },
  progressWrap: {
    display: "grid",
    gap: 8,
    marginTop: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "100%",
    background: "#1e1f22",
    borderRadius: 999,
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
  },
  header: {
    display: "grid",
    gap: 8,
    textAlign: "center",
    alignItems: "center",
    marginTop: 16,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.1,
    fontWeight: 700,
    letterSpacing: -0.8,
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.7)",
  },
  tiles: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    width: "100%",
  },
  tilesExtra: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    width: "100%",
  },
  inputWrap: {
    minHeight: 58,
  },
  tile: {
    borderRadius: 18,
    border: "1px solid var(--tile-border)",
    background: "var(--tile-bg)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "var(--tile-color)",
    fontSize: 16,
    fontWeight: 500,
    padding: "18px 10px",
    textAlign: "center",
    cursor: "pointer",
  },
  tileActive: {
    background: "#1e1f22",
    border: "1px solid #1e1f22",
    color: "#fff",
  },
  sheetWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    padding: "0 16px",
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(15, 23, 42, 0.16)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    pointerEvents: "none",
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    padding: "12px 14px 14px",
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.6)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
    display: "grid",
    gap: 10,
    pointerEvents: "auto",
    position: "relative",
  },
  sheetClose: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 10,
    border: "none",
    background: "rgba(15, 23, 42, 0.08)",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  },
  sheetInput: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    padding: "12px 14px",
    fontSize: 16,
    color: "#0f172a",
    outline: "none",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
  },
  sheetCheck: {
    width: "100%",
    borderRadius: 14,
    padding: "12px 16px",
    border: "none",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  sheetPrimary: {
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
  primaryBtn: {
    marginTop: 18,
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
  actions: {
    marginTop: "auto",
    paddingTop: 18,
    display: "grid",
    gap: 10,
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
};
