import { useEffect, useState } from "react";

export default function Dashboard({onGenerateClick}:{onGenerateClick:()=>void}){
  const [name,setName] = useState<string|undefined>();
  useEffect(()=>{
    const profile = JSON.parse(localStorage.getItem("profile")||"null");
    setName(profile?.first_name || profile?.username || "Гость");
  },[]);
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <h2 style={{margin:"8px 0"}}>Привет, {name}</h2>
      <p style={{color:"#666",marginBottom:24}}>Готов к следующей сессии?</p>
      <button onClick={onGenerateClick}
        style={{display:"block",width:"100%",maxWidth:420,margin:"24px auto",
        padding:"16px 20px",borderRadius:16,border:"none",
        background:"#0088cc",color:"#fff",fontSize:18}}>
        Сгенерировать тренировку
      </button>
    </div>
  );
}