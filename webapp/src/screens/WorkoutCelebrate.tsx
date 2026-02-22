import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import morobotImg from "@/assets/morobot.webp";
import { fireHapticImpact } from "@/utils/haptics";
import BottomDock from "@/components/workout-session/BottomDock";

// ─── Helpers ─────────────────────────────────────────────────────────────

interface ResultPayload {
  title: string;
  location: string;
  durationMin: number;
  exercises: Array<{
    done: boolean;
    skipped: boolean;
    sets: Array<{ reps?: number; weight?: number; done: boolean }>;
  }>;
}

function pluralizeMinutes(n: number): string {
  if (n >= 11 && n <= 14) return "минут";
  const mod10 = n % 10;
  if (mod10 === 1) return "минута";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

function getVolumeAnalogy(kg: number): string {
  if (kg < 50) return "Легкая разминка для настоящего героя";
  if (kg < 100) return "Как будто перетащил большой холодильник";
  if (kg < 300) return "Это масса целого рояля. Музыка для мышц";
  if (kg < 600) return "Ты как будто поднял взрослого бурого медведя";
  if (kg < 1500) return "Суммарно это вес легкового автомобиля";
  if (kg < 3000) return "Целый тяжелый внедорожник остался позади";
  if (kg < 5000) return "Это же вес целого азиатского слона";
  if (kg < 10000) return "Ты поднял массу взрослого тираннозавра";
  return "Огромный тоннаж, достойный супергероя";
}

// ─── Number Counter Hook ──────────────────────────────────────────────────

function useCounter(
  target: number,
  active: boolean,
  durationMs: number = 800,
  onComplete?: () => void
) {
  const [value, setValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active || doneRef.current) return;

    let rafId: number;
    const tick = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);

      // easeOutExpo
      const easing = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      setValue(Math.round(target * easing));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setValue(target);
        doneRef.current = true;
        if (onComplete) onComplete();
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [target, active, durationMs, onComplete]);

  return value;
}

// ─── Component ──────────────────────────────────────────────────────────

const STAGE_DELAY = 1200; // ms between sequential blocks appearing

