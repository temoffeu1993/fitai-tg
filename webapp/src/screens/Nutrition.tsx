// webapp/src/screens/Nutrition.tsx
// Экран недельного плана питания. Визуал выровнен под «Питание сегодня».
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNutritionPlan } from "@/hooks/useNutritionPlan";

type FoodItem = {
  food: string; qty: number; unit: string;
  kcal?: number; protein_g?: number; fat_g?: number; carbs_g?: number;
  prep?: string; notes?: string;
};
type Meal = {
  title: string; time?: string;
  target_kcal?: number; target_protein_g?: number; target_fat_g?: number; target_carbs_g?: number;
  items: FoodItem[];
  notes?: string;
};
type Day = { day_index: number; date: string; meals: Meal[] };
type WeekPlan = {
  id: string;
  week_start_date: string;
  name: string;
  notes?: string;
  goal: { kcal: number; protein_g: number; fat_g: number; carbs_g: number; meals_per_day: number; diet_style?: string };
  days: Day[];
};

const STAGE_LABELS: Record<string, string> = {
  queued: "Готовлю данные",
  context: "Анализирую анкету",
  prompt: "Формирую запрос к AI",
  waiting_ai: "Жду ответ AI",
  ai_response: "Получил меню от AI",
  qa_adjust: "Проверяю КБЖУ и порции",
  saving: "Сохраняю план",
  completed: "План готов",
  failed: "Ошибка генерации",
  idle: "Готовлю данные",
};

