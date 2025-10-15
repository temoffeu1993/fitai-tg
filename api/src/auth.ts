import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { q } from "./db.js";
export const auth = Router();

function verifyInitData(initData: string, botToken: string) {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash")!;
  p.delete("hash");
  const str = Array.from(p.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(str).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

auth.post("/auth/telegram", async (req,res)=>{
  const { initData } = req.body||{};
  if(!initData) return res.status(400).json({error:"no_initData"});
  if(!verifyInitData(initData, process.env.BOT_TOKEN!)) return res.status(401).json({error:"bad_signature"});
  const user = JSON.parse(new URLSearchParams(initData).get("user")!);
  const rows = await q<{id:string}>(`insert into users(tg_id,first_name,username)
    values($1,$2,$3) on conflict (tg_id) do update set first_name=excluded.first_name, username=excluded.username
    returning id`, [user.id, user.first_name||null, user.username||null]);
  const uid = rows[0].id;
  const token = jwt.sign({ uid, tg:user.id }, process.env.JWT_SECRET!, { expiresIn: "30d" });
  res.json({ token, profile: { id: uid, tg_id: user.id, first_name: user.first_name, username: user.username } });
});

export function requireAuth(req:any,res:any,next:any){
  const h = req.headers.authorization||"";
  const t = h.startsWith("Bearer ")?h.slice(7):null;
  if(!t) return res.status(401).json({error:"no_token"});
  try { req.user = jwt.verify(t, process.env.JWT_SECRET!); next(); }
  catch{ return res.status(401).json({error:"bad_token"}); }
}