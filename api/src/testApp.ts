// api/src/testApp.ts — Express app for testing (no listen, no background workers)
import express from "express";
import cors from "cors";
import authRouter, { requireAuth } from "./auth.js";
import { onboarding } from "./onboarding.js";
import { workout } from "./workout.js";
import { schedule } from "./schedule.js";
import { progress } from "./progress.js";
import { profile as profileRouter } from "./profile.js";
import { schemes } from "./schemes.js";
import { workoutGeneration } from "./workoutGeneration.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(cors({ origin: true, credentials: true }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);
  app.use(requireAuth, onboarding);
  app.use(requireAuth, profileRouter);
  app.use(requireAuth, schemes);
  app.use("/plan", requireAuth, workoutGeneration);
  app.use("/workout", requireAuth, workout);
  app.use("/api/workout", requireAuth, workoutGeneration);
  app.use("/api", requireAuth, schedule);
  app.use("/api/progress", requireAuth, progress);
  app.use(errorHandler);

  return app;
}
