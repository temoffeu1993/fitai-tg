const API = import.meta.env.VITE_API_URL;

export async function tgAuth(initData:string){
  const r = await fetch(API+"/auth/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData})});
  if(!r.ok) throw new Error("auth_fail");
  return r.json();
}
export async function saveOnboarding(token:string, data:any){
  const r = await fetch(API+"/onboarding/save",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({data})});
  if(!r.ok) throw new Error("onb_fail");
  return r.json();
}
export async function getSummary(token:string){
  const r = await fetch(API+"/onboarding/summary",{headers:{Authorization:"Bearer "+token}});
  return r.json();
}
export async function genPlan(token:string){
  const r = await fetch(API+"/plan/generate",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({})});
  return r.json(); // {workoutId, plan}
}
export async function completeWorkout(token:string, workoutId:string, result:any){
  const r = await fetch(API+"/workout/complete",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({workoutId,result})});
  return r.json();
}
export async function getDashboard(token:string){
  const r = await fetch(API+"/dashboard",{headers:{Authorization:"Bearer "+token}});
  return r.json();
}