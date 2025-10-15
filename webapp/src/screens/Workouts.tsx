import { useEffect, useState } from "react";

export default function Workouts(){
  const [loading,setLoading]=useState(false);
  const [plan,setPlan]=useState<any|null>(null);
  const token = localStorage.getItem("token")||"";

  async function generate(){
    setLoading(true);
    const r = await fetch(`${import.meta.env.VITE_API_URL}/plan/generate`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body: JSON.stringify({})});
    const data = await r.json();
    setPlan(data.plan); setLoading(false);
  }

  useEffect(()=>{ /* можно подгружать последние тренировки из /dashboard */ },[]);

  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <h2>Мои тренировки</h2>
      {!plan && <button onClick={generate} disabled={loading}
        style={{padding:"12px 16px",borderRadius:12,border:"1px solid #ddd"}}>
        {loading?"Генерация…":"Сгенерировать план"}
      </button>}
      {plan && <>
        <h3 style={{marginTop:16}}>{plan.title}</h3>
        <ul style={{paddingLeft:16}}>
          {plan.items.map((it:any,i:number)=>(<li key={i}>{it.name}: {it.sets}×{it.reps}</li>))}
        </ul>
      </>}
    </div>
  );
}