import { useEffect, useState } from "react";
import Dashboard from "./screens/Dashboard";
import Workouts from "./screens/Workouts";
import Nutrition from "./screens/Nutrition";
import NavBar from "./components/NavBar";

type Tab = "home" | "workouts" | "nutrition";

export default function App(){
  const [tab,setTab] = useState<Tab>("home");
  // авто-выбор таба из hash
  useEffect(()=>{ const t = (location.hash.replace("#","") as Tab)||"home"; setTab(t); },[]);
  useEffect(()=>{ location.hash = tab; },[tab]);

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:"#fff"}}>
      <div style={{flex:1,padding:"16px 16px 72px"}}>
        {tab==="home" && <Dashboard onGenerateClick={()=>setTab("workouts")} />}
        {tab==="workouts" && <Workouts />}
        {tab==="nutrition" && <Nutrition />}
      </div>
      <NavBar tab={tab} onChange={setTab}/>
    </div>
  );
}