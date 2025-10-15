import { Router } from "express";
import { q } from "./db.js";
import { requireAuth } from "./auth.js";
import OpenAI from "openai";
export const plan = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

plan.post("/plan/generate", requireAuth, async (req:any,res)=>{
  const uid = req.user.uid;
  const [onb] = await q<{data:any}>(`select data from onboardings where user_id=$1 order by created_at desc limit 1`, [uid]);
  const hist = await q<{plan:any,result:any}>(`select plan,result from workouts where user_id=$1 order by created_at desc limit 5`, [uid]);
  // Мини-шаблон без ИИ, чтобы сразу работало:
  const base = (onb?.data?.experience || "novice").toString();
  const p = {
    title: "Сессия А",
    items: [
      { name:"Присед со штангой", sets: base==="novice"?3:5, reps:"6-8" },
      { name:"Жим лежа", sets: 4, reps:"6-8" },
      { name:"Тяга горизонтальная", sets: 4, reps:"8-10" }
    ],
    cues: "Разминка 10 минут. Техника в приоритете."
  };
  // Сохранить как план-тренировку
  const rows = await q<{id:string}>(`insert into workouts(user_id, plan) values($1,$2) returning id`, [uid, p]);
  res.json({ workoutId: rows[0].id, plan: p });
});

// при желании подключишь OpenAI — просто замени генерацию p на вызов модели