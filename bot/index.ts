import "dotenv/config";
import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN!);

const welcomeMessage = `Привет! Ты в Moro — твоём персональном ИИ-фитнес-тренере.

Здесь за пару минут можно получить:
• индивидуальную программу тренировок под твои цели, опыт и ограничения
• персональное питание с точными КБЖУ
• календарь планирования и отслеживание прогресса

Чтобы начать, просто пройди короткую анкету — и Moro соберёт для тебя полный план.

Готов начать? 🚀  Жми СТАРТ`;

bot.start(async (ctx) => {
  try {
    await ctx.reply(welcomeMessage);
  } catch (err) {
    console.error("Failed to send welcome message", err);
  }
  return ctx.reply(
    "Открой мини-приложение",
    Markup.inlineKeyboard([Markup.button.webApp("Запустить ИИ-тренер", process.env.WEBAPP_URL!)]),
  );
});

bot.launch();
process.once("SIGINT",()=>bot.stop("SIGINT"));
process.once("SIGTERM",()=>bot.stop("SIGTERM"));
