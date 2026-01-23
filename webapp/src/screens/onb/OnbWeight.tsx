// webapp/src/screens/onb/OnbWeight.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Sex } from "./OnbAgeSex";

export type OnbWeightData = {
  profile?: { name: string };
  ageSex: { sex: Sex; age: number };
  body?: { height?: number; weight?: number };
};

type Props = {
  initial?: Partial<OnbWeightData>;
  loading?: boolean;
  onSubmit: (patch: OnbWeightData) => void;
  onBack?: () => void;
};

const WEIGHT_MIN = 20;
const WEIGHT_MAX = 150;
const ITEM_WIDTH = 12;
const TICKS_PER_KG = 5;

export default function OnbWeight({ initial, loading, onSubmit, onBack }: Props) {
  const navigate = useNavigate();
  const [weight, setWeight] = useState<number | null>(
    typeof initial?.body?.weight === "number" ? initial.body.weight : 80
  );
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollStopTimerRef = useRef<number | null>(null);
  const suppressSyncRef = useRef(false);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      if (scrollStopTimerRef.current) {
        window.clearTimeout(scrollStopTimerRef.current);
        scrollStopTimerRef.current = null;
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
    const list = listRef.current;
    if (!list) return;
    if (weight == null) {
      list.scrollLeft = 0;
      return;
    }
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }
    const index = (weight - WEIGHT_MIN) * TICKS_PER_KG;
    list.scrollLeft = index * ITEM_WIDTH;
  }, [weight]);

  const setWeightFromScroll = (nextWeight: number) => {
    suppressSyncRef.current = true;
    setWeight(nextWeight);
  };

  const handleListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    if (scrollStopTimerRef.current) {
      window.clearTimeout(scrollStopTimerRef.current);
    }
    scrollStopTimerRef.current = window.setTimeout(() => {
      const rawIndex = Math.round(list.scrollLeft / ITEM_WIDTH);
      const majorIndex = Math.round(rawIndex / TICKS_PER_KG) * TICKS_PER_KG;
      const nextWeight = WEIGHT_MIN + majorIndex / TICKS_PER_KG;
      if (nextWeight >= WEIGHT_MIN && nextWeight <= WEIGHT_MAX) {
        setWeightFromScroll(nextWeight);
      }
    }, 80);
  };

  const handleNext = () => {
    if (loading || isLeaving || weight == null) return;
    const patch: OnbWeightData = {
      profile: initial?.profile,
      ageSex: {
        sex: (initial?.ageSex?.sex as Sex) || "male",
        age: (initial?.ageSex?.age as number) || 30,
      },
      body: {
        ...(initial?.body || {}),
        weight,
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

  const ticks = Array.from(
    { length: (WEIGHT_MAX - WEIGHT_MIN) * TICKS_PER_KG + 1 },
    (_, i) => ({
      index: i,
      value: WEIGHT_MIN + i / TICKS_PER_KG,
      isMajor: i % TICKS_PER_KG === 0,
    })
  );

  return (
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
        .weight-track {
          transition: transform 160ms ease;
        }
        .weight-track:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
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
        @media (hover: hover) {
          .intro-primary-btn:hover:not(:disabled) {
            filter: brightness(1.03);
          }
        }
        .intro-primary-btn:focus-visible {
          outline: 3px solid rgba(15, 23, 42, 0.18);
          outline-offset: 2px;
        }
        .weight-track-list::-webkit-scrollbar { display: none; }
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
        <div style={s.progressText}>Шаг 3 из 5</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Какой у вас вес?</h1>
        <p style={s.subtitle}>Вес нужен, чтобы настроить рекомендации под вас</p>
      </div>

      <div style={s.valueLabel} className="onb-fade onb-fade-delay-2">
        <span style={s.valueNumber}>{weight ?? "—"}</span>
        <span style={s.valueUnit}>кг</span>
      </div>

      <div style={s.trackWrap} className="onb-fade onb-fade-delay-3">
        <div style={s.trackIndicator} />
        <div style={s.trackFadeLeft} />
        <div style={s.trackFadeRight} />
        <div ref={listRef} style={s.trackList} className="weight-track-list" onScroll={handleListScroll}>
          {ticks.map((tick) => (
            <button
              key={tick.index}
              type="button"
              className="weight-track"
              style={{ ...s.trackItem, scrollSnapAlign: tick.isMajor ? "center" : "none" }}
              onClick={() => {
                const majorIndex = Math.round(tick.index / TICKS_PER_KG) * TICKS_PER_KG;
                const nextWeight = WEIGHT_MIN + majorIndex / TICKS_PER_KG;
                if (nextWeight >= WEIGHT_MIN && nextWeight <= WEIGHT_MAX) {
                  setWeightFromScroll(nextWeight);
                  listRef.current?.scrollTo({ left: majorIndex * ITEM_WIDTH, behavior: "smooth" });
                }
              }}
            >
              <div
                style={{
                  ...s.tickLabel,
                  ...(tick.isMajor ? {} : s.tickLabelEmpty),
                  ...(weight === tick.value ? s.tickLabelActive : {}),
                }}
              >
                {tick.isMajor ? tick.value : ""}
              </div>
              <div style={s.tickRow}>
                <span
                  style={{
                    ...s.tickMark,
                    ...(tick.isMajor ? s.tickMarkMajor : {}),
                    ...(weight === tick.value ? s.tickMarkActive : {}),
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: weight == null || loading ? 0.5 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={weight == null || loading || isLeaving}
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
                navigate("/onb/age");
                return;
              }
              setIsLeaving(true);
              leaveTimerRef.current = window.setTimeout(() => {
                navigate("/onb/age");
              }, 220);
            }}
            type="button"
          >
            Назад
          </button>
        ) : null}
      </div>
    </div>
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
    width: "60%",
    background: "#1e1f22",
    borderRadius: 999,
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
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
  valueLabel: {
    display: "flex",
    justifyContent: "center",
    alignItems: "baseline",
    gap: 6,
    marginTop: 6,
  },
  valueNumber: {
    fontSize: 30,
    fontWeight: 700,
    color: "#111",
  },
  valueUnit: {
    fontSize: 16,
    color: "rgba(15, 23, 42, 0.7)",
  },
  trackWrap: {
    marginTop: 12,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "hidden",
    width: ITEM_WIDTH * TICKS_PER_KG * 5,
    alignSelf: "center",
  },
  trackFadeLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: ITEM_WIDTH * TICKS_PER_KG,
    background: "linear-gradient(90deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 1,
  },
  trackFadeRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: ITEM_WIDTH * TICKS_PER_KG,
    background: "linear-gradient(270deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 1,
  },
  trackIndicator: {
    position: "absolute",
    left: "50%",
    top: 8,
    width: 0,
    height: 0,
    transform: "translateX(-50%)",
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderBottom: "8px solid rgba(15, 23, 42, 0.35)",
    pointerEvents: "none",
  },
  trackList: {
    overflowX: "auto",
    overflowY: "hidden",
    whiteSpace: "nowrap",
    scrollSnapType: "x proximity",
    WebkitOverflowScrolling: "touch",
    padding: "16px 0 20px",
    paddingLeft: `calc(50% - ${ITEM_WIDTH / 2}px)`,
    paddingRight: `calc(50% - ${ITEM_WIDTH / 2}px)`,
    position: "relative",
    zIndex: 0,
    scrollbarWidth: "none",
  },
  trackItem: {
    width: ITEM_WIDTH,
    background: "transparent",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  tickRow: {
    position: "relative",
    width: "100%",
    height: 18,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tickMark: {
    width: 2,
    borderRadius: 999,
    height: 12,
    background: "rgba(15, 23, 42, 0.35)",
  },
  tickMarkMajor: {
    height: 22,
  },
  tickMarkActive: {
    background: "rgba(15, 23, 42, 0.75)",
  },
  tickLabel: {
    fontSize: 18,
    color: "rgba(15, 23, 42, 0.45)",
    fontWeight: 500,
    height: 22,
  },
  tickLabelEmpty: {
    color: "transparent",
  },
  tickLabelActive: {
    color: "#111",
    fontWeight: 700,
    fontSize: 22,
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
