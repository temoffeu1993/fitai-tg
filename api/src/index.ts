// api/src/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./auth";     // <-- без require
import { onboarding } from "./onboarding";
import { plan } from "./plan";
import { workout } from "./workout";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN, // https://fitai-web-c8z0.onrender.com
    credentials: false,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);  // POST /auth/telegram
app.use(onboarding);
app.use(plan);
app.use(workout);

app.listen(process.env.PORT || 8080, () =>
  console.log("api:" + (process.env.PORT || 8080))
);