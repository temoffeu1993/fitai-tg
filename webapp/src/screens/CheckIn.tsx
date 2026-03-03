import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckInForm } from "@/components/CheckInForm";
import { startWorkout, type CheckInPayload, type StartWorkoutResponse } from "@/api/plan";
import { getScheduleOverview } from "@/api/schedule";
import { readSessionDraft } from "@/lib/activeWorkout";
import { toSessionPlan } from "@/lib/toSessionPlan";
import { buildCheckInSummaryViewModel } from "@/lib/checkinResultSummary";
import mascotImg from "@/assets/robonew.webp";
import { useTypewriterText } from "@/hooks/useTypewriterText";
import OnbAnalysisLoading from "@/screens/onb/OnbAnalysisLoading";
import BottomDock from "@/components/workout-session/BottomDock";

const INTRO_BUBBLE_PREFIX = "Пару вопросов ";
const INTRO_BUBBLE_STRONG = "о самочувствии";
const INTRO_BUBBLE_SUFFIX = ", чтобы подстроить тренировку";
const INTRO_BUBBLE_TARGET = `${INTRO_BUBBLE_PREFIX}${INTRO_BUBBLE_STRONG}${INTRO_BUBBLE_SUFFIX}`;
const CHECKIN_ANALYSIS_LINES = [
  "Анализирую твое состояние",
  "Сверяю нагрузку",
  "Проверяю время",
  "Готово!",
];
type CheckInResult = StartWorkoutResponse;