export default function WorkoutCelebrate() {
  const location = useLocation();
  const nav = useNavigate();
  const result = (location.state as any)?.result;
  const payload: ResultPayload | undefined = result?.payload;

  // Stages: 0=init, 1=show mascot, 2=block1 starts, 3=block2 starts, 4=block3 starts, 5=done
  const [stage, setStage] = useState(0);
  const [exiting, setExiting] = useState(false);

  // States to trigger subtext appearing after counters finish
  const [showSub1, setShowSub1] = useState(false);
  const [showSub2, setShowSub2] = useState(false);
  const [showSub3, setShowSub3] = useState(false);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!payload) return;

    // T+100ms: show Mascot
    const t1 = setTimeout(() => {
      setStage(1);
      fireHapticImpact("medium");
    }, 100);

    // T+800ms: block 1 appears (Percent)
    const t2 = setTimeout(() => setStage(2), 800);

    // T+2000ms: block 2 appears (Duration)
    const t3 = setTimeout(() => setStage(3), 800 + STAGE_DELAY);

    // T+3200ms: block 3 appears (Tonnage)
    const t4 = setTimeout(() => setStage(4), 800 + STAGE_DELAY * 2);

    // T+4400ms: final (show Next button)
    const t5 = setTimeout(() => {
      setStage(5);
      fireHapticImpact("light");
    }, 800 + STAGE_DELAY * 3);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5);
    };
  }, [payload]);

  const goNext = () => {
    if (exiting) return;
    setExiting(true);
    fireHapticImpact("medium");
    setTimeout(() => {
      nav("/workout/result", { replace: true, state: { result } });
    }, 320);
  };

  if (!payload) {
    nav("/", { replace: true });
    return null;
  }

  // --- Calculations ---

  // 1: Percent
  let totalSets = 0;
  let doneSets = 0;
  let totalVolume = 0;

  for (const ex of payload.exercises) {
    if (ex.skipped) continue;
    for (const set of ex.sets) {
      totalSets++;
      if (set.done) {
        doneSets++;
        if (set.reps && set.weight) {
          totalVolume += set.reps * set.weight;
        }
      }
    }
  }
  const percent = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const percentSubtext = percent === 100
    ? "Идеальное выполнение! План закрыт полностью"
    : "Отличная работа! Лучше так, чем никак — доберём своё в следующий раз";

  // 2: Duration
  const durMin = payload.durationMin || 0;

  // 3: Tonnage
  const tonnage = Math.round(totalVolume);

  // --- Counters ---
  const count1 = useCounter(percent, stage >= 2, 700, () => {
    fireHapticImpact("heavy");
    setShowSub1(true);
  });

  const count2 = useCounter(durMin, stage >= 3, 700, () => {
    fireHapticImpact("heavy");
    setShowSub2(true);
  });

  const count3 = useCounter(tonnage, stage >= 4, 800, () => {
    fireHapticImpact("heavy");
    setShowSub3(true);
  });

  return (
    <>
      <style>{css}</style>
      <div style={s.page} className={exiting ? "wc-exit" : undefined}>

        {/* --- Header / Mascot --- */}
        <div style={s.hero} className={stage >= 1 ? "wc-slide-down" : "wc-hidden"}>
          <div style={s.bubble} className="speech-bubble-bottom">
            <span>Еее! Ты выполнил тренировку</span>
          </div>
          <img src={morobotImg} alt="" style={s.mascotImg} />
        </div>

        {/* --- Metrics Grid --- */}
        <div style={s.metricsWrap}>

          {/* Block 1: Percent */}
          <div style={s.card} className={stage >= 2 ? "wc-scale-in" : "wc-hidden"}>
            <div style={s.valueRow}>
              <span style={s.valueBig}>{count1}</span>
              <span style={s.valueUnit}>%</span>
            </div>
            <div style={s.subtext} className={showSub1 ? "wc-fade-in" : "wc-hidden"}>
              {percentSubtext}
            </div>
          </div>

          {/* Block 2: Duration */}
          <div style={s.card} className={stage >= 3 ? "wc-scale-in" : "wc-hidden"}>
            <div style={s.valueRow}>
              <span style={s.valueBig}>{count2}</span>
              <span style={s.valueUnit}>{pluralizeMinutes(durMin)}</span>
            </div>
            <div style={s.subtext} className={showSub2 ? "wc-fade-in" : "wc-hidden"}>
              инвестировано в твоё здоровье и красоту
            </div>
          </div>

          {/* Block 3: Tonnage (only show if > 0) */}
          {tonnage > 0 && (
            <div style={s.card} className={stage >= 4 ? "wc-scale-in" : "wc-hidden"}>
              <div style={s.valueRow}>
                <span style={s.valueBig}>{count3.toLocaleString('ru-RU')}</span>
                <span style={s.valueUnit}>кг</span>
              </div>
              <div style={s.subtext} className={showSub3 ? "wc-fade-in" : "wc-hidden"}>
                {getVolumeAnalogy(tonnage)}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* --- Sticky Footer --- */}
      <div className={stage >= 1 ? "wc-fade-in" : "wc-hidden"}>
        <BottomDock
          primaryLabel="Далее"
          primaryVisible={stage >= 5}
          primaryVariant="compactArrow"
          onPrimary={goNext}
          secondaryLabel={stage >= 1 && stage < 5 ? "Пропустить" : undefined}
          onSecondary={goNext}
        />
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #fceade 0%, #fdf5f2 40%, #ffffff 100%)", // Matches app theme
    color: "#0f172a",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "calc(env(safe-area-inset-top, 0px) + 24px) 16px 120px",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    marginBottom: 32,
    marginTop: 20,
  },
  bubble: {
    position: "relative",
    padding: "16px 20px",
    borderRadius: 20,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(245,245,250,0.8) 100%)",
    border: "1px solid rgba(255,255,255,0.8)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    fontSize: 18,
    fontWeight: 700,
    color: "#1e1f22",
    textAlign: "center",
    maxWidth: 260,
  },
  mascotImg: {
    width: 140,
    height: "auto",
    objectFit: "contain",
  },
  metricsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    maxWidth: 400,
  },
  card: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.8)",
    padding: "20px 24px",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  valueBig: {
    fontSize: 48,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: "-0.04em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  valueUnit: {
    fontSize: 18,
    fontWeight: 700,
    color: "rgba(15,23,42,0.5)",
  },
  subtext: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#334155",
  },
};

const css = `
.speech-bubble-bottom:before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -10px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid rgba(255,255,255,0.9);
  filter: drop-shadow(0 1px 0 rgba(15, 23, 42, 0.05));
}

@keyframes wcSlideDown {
  0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.wc-slide-down {
  animation: wcSlideDown 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes wcScaleIn {
  0% { opacity: 0; transform: translateY(14px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.wc-scale-in {
  animation: wcScaleIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes wcFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.wc-fade-in {
  animation: wcFadeIn 320ms ease-out both;
}

.wc-hidden {
  opacity: 0;
  pointer-events: none;
}

@keyframes wcExit {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.95); filter: blur(4px); }
}
.wc-exit {
  animation: wcExit 320ms ease-in both;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .wc-slide-down, .wc-scale-in, .wc-fade-in, .wc-exit {
    animation: none !important;
  }
}
`;
