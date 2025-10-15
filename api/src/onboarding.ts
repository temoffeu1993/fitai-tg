import { Router } from "express";
import { q } from "./db.js";
import { requireAuth } from "./auth.js";
export const onboarding = Router();

onboarding.post("/onboarding/save", requireAuth, async (req:any,res)=>{
  const data = req.body?.data;
  if(!data) return res.status(400).json({error:"no_data"});
  await q(`insert into onboardings(user_id, data) values($1,$2)`, [req.user.uid, data]);
  res.json({ ok:true });
});

onboarding.get("/onboarding/summary", requireAuth, async (req:any,res)=>{
  const rows = await q<{data:any}>(`select data from onboardings where user_id=$1 order by created_at desc limit 1`, [req.user.uid]);
  const d = rows[0]?.data || {};
  const summary = {
    профиль: `${d.age||"?"} лет, ${d.sex||"?"}, ${d.height||"?"}см, ${d.weight||"?"}кг`,
    цель: d.goal||"?",
    опыт: d.experience||"?",
    частота: `${d.freq||"?"}×/нед, ${d.duration||"?"} мин`,
    локация: d.location||"?",
    оборудование: (d.equipment||[]).join(", ")||"—",
    ограничения: (d.limitations||[]).join(", ")||"нет"
  };
  res.json({ summary });
});