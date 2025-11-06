// api/src/auth.ts
import { Router, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { q } from "./db.js";               // оставь .js если проект собирается как ESM
import { config } from "./config.js";
import { AppError, asyncHandler } from "./middleware/errorHandler.js";
import { AuthRequest, TelegramUser, DatabaseUser } from "./types.js";
import { TelegramAuthSchema, validate } from "./validation.js";

const router = Router();

function verifyInitData(initData: string): { valid: boolean; user?: TelegramUser; authDate?: number } {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash") || "";
  const authDate = p.get("auth_date");
  p.delete("hash");

  // TTL подписи
  if (authDate) {
    const authTime = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTime > config.telegramAuthExpiry) return { valid: false };
  }

  const dataCheck = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");

  // безопасное сравнение
  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) return { valid: false };

  if (p.has("user")) {
    try {
      const user = JSON.parse(p.get("user")!) as TelegramUser;
      return { valid: true, user, authDate: authDate ? parseInt(authDate, 10) : undefined };
    } catch {
      return { valid: false };
    }
  }
  return { valid: false };
}

router.post(
  "/telegram",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // валидация тела
    const v = validate(TelegramAuthSchema, req.body);
    if (!v.success) throw new AppError(v.error, 400);

    const { initData } = v.data;

    // проверка подписи Telegram
    const auth = verifyInitData(initData);
    if (!auth.valid || !auth.user) throw new AppError("Invalid Telegram authentication", 401);

    const u = auth.user;

    // upsert пользователя
    const rows = await q<DatabaseUser>(
      `insert into users(tg_id, first_name, username)
       values ($1, $2, $3)
       on conflict (tg_id) do update
         set first_name = excluded.first_name,
             username   = excluded.username,
             updated_at = now()
       returning id, tg_id, first_name, username`,
      [u.id, u.first_name || null, u.username || null]
    );

    if (rows.length === 0) throw new AppError("Failed to create/update user", 500);

    const dbUser = rows[0];
    const token = jwt.sign({ uid: dbUser.id, tg: u.id }, config.jwtSecret, { expiresIn: "30d" });

    res.json({
      token,
      profile: {
        id: dbUser.id,
        tg_id: dbUser.tg_id,
        first_name: dbUser.first_name ?? null,
        username: dbUser.username ?? null,
      },
    });
  })
);

// guard для защищённых роутов
export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return next(new AppError("No authentication token provided", 401));

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { uid: string; tg: number; iat?: number; exp?: number };
    req.user = decoded;
    next();
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) return next(new AppError("Token expired", 401));
    if (e instanceof jwt.JsonWebTokenError) return next(new AppError("Invalid token", 401));
    return next(new AppError("Authentication failed", 401));
  }
}

export default router;
