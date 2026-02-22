import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import mascotImg from "@/assets/robonew.webp";
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

function getPercentSubtext(p: number): string {
  if (p >= 100) return "Идеальное выполнение! План закрыт на все 100%";
  if (p >= 80) return "Отличная работа! Почти весь план выполнен, так держать";
  if (p >= 50) return "Хорошая тренировка! Половина дела сделана, базу отработали";
  if (p > 0) return "Любое движение лучше, чем ничего! Доберем свое на следующих тренировках";
  return "Главное, что ты пришел! Завтра будет лучше, чем сегодня";
}

function getVolumeAnalogy(kg: number): string {
  if (kg < 50) return "Как будто перенес пару увесистых арбузов с рынка";
  if (kg < 100) return "Масса здорового сенбернара. Хороший песик!";
  if (kg < 300) return "Ты только что поднял взрослого льва. Царь зверей отдыхает";
  if (kg < 600) return "Это масса концертного рояля. Настоящая музыка для мышц!";
  if (kg < 1000) return "Ты перетаскал вес целого белого медведя. Мощно!";
  if (kg < 2000) return "Суммарно это вес легкового автомобиля хэтчбека";
  if (kg < 3500) return "Целый тяжелый внедорожник остался позади";
  if (kg < 5000) return "Вес взрослого азиатского слона. Серьезная заявочка!";
  if (kg < 10000) return "Поздравляю, ты поднял массу взрослого тираннозавра!";
  return "Огромный тоннаж, тянет на вес небольшого кита!";
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
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active || doneRef.current) return;
    if (target === 0) {
      setValue(0);
      doneRef.current = true;
      if (onCompleteRef.current) onCompleteRef.current();
      return;
    }

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
        if (onCompleteRef.current) onCompleteRef.current();
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [target, active, durationMs]);

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
    }, 400);

    const t2 = setTimeout(() => {
      setStage(2);
    }, 1800);

    return () => {
      clearTimeout(t1); clearTimeout(t2);
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
  const percentSubtext = getPercentSubtext(percent);
  const durMin = payload.durationMin || 0;
  const tonnage = Math.round(totalVolume);

  const count1 = useCounter(percent, stage >= 2, 700, () => {
    fireHapticImpact("heavy");
    setShowSub1(true);
    setTimeout(() => setStage(3), 1000);
  });

  const count2 = useCounter(durMin, stage >= 3, 700, () => {
    fireHapticImpact("heavy");
    setShowSub2(true);
    setTimeout(() => {
      if (tonnage > 0) {
        setStage(4);
      } else {
        setStage(5);
        fireHapticImpact("light");
      }
    }, 1000);
  });

  const count3 = useCounter(tonnage, stage >= 4, 800, () => {
    if (tonnage > 0) {
      fireHapticImpact("heavy");
      setShowSub3(true);
      setTimeout(() => {
        setStage(5);
        fireHapticImpact("light");
      }, 1000);
    }
  });

  const workoutNumberMatch = payload?.title?.match(/\d+/);
  const workoutNumber = workoutNumberMatch ? workoutNumberMatch[0] : "";
  const titleText = workoutNumber ? `Еее! Ты выполнил ${workoutNumber} тренировку` : "Еее! Ты выполнил тренировку";

  return (
    <>
      <style>{css}</style>
      <div style={s.page}>

        {/* --- Header / Mascot --- */}
        <section style={s.introCenter} className={stage >= 1 ? "onb-fade" : "wc-hidden"}>
          <div style={s.headerLeft}>
            <div style={s.avatarCircle}>
              <img src={mascotImg} alt="" style={s.mascotAvatarImg} loading="eager" decoding="async" />
            </div>
            <div style={s.headerText}>
              <div style={s.headerGreeting}>Еее!</div>
              <div style={s.headerSub}>
                {workoutNumber ? `Вы выполнили ${workoutNumber} тренировку` : "Вы выполнили тренировку"}
              </div>
            </div>
          </div>
        </section>

        {/* --- Metrics Grid --- */}
        <div style={s.metricsWrap}>

          <div style={s.summaryCard} className={stage >= 2 ? "onb-fade" : "wc-hidden"}>
            <div style={s.valueRow}>
              <span style={s.valueBig}>{count1}</span>
              <span style={s.valuePercent}>%</span>
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
              инвестировано в твое здоровье
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

      {stage >= 1 && (
        <div style={s.footerFlow}>
          <button
            className="checkin-primary-btn"
            style={{
              ...s.primaryBtn,
              opacity: stage >= 5 ? 1 : 0,
              pointerEvents: stage >= 5 ? "auto" : "none",
            }}
            onClick={goNext}
          >
            <span style={s.primaryBtnText}>Далее</span>
            <span style={s.primaryBtnCircle} aria-hidden>
              <span style={{ fontSize: 20, lineHeight: 1, color: "#0f172a", fontWeight: 700 }}>→</span>
            </span>
          </button>

          <button
            className="checkin-text-btn"
            style={{
              ...s.secondaryBtn,
              opacity: stage >= 1 ? 1 : 0,
              pointerEvents: stage >= 1 ? "auto" : "none",
            }}
            onClick={goNext}
          >
            Пропустить
          </button>
        </div>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "transparent",
    color: "#1e1f22",
    minHeight: "100vh",
    margin: "0 auto",
    maxWidth: 720,
  },
  introCenter: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: "clamp(12px, 1.8vh, 18px)",
    marginTop: 8,
    marginBottom: 8,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  // Exact Dashboard avatarCircle style
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  // Exact Dashboard mascotAvatarImg style
  mascotAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 15,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.65)",
    lineHeight: 1.3,
  },
  metricsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    width: "100%",
    paddingTop: 16,
  },
  summaryCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "0 10px",
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
  },
  valueBig: {
    fontSize: 44,
    fontWeight: 900,
    color: "#1e1f22",
    letterSpacing: "-0.04em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  valuePercent: {
    fontSize: 28,
    fontWeight: 900,
    color: "#1e1f22",
  },
  valueUnit: {
    fontSize: 28,
    fontWeight: 900,
    color: "#1e1f22",
  },
  // Exact SetEditorCard setIndexTextLayer style
  subtext: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.62)",
  },
  footerFlow: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px)",
    display: "grid",
    gap: 8,
  },
  // Exact BottomDock compactArrow button style
  primaryBtn: {
    width: "fit-content",
    maxWidth: "100%",
    justifySelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 56,
    minHeight: 56,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    cursor: "pointer",
    transition: "transform 160ms ease, opacity 250ms ease",
  },
  primaryBtnText: {
    whiteSpace: "nowrap",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1,
    color: "#fff",
  },
  // Exact BottomDock primaryCompactArrowWrap style
  primaryBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -6,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "#0f172a",
    flexShrink: 0,
  },
  // Exact BottomDock secondary style
  secondaryBtn: {
    width: "100%",
    minHeight: 40,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: "rgba(15,23,42,0.6)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
    transition: "opacity 250ms ease",
  },
};

const css = `
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

.checkin-primary-btn {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.checkin-primary-btn:active {
  transform: translateY(1px) scale(0.99) !important;
  background-color: #1e1f22 !important;
}

.checkin-text-btn {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.checkin-text-btn:active {
  transform: translateY(1px) !important;
  color: rgba(17,24,39,0.72) !important;
}

@media (prefers-reduced-motion: reduce) {
  .onb-fade, .onb-fade-soft {
    animation: none !important;
  }
}
`;
