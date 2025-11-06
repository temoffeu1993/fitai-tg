// api/src/config.ts
import dotenv from "dotenv";
dotenv.config();

console.log("RAW ENV:", process.env.DATABASE_URL);

interface Config {
  port: number;
  botToken: string;
  jwtSecret: string;
  databaseUrl: string;
  corsOrigin: string[];
  openaiApiKey?: string;
  nodeEnv: "development" | "production" | "test";
  telegramAuthExpiry: number;
}

function validateEnv(): Config {
  const required = ["BOT_TOKEN", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const databaseUrl =
    process.env.DATABASE_URL || process.env.RENDER_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or RENDER_DATABASE_URL must be set");
  }

  return {
    port: parseInt(process.env.PORT || "8080", 10),
    botToken: process.env.BOT_TOKEN!,
    jwtSecret: process.env.JWT_SECRET!,
    databaseUrl,
    corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    openaiApiKey: process.env.OPENAI_API_KEY,
    nodeEnv: (process.env.NODE_ENV || "development") as Config["nodeEnv"],
    telegramAuthExpiry: 86400,
  };
}

export const config = validateEnv();