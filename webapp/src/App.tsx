import { useEffect, useState } from "react";
import { useApp } from "./store";
import { tgAuth, saveOnboarding, getSummary, genPlan, completeWorkout } from "./api";
import { Section, Btn, Input, Chips } from "./ui";

declare global { interface Window { Telegram:any } }

export default function App(){
  const tg = (window as any).Telegram?.WebApp;
  const { token, setToken, onboarding, setOnb, plan, setPlan, workoutId } = useApp();
  const [screen,setScreen] = useState<"onb"|"summary"|"dash"|"plan"|"session">("onb");
  const [loading,setLoading] = useState(false);

  useEffect(()=>{ tg?.ready(); tg?.expand();
    (async()=>{ const a = await tgAuth(tg?.initData||""); setToken(a.token); })();
  },[]);

  if(!token) return <div style={{padding:16}}>Авторизация…</div>;

  // --- Онбординг шаги (упрощённо в одном экране) ---
  function saveOnb(){
    setLoading(true);
    saveOnboarding(token, onboarding||{}).then(()=>getSummary(token)).then(()=>setScreen("summary")).finally(()=>setLoading(false));
  }

  async function requestPlan(){
    setLoading(true);
    const r = await genPlan(token);
    setPlan(r.workoutId, r.plan);
    setScreen("plan"); setLoading(false);
  }

  async function finishSession(){
    setLoading(true);
    const result = { items: plan?.items?.map(it=>({ name:it.name, sets:it.sets, repsDone:[10,9,8].slice(0,it.sets), weight: null })) };
    await completeWorkout(token, workoutId!, result);
    setScreen("dash"); setLoading(false);
  }

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:16,fontFamily:"system-ui"}}>
      {screen==="onb" && <>
        <h3>Онбординг</h3>
        <Section title="Профиль">
          <Input placeholder="Возраст" type="number" value={onboarding?.age} onChange={v=>setOnb({age:Number(v)})}/>
          <Chips options={["m","f"]} value={[onboarding?.sex||""]} onChange={v=>setOnb({sex:(v[0] as any)})}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <Input placeholder="Рост, см" type="number" value={onboarding?.height} onChange={v=>setOnb({height:Number(v)})}/>
            <Input placeholder="Вес, кг" type="number" value={onboarding?.weight} onChange={v=>setOnb({weight:Number(v)})}/>
          </div>
        </Section>
        <Section title="Цели и опыт">
          <Input placeholder="Цель (набор/сжигание/сила…)" value={onboarding?.goal} onChange={v=>setOnb({goal:v})}/>
          <Chips options={["novice","intermediate","advanced"]} value={[onboarding?.experience||""]} onChange={v=>setOnb({experience:(v[0] as any)})}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <Input placeholder="Тренировок в неделю" type="number" value={onboarding?.freq} onChange={v=>setOnb({freq:Number(v)})}/>
            <Input placeholder="Длительность, мин" type="number" value={onboarding?.duration} onChange={v=>setOnb({duration:Number(v)})}/>
          </div>
        </Section>
        <Section title="Локация и оборудование">
          <Input placeholder="Локация (зал/дом/улица)" value={onboarding?.location} onChange={v=>setOnb({location:v})}/>
          <Chips options={["штанга","гантели","тренажёры","турник","эспандер","нет"]} value={onboarding?.equipment||[]} onChange={v=>setOnb({equipment:v})}/>
          <Input placeholder="Ограничения через запятую" value={(onboarding?.limitations||[]).join(",")} onChange={v=>setOnb({limitations:v.split(",").map(s=>s.trim()).filter(Boolean)})}/>
        </Section>
        <Btn onClick={saveOnb}>{loading?"Сохранение…":"Сохранить и продолжить"}</Btn>
      </>}

      {screen==="summary" && <>
        <h3>Сводка онбординга</h3>
        <p>Профиль и цели сохранены. Всё верно?</p>
        <Btn onClick={()=>setScreen("dash")}>Перейти на дашборд</Btn>
      </>}

      {screen==="dash" && <>
        <h3>Дашборд</h3>
        <Btn onClick={requestPlan}>{loading?"Генерация…":"Новая тренировка"}</Btn>
      </>}

      {screen==="plan" && plan && <>
        <h3>{plan.title}</h3>
        <ul>{plan.items.map((it,i)=><li key={i}>{it.name}: {it.sets}×{it.reps}</li>)}</ul>
        <Btn onClick={()=>setScreen("session")}>Начать</Btn>
      </>}

      {screen==="session" && plan && <>
        <h3>Сессия</h3>
        <p>Внеси фактические повторы и веса. Для демо зашью авто-значения.</p>
        <Btn onClick={finishSession}>{loading?"Сохранение…":"Сохранить тренировку"}</Btn>
      </>}
    </div>
  );
}