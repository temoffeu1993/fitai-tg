// webapp/src/screens/Nutrition.tsx
// Экран недельного плана питания. UX/стиль выровнен с PlanOne.
import { useEffect, useMemo, useState } from "react";

type FoodItem = {
  food: string; qty: number; unit: string;
  kcal?: number; protein_g?: number; fat_g?: number; carbs_g?: number;
  prep?: string; notes?: string;
};
type Meal = {
  title: string; time?: string;
  target_kcal?: number; target_protein_g?: number; target_fat_g?: number; target_carbs_g?: number;
  items: FoodItem[];
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

const NUTRITION_CACHE_KEY = "nutrition_week_cache_v1";

export default function Nutrition() {
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(0);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(1);
  const [showNotes, setShowNotes] = useState(false);

  const steps = useMemo(
    () => ["Анализ онбординга", "Расчёт КБЖУ", "Подбор рецептов", "Баланс дней", "Готовим неделю"],
    []
  );

  useEffect(() => {
    let mounted = true;
    const t = setInterval(() => setStage((s) => (s < steps.length - 1 ? s + 1 : s)), 1200);

    (async () => {
      try {
        // cache try
        const raw = localStorage.getItem(NUTRITION_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.plan) {
            setPlan(cached.plan);
            setLoading(false);
            clearInterval(t);
            return;
          }
        }

 // БЕЗОПАСНЫЙ fetch и генерация
let p: any = null;

// 1) пробуем получить текущую неделю
const r0 = await fetch("/api/nutrition/current-week");
if (r0.ok) {
  const j0 = await readJsonSafe(r0);
  p = j0?.plan || null;
} else if (r0.status === 404) {
  // плана нет — это нормально, просто генерим ниже
  p = null;
} else {
  const t = await r0.text().catch(() => "");
  throw new Error(`current-week ${r0.status}: ${t}`);
}

// 2) если нет — генерим
if (!p) {
  const r1 = await fetch("/api/nutrition/generate-week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r1.ok) {
    const t = await r1.text().catch(() => "");
    throw new Error(`generate-week ${r1.status}: ${t}`);
  }
  const j1 = await readJsonSafe(r1);
  p = j1?.plan;
}

if (!p) throw new Error("План не получен");
        normalize(p);
        setPlan(p);
        try { localStorage.setItem(NUTRITION_CACHE_KEY, JSON.stringify({ plan: p, ts: Date.now() })); } catch {}

      } catch (e: any) {
        console.error(e);
        setError("Не удалось получить план питания");
      } finally {
        if (mounted) setLoading(false);
        clearInterval(t);
      }
    })();

    return () => { mounted = false; clearInterval(t); };
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

  if (loading) return <Loader stage={stage} steps={steps} label="Генерирую недельный план питания" />;
  if (error) return <ErrorView msg={error} />;

  if (!plan) return <div style={s.page}><section style={s.blockWhite}><h3>План отсутствует</h3></section></div>;

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Неделя</span>
          <span style={s.credits}>План готов</span>
        </div>

        <div style={{ marginTop: 8, opacity: .9, fontSize: 13 }}>{weekLabel}</div>
        <div style={s.heroTitle}>{plan.name || "Питание на неделю"}</div>
        <div style={s.heroSubtitle}>Сбалансированные приёмы пищи под твою цель</div>

        {totals && (
          <div style={s.heroFooter}>
            <Stat icon="🔥" label="Ккал/день" value={String(totals.kcal)} />
            <Stat icon="🥚" label="Белки" value={`${totals.protein} г`} />
            <Stat icon="🍚" label="У/Ж" value={`${totals.carbs}/${totals.fat} г`} />
          </div>
        )}

        <button
          className="soft-glow"
          style={s.primaryBtn}
          onClick={async () => {
  try {
    localStorage.removeItem(NUTRITION_CACHE_KEY);
    setLoading(true);
    setStage(0);

    const res = await fetch("/api/nutrition/generate-week", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
if (!res.ok) {
  const t = await res.text();
  throw new Error(`generate-week ${res.status}: ${t}`);
}
const j = await readJsonSafe(res);
    const np = j?.plan;
    if (!np) throw new Error("no plan");

    normalize(np);
    setPlan(np);
    localStorage.setItem(NUTRITION_CACHE_KEY, JSON.stringify({ plan: np, ts: Date.now() }));
  } catch {
    setError("Не удалось регенерировать план");
  } finally {
    setLoading(false);
  }
}}
        >
          Сгенерировать заново
        </button>
      </section>

      {/* Дни недели */}
      {(plan.days || []).map((d) => (
        <section key={d.day_index} style={s.block}>
          <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
            <button
              style={{ ...ux.cardHeader, background: uxColors.headerBg, width: "100%", border: "none", textAlign: "left", cursor: "pointer" }}
              onClick={() => setOpenDay(openDay === d.day_index ? null : d.day_index)}
            >
              <div style={{ ...ux.iconInline }}>🍽️</div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ux.cardTitleRow}>
                  <div style={ux.cardTitle}>{weekdayTitle(d)}</div>
                  <div style={{
                    ...ux.caretWrap,
                    transform: openDay === d.day_index ? "rotate(180deg)" : "rotate(0deg)",
                  }}>
                    <div style={ux.caretInner} />
                  </div>
                </div>
                {(() => {
                  const dt = parseISODate(d.date);
                  return <div style={ux.cardHint}>
                    {dt ? dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }) : `День ${d.day_index}`}
                  </div>;
                })()}
              </div>
            </button>

            {openDay === d.day_index && (
              <div style={{ padding: 10 }}>
                {(d.meals || []).map((m, idx) => (
                  <div key={idx} style={row.wrap}>
                    <div style={row.left}>
                      <div style={row.name}>{m.title}{m.time ? ` • ${m.time}` : ""}</div>
                      <div style={row.cues}>
                        {fmtTargets(m)}
                      </div>
                      {/* Items */}
                      <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                        {(m.items || []).map((it, k) => (
                          <div key={k} style={food.line}>
                            <div style={food.left}>
                              <div style={food.bullet}>•</div>
                              <div style={food.foodName}>{it.food}</div>
                              <div style={food.qty}>{`${num(it.qty)} ${it.unit}`}</div>
                            </div>
                            <div style={food.right}>
                              {typeof it.kcal === "number" ? <span>{it.kcal} ккал</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                      {m.notes ? <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>{m.notes}</div> : null}
                    </div>
                  </div>
                ))}
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

async function readJsonSafe(res: Response): Promise<any|null> {
  try { return await res.json(); } catch { return null; }
}

/* ---------------- utils ---------------- */
function normalize(p: any) {
  // ничего не ломаем: ожидаем структуру как из API
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
}

function parseISODate(s?: string): Date | null {
  if (!s) return null;
  // поддержка "YYYY-MM-DD", "YYYY/MM/DD", "YYYY-MM-DDTHH:MM:SSZ"
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

function fmtTargets(m: Meal) {
  const t = [
    typeof m.target_kcal === "number" ? `${m.target_kcal} ккал` : null,
    typeof m.target_protein_g === "number" ? `${m.target_protein_g} г белка` : null,
    typeof m.target_carbs_g === "number" && typeof m.target_fat_g === "number" ? `${m.target_carbs_g}/${m.target_fat_g} г У/Ж` : null,
  ].filter(Boolean).join(" • ");
  return t || "Сбалансировано";
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
        <div style={s.loadWrap}><Spinner /><div style={{ marginTop: 8, fontSize: 13, opacity: .9 }}>Учитываю цели и ограничения</div></div>
        <div style={s.heroFooter}>
          <Stat icon="🧠" label="Аналитика" value="в процессе" />
          <Stat icon="🧩" label="Подбор" value="готовится" />
          <Stat icon="⚡" label="Прогресс" value={`${Math.min(20 + stage * 20, 95)}%`} />
        </div>
      </section>
      <section style={s.blockWhite}><SkeletonLine /><SkeletonLine w={80} /><SkeletonLine w={60} /></section>
    </div>
  );
}
function ErrorView({ msg }: { msg: string }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <section style={s.blockWhite}>
        <h3 style={{ marginTop: 0 }}>{msg}</h3>
        <p style={{ marginTop: 6, color: "#555" }}>Повтори попытку позже.</p>
        <button style={s.rowBtn} onClick={() => window.location.reload()}>Обновить</button>
      </section>
    </div>
  );
}

/* ---------------- shared UI from PlanOne style ---------------- */
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

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const s: Record<string, React.CSSProperties> = {
  page:{maxWidth:720,margin:"0 auto",padding:"16px",fontFamily:"system-ui,-apple-system,'Inter','Roboto',Segoe UI"},
  heroCard:{position:"relative",padding:16,borderRadius:20,boxShadow:cardShadow,
    background:"linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color:"#fff",overflow:"hidden"},
  heroHeader:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  pill:{background:"rgba(255,255,255,.2)",padding:"6px 10px",borderRadius:999,fontSize:12,backdropFilter:"blur(6px)"},
  credits:{background:"rgba(255,255,255,.2)",padding:"6px 10px",borderRadius:999,fontSize:12,backdropFilter:"blur(6px)"},
  heroTitle:{fontSize:22,fontWeight:800,marginTop:6}, heroSubtitle:{opacity:.92,marginTop:2},
  primaryBtn:{marginTop:14,width:"100%",border:"none",borderRadius:14,padding:"14px 16px",fontSize:16,fontWeight:700,
    color:"#1b1b1b",background:"linear-gradient(135deg,#ffe680,#ffb36b)",boxShadow:"0 6px 18px rgba(0,0,0,.15)",cursor:"pointer"},
  heroFooter:{marginTop:10,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8},
  stat:{background:"rgba(255,255,255,.15)",borderRadius:12,padding:10,textAlign:"center",backdropFilter:"blur(6px)",fontWeight:600},
  block:{marginTop:16,padding:0,borderRadius:16,background:"transparent",boxShadow:"none"},
  blockWhite:{marginTop:16,padding:14,borderRadius:16,background:"#fff",boxShadow:cardShadow},
  rowBtn:{border:"none",padding:"12px 14px",borderRadius:12,fontWeight:700,color:"#fff",
    background:"linear-gradient(135deg,#6a8dff,#8a64ff)",cursor:"pointer",marginTop:8},
  loadWrap:{marginTop:10,display:"grid",justifyItems:"center"},
};
const uxColors = { headerBg:"linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))" };
const ux: Record<string, any> = {
  card:{borderRadius:18,border:"none",boxShadow:"0 8px 24px rgba(0,0,0,.06)",overflow:"hidden",background:"#fff",position:"relative"},
  cardHeader:{display:"grid",gridTemplateColumns:"24px 1fr",alignItems:"center",gap:10,padding:10,borderBottom:"1px solid rgba(0,0,0,.06)"},
  iconInline:{width:24,height:24,display:"grid",placeItems:"center",fontSize:18},
  cardTitleRow:{display:"flex",alignItems:"center",gap:6,justifyContent:"space-between"},
  cardTitle:{fontSize:15,fontWeight:750,color:"#1b1b1b",lineHeight:1.2},
  cardHint:{fontSize:11,color:"#2b2b2b",opacity:.85},
  caretWrap:{width:24,height:24,borderRadius:8,background:"rgba(139,92,246,.12)",boxShadow:"inset 0 0 0 1px rgba(0,0,0,.05)",
    display:"grid",placeItems:"center",transition:"transform .18s"},
  caretInner:{width:0,height:0,borderLeft:"5px solid transparent",borderRight:"5px solid transparent",borderTop:"6px solid #4a3a7a"},
};
const row: Record<string, React.CSSProperties> = {
  wrap:{display:"grid",gridTemplateColumns:"1fr",gap:8,padding:"8px 10px",background:"#fff",borderRadius:10,boxShadow:"inset 0 0 0 1px rgba(0,0,0,.04)"},
  left:{display:"grid",gap:4,minWidth:0},
  name:{fontSize:13.5,fontWeight:650,color:"#111",lineHeight:1.15,whiteSpace:"normal"},
  cues:{fontSize:11,color:"#555"},
};
const food: Record<string, React.CSSProperties> = {
  line:{display:"grid",gridTemplateColumns:"1fr auto",alignItems:"center",gap:6,padding:"6px 8px",borderRadius:8,background:"rgba(139,92,246,.06)"},
  left:{display:"flex",alignItems:"center",gap:6},
  bullet:{fontSize:14,color:"#4a3a7a"},
  foodName:{fontSize:12.5,fontWeight:650,color:"#1b1b1b"},
  qty:{fontSize:12,color:"#555"},
  right:{fontSize:12,fontWeight:650,color:"#1b1b1b"},
};

const notesStyles: Record<string, React.CSSProperties> = {
  fabWrap:{position:"fixed",right:16,bottom:88,display:"flex",alignItems:"flex-end",gap:8,cursor:"pointer",zIndex:9999},
  fabCircle:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#ffe680,#ffb36b)",boxShadow:"0 10px 24px rgba(0,0,0,.2)",
    display:"grid",placeItems:"center",fontWeight:700,color:"#1b1b1b"},
  speechBubble:{maxWidth:180,background:"#fff",boxShadow:"0 10px 24px rgba(0,0,0,.15)",borderRadius:14,padding:"10px 12px",
    position:"relative",border:"1px solid rgba(0,0,0,.06)"},
  speechText:{fontSize:12,fontWeight:600,color:"#1b1b1b",lineHeight:1.3},
  speechArrow:{position:"absolute",right:-6,bottom:10,width:0,height:0,borderTop:"6px solid transparent",borderBottom:"6px solid transparent",borderLeft:"6px solid #fff",
    filter:"drop-shadow(0 2px 2px rgba(0,0,0,.1))"},
  chatPanelWrap:{position:"fixed",right:16,bottom:156,zIndex:10000,maxWidth:300,width:"calc(100% - 32px)"},
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
  return (<div style={s.stat}><div style={{ fontSize: 20 }}>{icon}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>{label}</div><div style={{ fontWeight: 700 }}>{value}</div></div>);
}
function SkeletonLine({ w = 100 }: { w?: number }) {
  return (<div style={{height:10,width:`${w}%`,borderRadius:6,background:"linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%)",backgroundSize:"400% 100%",animation:"shimmer 1.4s ease-in-out infinite",marginTop:8}} />);
}