export default function Nutrition() {
  const [stage, setStage] = useState(0);
  const {
    plan,
    status: planStatus,
    metaError,
    error,
    loading,
    progress: serverProgress,
    progressStage,
    generate,
    regenerate,
    refresh,
  } = useNutritionPlan<WeekPlan>({ normalize });
  const [openDay, setOpenDay] = useState<number | null>(1);
  const [showNotes, setShowNotes] = useState(false);

  const steps = useMemo(
    () => ["Анализ онбординга", "Расчёт КБЖУ", "Подбор рецептов", "Баланс дней", "Готовим неделю"],
    []
  );

  useEffect(() => {
    const t = setInterval(() => setStage((s) => (s < steps.length - 1 ? s + 1 : s)), 1200);
    return () => clearInterval(t);
  }, [steps.length]);

  const totals = useMemo(() => {
    if (!plan) return null;
    const days = plan.days || [];
    const avg = (key: "kcal"|"protein_g"|"fat_g"|"carbs_g") => {
      const perDay = days.map(d =>
        (d.meals || []).reduce((a, m) => a + Number(m[`target_${key}` as any] ?? 0), 0)
      );
      const sum = perDay.reduce((a, x) => a + x, 0);
      return Math.round(sum / Math.max(1, days.length));
    };
    return {
      kcal: plan.goal?.kcal || avg("kcal"),
      protein: plan.goal?.protein_g || avg("protein_g"),
      fat: plan.goal?.fat_g || avg("fat_g"),
      carbs: plan.goal?.carbs_g || avg("carbs_g"),
      meals: plan.goal?.meals_per_day || guessMeals(plan),
    };
  }, [plan]);

  const weekLabel = useMemo(() => {
    if (!plan) return "";
    const start = parseISODate(plan.week_start_date);
    if (!start) return "";
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [plan]);

  const [fallbackProgress, setFallbackProgress] = useState(0);
  const fallbackTimerRef = useRef<number | null>(null);

  const isProcessing = planStatus === "processing";

  useEffect(() => {
    if (isProcessing && (serverProgress == null || serverProgress <= 5)) {
      if (fallbackTimerRef.current) return;
      const start = Date.now();
      fallbackTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - start;
        const pct = Math.min(40, Math.round((elapsed / 20000) * 40));
        setFallbackProgress(pct);
      }, 1000);
    } else {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setFallbackProgress(0);
    }
    return () => {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [isProcessing, serverProgress]);

  const handleGenerate = useCallback(
    (force?: boolean) => {
      setFallbackProgress(5);
      const action = force ? regenerate() : generate();
      action.catch(() => {
        setFallbackProgress(0);
      });
    },
    [generate, regenerate]
  );

  const showInitialLoader = loading && !plan && !isProcessing;
  const showGeneration = isProcessing;
  const effectiveProgress = Math.min(
    100,
    Math.max(serverProgress ?? fallbackProgress, 0)
  );
  const stageMessage = STAGE_LABELS[progressStage ?? "idle"] || STAGE_LABELS.idle;

  if (showInitialLoader) {
    return <Loader stage={stage} steps={steps} label="Проверяю актуальный план" />;
  }

  if (error) {
    return <ErrorView msg={error} onRetry={() => refresh().catch(() => {})} />;
  }

  if (planStatus === "failed") {
    return (
      <ErrorView
        msg={metaError || "Не удалось сгенерировать план питания"}
        onRetry={() => regenerate().catch(() => {})}
      />
    );
  }

  if (showGeneration) {
    return <GenerationView progress={effectiveProgress} stage={stageMessage} />;
  }

  if (!plan) {
    return <EmptyState onGenerate={() => handleGenerate()} />;
  }

  const heroStatus = "План готов";

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />

      {/* HERO — чёрный как на «Питание сегодня» */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Неделя</span>
          <span style={s.credits}>{heroStatus}</span>
        </div>

        <div style={{ marginTop: 8, opacity: .9, fontSize: 13 }}>{weekLabel}</div>
        <div style={s.heroTitle}>{plan.name || "Питание на неделю"}</div>
        <div style={s.heroSubtitle}>Сбалансированные приёмы пищи под твою цель</div>

          <button
            className="soft-glow"
            disabled={loading}
            style={{
              ...s.primaryBtn,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onClick={() => {
              setStage(0);
              handleGenerate(true);
            }}
          >
            Сгенерировать заново
          </button>
      </section>

      {/* ЧИПЫ ПОД ГЕРОЕМ — фирменный стиль как «Питание сегодня» */}
      {totals && (
        <section style={{ ...s.block, ...s.statsSection }}>
          <div style={s.statsRow}>
            <Stat icon="🔥" label="Ккал/день" value={String(totals.kcal)} />
            <Stat icon="🥚" label="Белки" value={`${totals.protein} г`} />
            <Stat icon="🍚" label="Ж/У" value={`${totals.fat}/${totals.carbs} г`} />
          </div>
        </section>
      )}

      {/* Список дней — стеклянные карточки как в «сегодня» */}
      {(plan.days || []).map((d) => (
        <section key={d.day_index} style={s.block}>
          <div style={ux.card}>
            <button
              style={{ ...ux.cardHeader, width: "100%", border: "none", textAlign: "left", cursor: "pointer" }}
              onClick={() => setOpenDay(openDay === d.day_index ? null : d.day_index)}
            >
              <div style={{ ...ux.iconInline }}>🍽️</div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ux.cardTitleRow}>
                  <div style={ux.cardTitle}>{weekdayTitle(d)}</div>
                  <div
                    style={{
                      ...ux.caretWrap,
                      transform: openDay === d.day_index ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <div style={ux.caretInner} />
                  </div>
                </div>
                {(() => {
                  const dt = parseISODate(d.date);
                  return (
                    <div style={ux.cardHint}>
                      {dt ? dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }) : `День ${d.day_index}`}
                    </div>
                  );
                })()}
              </div>
            </button>

            {openDay === d.day_index && (
              <div style={{ padding: 12 }}>
                {(d.meals || []).map((m, idx) => {
                  const totals = (m.items || []).reduce(
                    (acc, it) => ({
                      kcal: acc.kcal + Number(it.kcal ?? 0),
                      protein: acc.protein + Number(it.protein_g ?? 0),
                      fat: acc.fat + Number(it.fat_g ?? 0),
                      carbs: acc.carbs + Number(it.carbs_g ?? 0),
                    }),
                    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
                  );
                  const mk = Math.round(totals.kcal);
                  const mp = Math.round(totals.protein);
                  const mf = Math.round(totals.fat);
                  const mc = Math.round(totals.carbs);
                  const targetKcal = m.target_kcal ?? mk;
                  return (
                    <div key={idx} style={mealCard.wrap}>
                      <div style={mealCard.header}>
                        <div style={row.name}>{m.title}{m.time ? ` • ${m.time}` : ""}</div>
                        <div style={row.cues}>{fmtTargets({ mk, mp, mf, mc, targetKcal })}</div>
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {(m.items || []).map((it, k) => (
                          <div key={k} style={food.line}>
                            <div style={food.left}>
                              <div style={food.textCol}>
                                <div style={food.foodName}>{it.food}</div>
                                {(it.prep || it.notes) && (
                                  <div style={food.metaText}>
                                    {it.prep ? `Способ: ${it.prep}` : null}
                                    {it.prep && it.notes ? " • " : ""}
                                    {it.notes ? it.notes : null}
                                  </div>
                                )}
                              </div>
                              <div style={food.qty}>{`${num(it.qty)} ${it.unit}`}</div>
                            </div>
                            <div style={food.right}>
                              {typeof it.kcal === "number" ? <span>{it.kcal} ккал</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>

                      {m.notes ? <div style={mealCard.notes}>{m.notes}</div> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ))}

      <div style={{ height: 56 }} />
      {/* Плавающие заметки нутрициолога */}
      {plan.notes && (
        <>
          {showNotes && (
            <div style={notesStyles.chatPanelWrap}>
              <div style={notesStyles.chatPanel}>
                <div style={notesStyles.chatHeader}>
                  <div style={notesStyles.chatHeaderLeft}>
                    <div style={notesStyles.robotIconLarge}>🤖</div>
                    <div style={notesStyles.chatTitle}>Заметки нутрициолога</div>
                  </div>
                  <button style={notesStyles.closeBtn} onClick={() => setShowNotes(false)}>✕</button>
                </div>
                <div style={notesStyles.chatBody}>{plan.notes}</div>
              </div>
            </div>
          )}
          <div style={notesStyles.fabWrap} onClick={() => setShowNotes((v) => !v)}>
            {!showNotes && (
              <div style={notesStyles.speechBubble}>
                <div style={notesStyles.speechText}>Заметки нутрициолога</div>
                <div style={notesStyles.speechArrow} />
              </div>
            )}
            <div style={notesStyles.fabCircle}><span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span></div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- utils ---------------- */
function normalize(p: any) {
  p.days = (p.days || []).map((d: any, i: number) => ({
    day_index: Number(d.day_index ?? i + 1),
    date: d.date,
    meals: (d.meals || []).map((m: any) => ({
      title: String(m.title || "Приём пищи"),
      time: m.time || undefined,
      target_kcal: m.target_kcal ?? undefined,
      target_protein_g: m.target_protein_g ?? undefined,
      target_fat_g: m.target_fat_g ?? undefined,
      target_carbs_g: m.target_carbs_g ?? undefined,
      items: (m.items || []).map((it: any) => ({
        food: String(it.food || ""),
        qty: Number(it.qty ?? 0),
        unit: String(it.unit || ""),
        kcal: it.kcal ?? undefined,
        protein_g: it.protein_g ?? undefined,
        fat_g: it.fat_g ?? undefined,
        carbs_g: it.carbs_g ?? undefined,
        prep: it.prep ?? undefined,
        notes: it.notes ?? undefined,
      })),
      notes: m.notes || undefined,
    })),
  }));

  return p;
}

function parseISODate(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function weekdayTitle(d: Day) {
  const dt = parseISODate(d.date);
  const wd = dt ? dt.getDay() : 0; // 0=Вс
  const map = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const label = map[wd] || `День ${d.day_index}`;
  return `${label}`;
}

function fmtTargets(agg: { mk: number; mp: number; mf: number; mc: number; targetKcal?: number }) {
  const t = [
    typeof agg.targetKcal === "number" ? `цель ${agg.targetKcal} ккал` : null,
    `${agg.mk} ккал`,
    `${agg.mp} г белка`,
    `${agg.mf}/${agg.mc} г Ж/У`,
  ]
    .filter(Boolean)
    .join(" • ");
  return t;
}
function guessMeals(p: WeekPlan | null): number {
  if (!p) return 4;
  const days = p.days || [];
  const counts = days.map(d => (d.meals || []).length).filter(n => n > 0);
  if (counts.length === 0) return 4;
  const avg = Math.round(counts.reduce((a, x) => a + x, 0) / counts.length);
  return Math.min(8, Math.max(1, avg));
}
const num = (x: any) => (Number.isFinite(x) ? String(x) : "");

/* ---------------- shared UI from Plan «Сегодня» ---------------- */
function SoftGlowStyles() { return (<style>{`
  .soft-glow{background:linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);background-size:300% 300%;
  animation:glowShift 6s ease-in-out infinite,pulseSoft 3s ease-in-out infinite;transition:background .3s}
  @keyframes glowShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
  @keyframes pulseSoft{0%,100%{filter:brightness(1) saturate(1);transform:scale(1)}50%{filter:brightness(1.15) saturate(1.1);transform:scale(1.01)}}
`}</style>); }
function TypingDotsStyles(){return(<style>{`
  .typing-dots{display:inline-flex;align-items:center;gap:4px}
  .typing-dots .dot{width:6px;height:6px;border-radius:50%;background:#1b1b1b;opacity:.3;animation:blink 1.2s infinite}
  .typing-dots .dot:nth-child(2){animation-delay:.2s}
  .typing-dots .dot:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}100%{opacity:.3;transform:translateY(0)}}
`}</style>); }
function Spinner(){return(<svg width="56" height="56" viewBox="0 0 50 50" style={{display:"block"}}>
  <circle cx="25" cy="25" r="20" stroke="rgba(0,0,0,.35)" strokeWidth="6" fill="none"/>
  <circle cx="25" cy="25" r="20" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none"
    strokeDasharray="110" strokeDashoffset="80" style={{transformOrigin:"25px 25px",animation:"spin 1.2s linear infinite"}}/>
  <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
</svg>);}

/* >>> UPDATED LOADER: чипы вынесены ПОД верхний блок и в формате ChipStatSquare <<< */
function Loader({ stage, steps, label }: { stage: number; steps: string[]; label: string }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Генерация</span>
          <span style={s.credits}>ИИ работает</span>
        </div>
        <div style={{ marginTop: 8, opacity: .9, fontSize: 13 }}>{steps[stage]}</div>
        <div style={s.heroTitle}>{label}</div>
        <div style={s.loadWrap}>
          <Spinner />
          <div style={{ marginTop: 8, fontSize: 13, opacity: .9 }}>Учитываю цели и ограничения</div>
        </div>
      </section>

      <section style={s.statsRow}>
        <ChipStatSquare emoji="🧠" label="Аналитика" value="в процессе" />
        <ChipStatSquare emoji="🧩" label="Подбор" value="готовится" />
        <ChipStatSquare emoji="⚡" label="Прогресс" value={`${Math.min(20 + stage * 20, 95)}%`} />
      </section>

      <section style={s.blockWhite}><SkeletonLine /><SkeletonLine w={80} /><SkeletonLine w={60} /></section>
    </div>
  );
}
function ErrorView({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <section style={s.blockWhite}>
        <h3 style={{ marginTop: 0 }}>{msg}</h3>
        <p style={{ marginTop: 6, color: "#555" }}>Повтори попытку позже.</p>
        <button style={s.rowBtn} onClick={onRetry ?? (() => window.location.reload())}>
          Повторить
        </button>
      </section>
    </div>
  );
}

/* ---------------- стили как на «Питание сегодня» ---------------- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const SCHEDULE_BTN_GRADIENT = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const s: Record<string, React.CSSProperties> = {
  page:{
    maxWidth:720,margin:"0 auto",padding:"16px",
    fontFamily:"system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background:"transparent",
    minHeight:"100vh",
  },
  heroCard:{
    position:"relative",padding:22,borderRadius:28,boxShadow:"0 2px 6px rgba(0,0,0,.08)",
    background:"#050505",color:"#fff",overflow:"hidden"
  },
  heroHeader:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  pill:{
    background:"rgba(255,255,255,.08)",padding:"6px 12px",borderRadius:999,fontSize:12,color:"#fff",
    border:"1px solid rgba(255,255,255,.18)",backdropFilter:"blur(6px)"
  },
  credits:{
    background:"rgba(255,255,255,.08)",padding:"6px 12px",borderRadius:999,fontSize:12,color:"#fff",
    border:"1px solid rgba(255,255,255,.18)",backdropFilter:"blur(6px)"
  },
  heroTitle:{fontSize:26,fontWeight:800,marginTop:6,color:"#fff"},
  heroSubtitle:{opacity:.9,marginTop:4,color:"rgba(255,255,255,.85)"},
  primaryBtn:{
    border:"none",borderRadius:16,padding:"14px 18px",fontSize:16,fontWeight:700,color:"#000",
    background:SCHEDULE_BTN_GRADIENT,boxShadow:"0 12px 30px rgba(0,0,0,.35)",cursor:"pointer",width:"100%",marginTop:12
  },
  progressWrap:{
    width:"100%",
    height:10,
    borderRadius:999,
    background:"rgba(255,255,255,0.15)",
    border:"1px solid rgba(255,255,255,0.25)",
    overflow:"hidden",
  },
  progressBar:{
    height:"100%",
    background:"linear-gradient(90deg,#ffe680,#ff9f6b)",
    transition:"width .6s ease",
  },
  progressLabel:{marginTop:8,fontSize:14,fontWeight:700,color:"#fff"},
  statsSection:{marginTop:12,padding:0,background:"transparent",boxShadow:"none"},
  statsRow:{
    display:"grid",
    gridTemplateColumns:"repeat(3,minmax(96px,1fr))",
    gap:12,
    marginTop:12,
    marginBottom:10
  },
  chipSquare:{
    background:"rgba(255,255,255,0.6)",
    color:"#000",
    border:"1px solid rgba(0,0,0,0.08)",
    boxShadow:"0 2px 6px rgba(0,0,0,0.08)",
    borderRadius:12,
    padding:"10px 8px",
    minHeight:96,
    display:"grid",
    placeItems:"center",
    textAlign:"center",
    backdropFilter:"blur(8px)",
    WebkitBackdropFilter:"blur(8px)",
    gap:4,
    wordBreak:"break-word",
    whiteSpace:"normal",
    hyphens:"none",
  },

  stat:{
    background:"rgba(255,255,255,.6)",
    borderRadius:12,
    border:"1px solid rgba(0,0,0,0.08)",
    boxShadow:"0 2px 6px rgba(0,0,0,0.08)",
    padding:"10px 8px",
    minHeight:96,
    display:"grid",
    placeItems:"center",
    textAlign:"center",
    gap:4
  },
  statEmoji:{fontSize:20,color:"#111"},
  statLabel:{fontSize:11,color:"rgba(0,0,0,.75)",letterSpacing:0.2},
  statValue:{fontWeight:800,fontSize:18,color:"#111"},

  block:{marginTop:16,padding:0,borderRadius:16,background:"transparent",boxShadow:"none"},
  blockWhite:{marginTop:16,padding:14,borderRadius:16,background:"#fff",boxShadow:cardShadow},
  rowBtn:{
    border:"none",padding:"12px 14px",borderRadius:12,fontWeight:700,color:"#fff",
    background:"linear-gradient(135deg,#6a8dff,#8a64ff)",cursor:"pointer",marginTop:8
  },
  loadWrap:{marginTop:10,display:"grid",justifyItems:"center"},
};

const ux: Record<string, any> = {
  card:{
    borderRadius:20,
    border:"1px solid rgba(255,255,255,.35)",
    boxShadow:"0 16px 30px rgba(0,0,0,.12)",
    background:"rgba(255,255,255,0.75)",
    backdropFilter:"blur(14px)",
    position:"relative",
    overflow:"hidden",
  },
  cardHeader:{
    display:"grid",
    gridTemplateColumns:"24px 1fr",
    alignItems:"center",
    gap:10,
    padding:14,
    borderBottom:"1px solid rgba(255,255,255,.4)",
    background:"rgba(255,255,255,0.6)",
    backdropFilter:"blur(8px)",
  },
  iconInline:{width:24,height:24,display:"grid",placeItems:"center",fontSize:18},
  cardTitleRow:{display:"flex",alignItems:"center",gap:6,justifyContent:"space-between"},
  cardTitle:{fontSize:15,fontWeight:750,color:"#1b1b1b",lineHeight:1.2},
  cardHint:{fontSize:11,color:"#2b2b2b",opacity:.85},
  caretWrap:{
    width:24,height:24,borderRadius:8,background:"rgba(139,92,246,.12)",
    boxShadow:"inset 0 0 0 1px rgba(0,0,0,.05)",
    display:"grid",placeItems:"center",transition:"transform .18s"
  },
  caretInner:{width:0,height:0,borderLeft:"5px solid transparent",borderRight:"5px solid transparent",borderTop:"6px solid #4a3a7a"},
};

const mealCard: Record<string, React.CSSProperties> = {
  wrap:{
    borderRadius:14,
    padding:12,
    display:"grid",
    gap:10,
    background:"rgba(255,255,255,0.75)",
    border:"1px solid rgba(255,255,255,.35)",
    boxShadow:"0 10px 24px rgba(0,0,0,.12)",
    backdropFilter:"blur(10px)",
    marginBottom:12,
  },
  header:{display:"grid",gap:4,color:"#1b1b1b"},
  notes:{fontSize:11,color:"#4a4a4a",marginTop:6, whiteSpace:"pre-wrap"},
};

const row: Record<string, React.CSSProperties> = {
  name:{fontSize:13.5,fontWeight:750,color:"#111",lineHeight:1.15,whiteSpace:"normal"},
  cues:{fontSize:11,color:"#333"},
};

const food: Record<string, React.CSSProperties> = {
  line:{
    display:"grid",
    gridTemplateColumns:"1fr auto",
    alignItems:"center",
    gap:10,
    padding:"10px 12px",
    borderRadius:12,
    background:"rgba(255,255,255,0.9)",
    border:"1px solid rgba(0,0,0,.06)",
    boxShadow:"0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter:"blur(6px)",
  },
  left:{display:"flex",alignItems:"flex-start",gap:8,minWidth:0},
  textCol:{display:"grid",gap:4,minWidth:0},
  // >>> Обновлено: переносы текста, без обрезания, поддержка длинных названий
  foodName:{
    fontSize:13.5,fontWeight:600,color:"#1b1b1b",lineHeight:1.25,
    whiteSpace:"pre-wrap",            // переносы строк по \n
    wordBreak:"break-word",           // перенос длинных слов/брендов
    overflow:"visible",
  },
  // мета-инфа: способ приготовления и заметки QA
  metaText:{
    fontSize:11.5,color:"#666",
    whiteSpace:"pre-wrap",
    wordBreak:"break-word",
  },
  qty:{fontSize:12,color:"#666",flexShrink:0, marginTop:2},
  right:{fontSize:12,fontWeight:600,color:"#1b1b1b"},
};

const notesStyles: Record<string, React.CSSProperties> = {
  fabWrap:{position:"fixed",right:16,bottom:140,display:"flex",alignItems:"flex-end",gap:8,cursor:"pointer",zIndex:9999},
  fabCircle:{
    width:56,height:56,borderRadius:"50%",
    background:SCHEDULE_BTN_GRADIENT,
    border:"none",boxShadow:"0 6px 18px rgba(0,0,0,.25)",
    display:"grid",placeItems:"center",fontWeight:700,color:"#1b1b1b"
  },
  speechBubble:{maxWidth:180,background:"#fff",boxShadow:"0 10px 24px rgba(0,0,0,.15)",borderRadius:14,padding:"10px 12px",
    position:"relative",border:"1px solid rgba(0,0,0,.06)"},
  speechText:{fontSize:12,fontWeight:600,color:"#1b1b1b",lineHeight:1.3},
  speechArrow:{
    position:"absolute",
    right:-6,
    bottom:10,
    width:0,
    height:0,
    borderTop:"6px solid transparent",
    borderBottom:"6px solid transparent",
    borderLeft:"6px solid #fff",
    filter:"drop-shadow(0 2px 2px rgba(0,0,0,.1))"
  },
  chatPanelWrap:{position:"fixed",right:16,bottom:210,zIndex:10000,maxWidth:300,width:"calc(100% - 32px)"},
  chatPanel:{background:"#fff",borderRadius:20,boxShadow:"0 24px 64px rgba(0,0,0,.4)",border:"1px solid rgba(0,0,0,.06)",maxHeight:"40vh",display:"flex",flexDirection:"column",overflow:"hidden"},
  chatHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"12px 12px 10px",borderBottom:"1px solid rgba(0,0,0,.06)",
    background:"linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))"},
  chatHeaderLeft:{display:"flex",alignItems:"center",gap:8},
  robotIconLarge:{fontSize:20,lineHeight:1},
  chatTitle:{fontSize:14,fontWeight:700,color:"#1b1b1b"},
  closeBtn:{background:"rgba(0,0,0,0.08)",border:"none",borderRadius:8,width:28,height:28,fontSize:16,fontWeight:600,lineHeight:1,color:"#1b1b1b",
    display:"grid",placeItems:"center",cursor:"pointer"},
  chatBody:{padding:12,fontSize:13.5,lineHeight:1.4,color:"#1b1b1b",whiteSpace:"pre-wrap",overflowY:"auto"},
};

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statEmoji}>{icon}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
    </div>
  );
}

function ChipStatSquare({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div style={s.chipSquare}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontSize: 12, opacity: 0.7, textAlign: "center", whiteSpace: "normal", lineHeight: 1.2 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", whiteSpace: "normal", lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Питание</span>
          <span style={s.credits}>План отсутствует</span>
        </div>
        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Собери рацион на 3 дня</div>
        <div style={s.heroTitle}>Персональный план питания</div>
        <div style={s.heroSubtitle}>Нажми кнопку ниже, чтобы мы рассчитали меню под твои цели</div>
        <button className="soft-glow" style={s.primaryBtn} onClick={onGenerate}>
          Сгенерировать план питания
        </button>
      </section>
    </div>
  );
}

function GenerationView({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Питание</span>
          <span style={s.credits}>AI работает</span>
        </div>
        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>Подбираю блюда и проверяю КБЖУ</div>
        <div style={s.heroTitle}>Готовлю план питания…</div>
        <div style={{ marginTop: 18 }}>
          <div style={s.progressWrap}>
            <div style={{ ...s.progressBar, width: `${Math.min(100, Math.round(progress))}%` }} />
          </div>
          <div style={s.progressLabel}>{Math.min(100, Math.round(progress))}%</div>
        </div>
        <div style={s.heroSubtitle}>{stage}</div>
        <div style={{ ...s.heroSubtitle, marginTop: 6 }}>Можно закрыть экран — генерация продолжится.</div>
      </section>
    </div>
  );
}

function SkeletonLine({ w = 100 }: { w?: number }) {
  return (
    <div style={{
      height:10,width:`${w}%`,borderRadius:6,
      background:"linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%)",
      backgroundSize:"400% 100%",animation:"shimmer 1.4s ease-in-out infinite",marginTop:8
    }} />
  );
}
