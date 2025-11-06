// api/src/index.ts
import { config } from "./config.js"; // <- прогревает env и config
console.log("DEBUG_AI =", process.env.DEBUG_AI);

import express from "express";
import cors from "cors";

import authRouter from "./auth.js";
import { onboarding } from "./onboarding.js";
import planRouter from "./plan.js";
import { workout } from "./workout.js";
import { nutrition } from "./nutrition.js";
import { schedule } from "./schedule.js";
import { progress } from "./progress.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true, credentials: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use(onboarding);
app.use("/plan", (req, res, next) => {
  console.log("HIT /plan", req.method, req.url);
  next();
}, planRouter);
app.use("/workout", workout);
app.use("/api/nutrition", nutrition);
app.use("/api", schedule);
app.use("/api/progress", progress);

// error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const code = err.status || 500;
  res.status(code).json({ error: err.code || "internal_error", message: err.message || "Internal error" });
});

app.listen(config.port, () => {
  console.log("api:" + config.port);
  console.log("=== API INDEX LOADED ===");
});

// api/src/index.ts (после app.listen)
import { q } from "./db.js";

(async () => {
  const info = await q(`SELECT current_database() db, inet_server_addr() host, inet_server_port() port`);
  console.log("DB whoami:", info[0]);  // <-- увидишь порт
})();
