import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import morobotImg from "@/assets/morobot.webp";
import { fireHapticImpact } from "@/utils/haptics";
import BottomDock from "@/components/workout-session/BottomDock";
import { workoutTheme } from "@/components/workout-session/theme";

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

const STAGE_DELAY = 1200;

export default function WorkoutCelebrate() {
  const location = useLocation();
  const nav = useNavigate();
  const result = (location.state as any)?.result;
  const payload: ResultPayload | undefined = result?.payload;

  const [stage, setStage] = useState(0);
  const [showSub1, setShowSub1] = useState(false);
  const [showSub2, setShowSub2] = useState(false);
  const [showSub3, setShowSub3] = useState(false);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!payload) return;

    const t1 = setTimeout(() => {
      setStage(1);
      fireHapticImpact("medium");
    }, 100);

    const t2 = setTimeout(() => setStage(2), 800);
    const t3 = setTimeout(() => setStage(3), 800 + STAGE_DELAY);
    const t4 = setTimeout(() => setStage(4), 800 + STAGE_DELAY * 2);
    const t5 = setTimeout(() => {
      setStage(5);
      fireHapticImpact("light");
    }, 800 + STAGE_DELAY * 3);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5);
    };
  }, [payload]);

  const goNext = () => {
    fireHapticImpact("medium");
    nav("/workout/result", { replace: true, state: { result } });
  };

  useEffect(() => {
    if (!payload) {
      nav("/", { replace: true });
    }
  }, [payload, nav]);

  if (!payload) {
    return null;
  }

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
  const durMin = payload.durationMin || 0;
  const tonnage = Math.round(totalVolume);

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
      <div style={s.page}>

        {/* --- Header / Mascot --- */}
        <section style={s.introCenter} className={stage >= 1 ? "onb-fade" : "wc-hidden"}>
          <div style={s.introBubble} className="speech-bubble-bottom">
            <span>Еее! Ты выполнил тренировку</span>
          </div>
          <img src={morobotImg} alt="" style={s.introMascotImg} loading="eager" />
        </section>

        {/* --- Metrics Grid --- */}
        <div style={s.metricsWrap}>

          <div style={s.summaryCard} className={stage >= 2 ? "onb-fade" : "wc-hidden"}>
            <div style={s.valueRow}>
              <span style={s.valueBig}>{count1}</span>
              <span style={s.valueUnit}>%</span>
            </div>
            <div style={s.subtext} className={showSub1 ? "onb-fade-soft" : "wc-hidden"}>
              {percentSubtext}
            </div>
          </div>

          <div style={s.summaryCard} className={stage >= 3 ? "onb-fade" : "wc-hidden"}>
            <div style={s.valueRow}>
              <span style={s.valueBig}>{count2}</span>
              <span style={s.valueUnit}>{pluralizeMinutes(durMin)}</span>
            </div>
            <div style={s.subtext} className={showSub2 ? "onb-fade-soft" : "wc-hidden"}>
              инвестировано в твоё здоровье
            </div>
          </div>

          {tonnage > 0 && (
            <div style={s.summaryCard} className={stage >= 4 ? "onb-fade" : "wc-hidden"}>
              <div style={s.valueRow}>
                <span style={s.valueBig}>{count3.toLocaleString('ru-RU')}</span>
                <span style={s.valueUnit}>кг</span>
              </div>
              <div style={s.subtext} className={showSub3 ? "onb-fade-soft" : "wc-hidden"}>
                {getVolumeAnalogy(tonnage)}
              </div>
            </div>
          )}

        </div>

        <div style={{ height: 120 }} />

      </div>

      <div className={stage >= 1 ? "onb-fade-soft" : "wc-hidden"}>
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
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "transparent",
    color: "#1e1f22",
  },
  introCenter: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "clamp(10px, 2.1vh, 18px)",
    paddingTop: "clamp(12px, 1.8vh, 18px)",
    marginTop: "clamp(12px, 1.8vh, 22px)",
    marginBottom: 16,
  },
  introBubble: {
    position: "relative",
    width: "min(92%, 392px)",
    boxSizing: "border-box",
    textAlign: "center",
    padding: "clamp(14px, 2.1vh, 20px) clamp(16px, 2.6vw, 24px)",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,245,250,0.75) 100%)",
    color: "#1e1f22",
    boxShadow: "0 14px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.4,
  },
  introMascotImg: {
    width: "min(72vw, clamp(186px, 30vh, 262px))",
    height: "auto",
    objectFit: "contain",
  },
  metricsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
  },
  summaryCard: {
    position: "relative",
    borderRadius: 20,
    padding: "20px 18px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  valueBig: {
    fontSize: 44,
    fontWeight: 800,
    color: "#1e1f22",
    letterSpacing: "-0.04em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  valueUnit: {
    fontSize: 18,
    fontWeight: 600,
    color: "rgba(30,31,34,0.6)",
  },
  subtext: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "rgba(30,31,34,0.8)",
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
  filter: drop-shadow(0 1px 0 rgba(15, 23, 42, 0.08));
}

@keyframes onbFadeUp {
  0% { opacity: 0; transform: translateY(14px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes onbFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.onb-fade {
  animation: onbFadeUp 520ms ease-out both;
}
.onb-fade-soft {
  animation: onbFadeIn 420ms ease-out both;
}
.wc-hidden {
  opacity: 0;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .onb-fade, .onb-fade-soft {
    animation: none !important;
  }
}
`;
