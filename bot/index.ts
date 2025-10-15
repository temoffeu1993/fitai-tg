import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
const bot = new Telegraf(process.env.BOT_TOKEN!);
bot.start(ctx=>ctx.reply("Открой мини-приложение", Markup.inlineKeyboard([
  Markup.button.webApp("Запустить ИИ-тренер", process.env.WEBAPP_URL!)
])));
bot.launch();
process.once("SIGINT",()=>bot.stop("SIGINT"));
process.once("SIGTERM",()=>bot.stop("SIGTERM"));