export default function CheckIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<"intro" | "form" | "analyzing" | "result">("intro");
  const [loading, setLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [pendingResult, setPendingResult] = useState<CheckInResult | null>(null);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [formStep, setFormStep] = useState(0);
  const [submittedCheckin, setSubmittedCheckin] = useState<CheckInPayload | null>(null);

  // Получаем параметры из navigation state (если пришли из PlanOne)
  const { workoutDate, returnTo, plannedWorkoutId } = (location.state || {}) as {
    workoutDate?: string;
    returnTo?: string;
    plannedWorkoutId?: string;
  };

  useEffect(() => {
    if (!plannedWorkoutId) return;
    const draft = readSessionDraft();
    if (draft?.plannedWorkoutId === plannedWorkoutId) {
      nav("/workout/session", { state: { plannedWorkoutId } });
    }
  }, [nav, plannedWorkoutId]);

  useLayoutEffect(() => {
    const lockViewport = phase === "intro" || phase === "result" || (phase === "form" && formStep <= 3);
    if (!lockViewport) return;
    const root = document.getElementById("root");
    const prevRootOverflow = root?.style.overflowY;
    const prevRootOverscroll = root?.style.overscrollBehaviorY;
    const prevBodyOverflow = document.body.style.overflowY;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;

    const resetScrollTop = () => {
      if (root) root.scrollTop = 0;
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    resetScrollTop();
    const raf = window.requestAnimationFrame(resetScrollTop);

    if (root) {
      root.style.overflowY = "hidden";
      root.style.overscrollBehaviorY = "none";
    }
    document.body.style.overflowY = "hidden";
    document.body.style.overscrollBehaviorY = "none";

    return () => {
      window.cancelAnimationFrame(raf);
      if (root) {
        root.style.overflowY = prevRootOverflow || "";
        root.style.overscrollBehaviorY = prevRootOverscroll || "";
      }
      document.body.style.overflowY = prevBodyOverflow || "";
      document.body.style.overscrollBehaviorY = prevBodyOverscroll || "";
    };
  }, [phase, formStep]);

  useEffect(() => {
    if (phase !== "analyzing" || !analysisDone || !pendingResult) return;
    setResult(pendingResult);
    setPendingResult(null);
    setAnalysisDone(false);
    setPhase("result");
  }, [phase, analysisDone, pendingResult]);

  const summary = useMemo(() => (result ? buildCheckInSummaryViewModel(result) : null), [result]);
  const resultLines = useMemo(() => {
    if (!result || !summary) return [] as string[];
    // Primary: backend-generated text; fallback: view-model fields
    const what = String(result.summary?.whatChanged || summary.title || "").trim();
    const whyRaw = String(result.summary?.why || summary.subtitle || "").trim();
    const howRaw = String(result.summary?.howToTrainToday || "").trim();
    const factualRaw = String(summary.factualLine || "").trim().replace(/^По факту:\s*/i, "").trim();

    // Suppress factual when title already contains numeric delta (→)
    const showFactual = Boolean(factualRaw && !what.includes("→"));

    return [
      what || "",
      whyRaw || "",
      howRaw || "",
      showFactual ? factualRaw : "",
    ].filter(Boolean);
  }, [result, summary]);

  const openWorkoutCountdown = (nextState: Record<string, unknown>) => {
    nav("/workout/countdown", {
      replace: true,
      state: {
        nextPath: "/workout/session",
        nextState,
        fallbackPath: returnTo || "/plan/one",
      },
    });
  };

  const goToWorkout = async () => {
    if (!result) return;
    if (result.action === "skip" || !result.workout) {
      nav(returnTo || "/plan/one");
      return;
    }
    setLoading(true);
    setResultError(null);
    let finalResult = result;
    try {
      if (plannedWorkoutId && submittedCheckin) {
        const committed = await startWorkout({
          date: workoutDate,
          plannedWorkoutId,
          checkin: submittedCheckin,
          commit: true,
        });
        if (committed.action !== "skip" && !committed.workout) {
          throw new Error("Не удалось подтвердить адаптацию перед стартом тренировки");
        }
        finalResult = {
          ...committed,
          notes: Array.isArray(committed.notes) ? committed.notes : [],
          workout: committed.workout ?? null,
        } as CheckInResult;
        setResult(finalResult);
      }
      if (finalResult.action === "skip" || !finalResult.workout) {
        nav(returnTo || "/plan/one");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error("Commit check-in before workout start failed:", err);
      setResultError(err?.message || "Не удалось применить чек-ин перед стартом. Попробуй ещё раз.");
      setLoading(false);
      return;
    }
    try {
      localStorage.setItem(
        "current_plan",
        JSON.stringify({
          plan: toSessionPlan(finalResult.workout),
          plannedWorkoutId: plannedWorkoutId || null,
          checkinSummary: finalResult.summary || null,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch { }
    openWorkoutCountdown({
      plan: toSessionPlan(finalResult.workout),
      plannedWorkoutId,
      isRecovery: finalResult.action === "recovery",
      swapInfo: finalResult.action === "swap_day" ? finalResult.swapInfo : undefined,
      notes: finalResult.notes,
      checkinSummary: finalResult.summary || null,
    });
    setLoading(false);
  };

  const handleSubmit = async (payload: CheckInPayload) => {
    setLoading(true);
    setError(null);
    setResultError(null);
    setPendingResult(null);
    setAnalysisDone(false);
    setSubmittedCheckin(payload);
    setPhase("analyzing");

    try {
      // Preview адаптации без записи в БД
      const response = await startWorkout({
        date: workoutDate,
        plannedWorkoutId,
        checkin: payload,
        commit: false,
      });

      if (response.action !== "skip" && !response.workout) {
        throw new Error("Не удалось получить адаптированную тренировку");
      }

      setPendingResult({
        ...response,
        notes: Array.isArray(response.notes) ? response.notes : [],
        workout: response.workout ?? null,
      } as CheckInResult);
    } catch (err: any) {
      console.error("CheckIn error:", err);
      setError(err.message || "Не удалось обработать чек-ин. Попробуй ещё раз.");
      setPhase("form");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipCheckIn = async () => {
    if (skipLoading || loading) return;
    setSkipLoading(true);
    setError(null);
    setResultError(null);
    try {
      if (plannedWorkoutId) {
        const overview = await getScheduleOverview();
        const target = (overview.plannedWorkouts || []).find((w) => w.id === plannedWorkoutId) || null;
        if (target?.plan) {
          const sessionPlan = toSessionPlan(target.plan);
          openWorkoutCountdown({
            plan: sessionPlan,
            plannedWorkoutId: target.id,
            checkinSummary: null,
          });
          return;
        }
        openWorkoutCountdown({ plannedWorkoutId });
        return;
      }
      nav(returnTo || "/plan/one");
    } catch (err) {
      console.error("Skip check-in failed:", err);
      if (plannedWorkoutId) {
        openWorkoutCountdown({ plannedWorkoutId });
        return;
      }
      nav(returnTo || "/plan/one");
    } finally {
      setSkipLoading(false);
    }
  };

  const handleChangeAnswers = () => {
    if (loading || skipLoading) return;
    setResultError(null);
    setPendingResult(null);
    setResult(null);
    setError(null);
    setSubmittedCheckin(null);
    setPhase("form");
  };

  const handleAnalysisDone = () => {
    setAnalysisDone(true);
  };

  const formQuestions = [
    "Как ты поспал?",
    "Какой уровень энергии?",
    "Какой уровень стресса?",
    "Сколько времени на тренировку?",
    "Есть боль или дискомфорт?",
  ];
  const bubbleText = phase === "form"
    ? formQuestions[Math.max(0, Math.min(formQuestions.length - 1, formStep))] || "Как ты сегодня?"
    : !result
      ? "Отметь самочувствие за 30 секунд."
      : "Готово. Ниже коротко, что поменялось сегодня.";
  const introBubbleTyped = useTypewriterText(
    phase === "intro" ? INTRO_BUBBLE_TARGET : "",
    { charIntervalMs: 26, startDelayMs: 120 }
  );
  const phaseBubbleTyped = useTypewriterText(
    phase !== "intro" ? bubbleText : "",
    { charIntervalMs: 26, startDelayMs: 60 }
  );

  const renderIntroBubbleText = () => {
    const typed = introBubbleTyped || "\u00A0";
    if (typed.length <= INTRO_BUBBLE_PREFIX.length) return <>{typed}</>;
    if (typed.length <= INTRO_BUBBLE_PREFIX.length + INTRO_BUBBLE_STRONG.length) {
      return (
        <>
          {INTRO_BUBBLE_PREFIX}
          <span style={styles.introBubbleTextStrong}>
            {typed.slice(INTRO_BUBBLE_PREFIX.length)}
          </span>
        </>
      );
    }
    return (
      <>
        {INTRO_BUBBLE_PREFIX}
        <span style={styles.introBubbleTextStrong}>{INTRO_BUBBLE_STRONG}</span>
        {typed.slice(INTRO_BUBBLE_PREFIX.length + INTRO_BUBBLE_STRONG.length)}
      </>
    );
  };

  const pageStyle =
    phase === "intro" || phase === "result"
      ? { ...styles.page, ...styles.pageIntro }
      : phase === "form" && formStep <= 3
        ? { ...styles.page, ...styles.pageFormLocked }
        : styles.page;

  if (phase === "analyzing") {
    return <OnbAnalysisLoading onDone={handleAnalysisDone} lines={CHECKIN_ANALYSIS_LINES} />;
  }

  return (
    <div style={pageStyle}>
      <style>{screenCss + thinkingCss}</style>
      {phase === "intro" ? (
        <>
          <section style={styles.introCenter} className="onb-fade onb-fade-delay-1">
            <div style={styles.introBubble} className="speech-bubble-bottom">
              <span aria-hidden="true" style={styles.introBubbleTextMeasure}>
                {INTRO_BUBBLE_PREFIX}
                <span style={styles.introBubbleTextStrong}>{INTRO_BUBBLE_STRONG}</span>
                {INTRO_BUBBLE_SUFFIX}
              </span>
              <span style={styles.introBubbleTextLive}>{renderIntroBubbleText()}</span>
            </div>
            <img src={mascotImg} alt="" style={styles.introMascotImg} loading="eager" decoding="async" />
          </section>
          <div className="onb-fade-soft">
            <BottomDock
              primaryLabel="Пройти чекин"
              primaryVariant="compactArrow"
              onPrimary={() => setPhase("form")}
              primaryEnabled={!(skipLoading || loading)}
              secondaryLabel={skipLoading ? "Открываем..." : "Пропустить"}
              onSecondary={handleSkipCheckIn}
            />
          </div>
        </>
      ) : null}

      {phase === "form" ? (
        <section
          style={styles.mascotRow}
          className="onb-fade-target onb-fade onb-fade-delay-1"
        >
          <img src={mascotImg} alt="" style={styles.mascotImg} loading="eager" decoding="async" />
          <div style={styles.bubble} className="speech-bubble">
            <span style={styles.bubbleText}>{phaseBubbleTyped || "\u00A0"}</span>
          </div>
        </section>
      ) : null}

      {phase === "form" ? (
        <div style={styles.formWrap}>
          <CheckInForm
            onSubmit={handleSubmit}
            onBack={() => {
              setError(null);
              setPhase("intro");
            }}
            onStepChange={(stepIndex) => {
              setFormStep(stepIndex);
            }}
            loading={loading}
            error={error}
            inline={true}
            submitLabel="Продолжить"
            title="Как ты сегодня?"
            hideStepMeta={true}
            hideStepTitle={true}
          />
        </div>
      ) : null}

      {phase === "result" && result ? (
        <>
          <section style={styles.resultCenter} className="onb-fade onb-fade-delay-1">
            <img src={mascotImg} alt="" style={styles.resultMascotImg} loading="eager" decoding="async" />
            <div style={styles.resultBubble} className="speech-bubble-top">
              <div style={styles.resultBubbleTextWrap} className="onb-fade">
                {resultLines.map((line, i) => (
                  <div key={i} style={styles.resultBubbleLine}>
                    • {line}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="onb-fade-soft">
            {resultError ? (
              <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 90px)", left: 0, right: 0, zIndex: 35, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ ...styles.summaryError, pointerEvents: "auto" }}>{resultError}</div>
              </div>
            ) : null}
            <BottomDock
              primaryLabel={result.action === "skip" ? "Перейти к плану" : "Начать тренировку"}
              primaryVariant="compactArrow"
              onPrimary={goToWorkout}
              primaryEnabled={!loading}
              secondaryLabel="Пройти заново"
              onSecondary={handleChangeAnswers}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

const screenCss = `
@keyframes onbFadeUp {
  0% { opacity: 0; transform: translateY(14px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes onbFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.onb-fade-target { opacity: 0; }
.onb-fade { animation: onbFadeUp 520ms ease-out both; }
.onb-fade-soft { animation: onbFadeIn 420ms ease-out both; }
.onb-fade-delay-1 { animation-delay: 80ms; }
.onb-fade-delay-2 { animation-delay: 160ms; }
.onb-fade-delay-3 { animation-delay: 240ms; }
.speech-bubble:before {
  content: "";
  position: absolute;
  left: -8px;
  top: 18px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 8px solid rgba(255,255,255,0.9);
  filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
}
.speech-bubble-bottom:before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -10px;
  top: auto;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid rgba(255,255,255,0.9);
  filter: drop-shadow(0 1px 0 rgba(15, 23, 42, 0.08));
}
.speech-bubble-top:before {
  content: "";
  position: absolute;
  left: 50%;
  top: -10px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 10px solid rgba(255,255,255,0.9);
  filter: drop-shadow(0 -1px 0 rgba(15, 23, 42, 0.08));
}
@media (prefers-reduced-motion: reduce) {
  .onb-fade-target { opacity: 1 !important; transform: none !important; }
  .onb-fade,
  .onb-fade-soft,
  .onb-fade-delay-1,
  .onb-fade-delay-2,
  .onb-fade-delay-3 { animation: none !important; }
}
`;

const thinkingCss = `
@keyframes thinkingPulse {
  0% { opacity: .35; transform: scale(.92); }
  50% { opacity: 1; transform: scale(1); }
  100% { opacity: .35; transform: scale(.92); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes thinkingDots {
  0%, 20% { content: ""; }
  40% { content: "."; }
  60% { content: ".."; }
  80%, 100% { content: "..."; }
}
.thinking-dots::after {
  content: "";
  animation: thinkingDots 1.15s steps(1, end) infinite;
}
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "transparent",
    color: "#1e1f22",
  },
  pageIntro: {
    minHeight: "100dvh",
    height: "100dvh",
    overflow: "hidden",
    position: "relative",
    display: "grid",
    gridTemplateRows: "1fr auto",
    padding:
      "calc(env(safe-area-inset-top, 0px) + clamp(18px, 2.8vh, 30px)) clamp(16px, 4vw, 20px) calc(env(safe-area-inset-bottom, 0px) + clamp(96px, 12.4vh, 108px))",
    gap: "clamp(8px, 1.3vh, 12px)",
  },
  pageFormLocked: {
    minHeight: "100dvh",
    height: "100dvh",
    overflow: "hidden",
  },
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: 132,
    height: "auto",
    objectFit: "contain",
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    color: "#1e1f22",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#1e1f22",
  },
  introCenter: {
    minHeight: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "clamp(10px, 2.1vh, 18px)",
    paddingTop: "clamp(12px, 1.8vh, 18px)",
    marginTop: "clamp(12px, 1.8vh, 22px)",
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
    display: "grid",
  },
  introBubbleTextMeasure: {
    fontSize: 18,
    lineHeight: 1.4,
    fontWeight: 500,
    color: "#1e1f22",
    display: "block",
    maxWidth: "30ch",
    margin: "0 auto",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    wordBreak: "normal",
    textWrap: "balance",
    gridArea: "1 / 1",
    visibility: "hidden",
    pointerEvents: "none",
  },
  introBubbleTextLive: {
    fontSize: 18,
    lineHeight: 1.4,
    fontWeight: 500,
    color: "#1e1f22",
    display: "block",
    maxWidth: "30ch",
    margin: "0 auto",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    wordBreak: "normal",
    textWrap: "balance",
    gridArea: "1 / 1",
  },
  introBubbleTextStrong: {
    fontWeight: 700,
    color: "#1e1f22",
  },
  introMascotImg: {
    width: "min(72vw, clamp(186px, 30vh, 262px))",
    height: "auto",
    objectFit: "contain",
  },
  resultCenter: {
    minHeight: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: "clamp(8px, 1.6vh, 14px)",
    paddingTop: "clamp(8px, 1.4vh, 14px)",
    marginTop: "clamp(4px, 1vh, 10px)",
  },
  resultMascotImg: {
    width: 132,
    height: "auto",
    objectFit: "contain",
    alignSelf: "center",
  },
  resultBubble: {
    position: "relative",
    width: "min(92%, 410px)",
    boxSizing: "border-box",
    textAlign: "left",
    padding: "clamp(14px, 2.1vh, 20px) clamp(16px, 2.6vw, 24px)",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,245,250,0.75) 100%)",
    color: "#1e1f22",
    boxShadow: "0 14px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    display: "grid",
    gap: 10,
  },
  resultBubbleTextWrap: {
    display: "grid",
    gap: 8,
  },
  resultBubbleLine: {
    fontSize: 15,
    lineHeight: 1.42,
    color: "rgba(30,31,34,0.84)",
  },
  formWrap: {
    marginTop: 2,
    width: "100%",
    flex: 1,
    minHeight: 0,
    display: "flex",
  },
  summaryError: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 1.35,
    color: "#b91c1c",
    fontWeight: 500,
  },
};
