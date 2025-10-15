import { Router } from "express";
import { q } from "./db.js";
import { requireAuth } from "./auth.js";
export const workout = Router();

workout.post("/workout/complete", requireAuth, async (req:any,res)=>{
  const { workoutId, result } = req.body||{};
  if(!workoutId || !result) return res.status(400).json({error:"no_payload"});
  await q(`update workouts set result=$2 where id=$1 and user_id=$3`, [workoutId, result, req.user.uid]);
  res.json({ ok:true });
});

workout.get("/dashboard", requireAuth, async (req:any,res)=>{
  const last = await q<{id:string,plan:any,result:any,created_at:string}>(`select id,plan,result,created_at from workouts where user_id=$1 order by created_at desc limit 5`, [req.user.uid]);
  const [onb] = await q<{data:any}>(`select data from onboardings where user_id=$1 order by created_at desc limit 1`, [req.user.uid]);
  res.json({ onboarding: onb?.data||null, workouts: last });
});