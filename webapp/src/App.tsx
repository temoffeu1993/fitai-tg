import { useEffect, useState } from "react";
import Dashboard from "./screens/dashboard";
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
}// ... existing code ...
import OnboardingScreens from "./OnboardingScreens";
// ... existing code ...

export default function App(){
  // ... existing code ...

  function saveOnb() {
    setLoading(true);
    saveOnboarding(token, onboarding || {})
      .then(() => getSummary(token))
      .then(() => setScreen("summary"))
      .finally(() => setLoading(false));
  }

  // ... existing code ...

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:16,fontFamily:"system-ui"}}>
      {screen==="onb" && (
        <OnboardingScreens onFinish={saveOnb} loading={loading} />
      )}

      {screen==="summary" && <>
// ... existing code ...