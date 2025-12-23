// api/src/index.ts
import { config } from "./config.js"; // <- прогревает env и config
console.log("DEBUG_AI =", process.env.DEBUG_AI);

import express from "express";
import cors from "cors";

import authRouter, { requireAuth } from "./auth.js";
import { onboarding } from "./onboarding.js";
// import planRouter from "./plan.js"; // ❌ СТАРАЯ ИИ-СИСТЕМА ОТКЛЮЧЕНА
import { workout } from "./workout.js";
import { nutrition } from "./nutrition.js";
import { schedule } from "./schedule.js";
import { progress } from "./progress.js";
import { profile as profileRouter } from "./profile.js";
import { schemes } from "./schemes.js";
import { workoutGeneration } from "./workoutGeneration.js"; // 🔥 НОВАЯ детерминированная генерация
import { workoutTest } from "./workoutTest.js"; // 🔥 НОВОЕ: тестовый эндпоинт
import { scientificWorkoutTest } from "./scientificWorkoutTest.js"; // 🔥 НАУЧНАЯ система
import { getSubscriptionStatus } from "./subscription.js";
import { asyncHandler, errorHandler } from "./middleware/errorHandler.js";
import { startProgressionJobWorker } from "./progressionJobs.js";
import { startCoachJobWorker } from "./coachJobs.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true, credentials: true }));

// Быстрый health/ping без БД
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use(requireAuth, onboarding);
app.use(requireAuth, profileRouter);
app.use(requireAuth, schemes);
// ❌ СТАРЫЙ /plan ОТКЛЮЧЕН - используем детерминированную систему
// app.use("/plan", requireAuth, planRouter);
app.use(
  "/plan",
  requireAuth,
  (req, res, next) => {
    console.log("HIT /plan", req.method, req.url);
    next();
  },
  workoutGeneration // 🔥 ИСПОЛЬЗУЕМ НОВУЮ СИСТЕМУ вместо старой
);
app.use("/workout", requireAuth, workout);
app.use("/api/workout", requireAuth, workoutGeneration); // 🔥 НОВАЯ детерминированная генерация
app.use("/api/nutrition", requireAuth, nutrition);
app.use("/api", requireAuth, schedule);
app.use("/api/progress", requireAuth, progress);
app.use("/api/workout-test", requireAuth, workoutTest); // 🔥 НОВОЕ: тест генерации
app.use("/api/scientific-test", requireAuth, scientificWorkoutTest); // 🔥 НАУЧНАЯ система

// подписка — публичный статус
app.get(
  "/subscription/status",
  requireAuth,
  asyncHandler(async (req: any, res: express.Response) => {
    const userId = req.user?.uid;
    const status = await getSubscriptionStatus(userId);
    res.json(status);
  })
);

// error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log("api:" + config.port);
  console.log("=== API INDEX LOADED ===");
});

// Background worker: догоняет прогрессию из outbox очереди
startProgressionJobWorker();
// Background worker: генерирует "тренерский" фидбек (best-effort)
startCoachJobWorker();

// api/src/index.ts (после app.listen)
import { q } from "./db.js";

(async () => {
  try {
    const info = await q(`SELECT current_database() db, inet_server_addr() host, inet_server_port() port`);
    console.log("DB whoami:", info[0]);  // <-- увидишь порт
  } catch (e) {
    console.error("DB whoami failed:", (e as Error)?.message || e);
  }
})();
