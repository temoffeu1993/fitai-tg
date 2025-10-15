import "dotenv/config";
import express from "express";
import cors from "cors";
import { auth } from "./auth.js";
import { onboarding } from "./onboarding.js";
import { plan } from "./plan.js";
import { workout } from "./workout.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));

app.get("/health", (_,res)=>res.json({ok:true}));
app.use(auth);
app.use(onboarding);
app.use(plan);
app.use(workout);

app.listen(process.env.PORT||8080, ()=>console.log("api:"+process.env.PORT));