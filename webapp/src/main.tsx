import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// инициализация Telegram WebApp SDK
const tg = (window as any)?.Telegram?.WebApp;
tg?.expand?.();
tg?.ready?.();
const applyLightTheme = () => {
  const root = document.documentElement;
  root.style.setProperty("--tg-theme-bg-color", "#ffffff");
  root.style.setProperty("--tg-theme-secondary-bg-color", "#ffffff");
  root.style.setProperty("--tg-theme-header-bg-color", "#ffffff");
  root.style.setProperty("--tg-theme-bottom-bar-bg-color", "#ffffff");

  tg?.setBackgroundColor?.("#ffffff");
  tg?.setBackgroundColor?.("bg_color");
  tg?.setSecondaryBackgroundColor?.("#ffffff");
  tg?.setSecondaryBackgroundColor?.("bg_color");
  tg?.setHeaderColor?.("#ffffff");
  tg?.setHeaderColor?.("bg_color");
  tg?.setBottomBarColor?.("#ffffff");
  tg?.setBottomBarColor?.("bg_color");
  document.body.style.backgroundColor = "#ffffff";
  document.documentElement.style.backgroundColor = "#ffffff";
};
applyLightTheme();
tg?.onEvent?.("themeChanged", applyLightTheme);
tg?.onEvent?.("viewportChanged", applyLightTheme);
setTimeout(applyLightTheme, 50);
setTimeout(applyLightTheme, 200);

// корень приложения
const root = ReactDOM.createRoot(document.getElementById("root")!);

// определяем режим
const isDev =
  import.meta.env.DEV ||
  new URL(location.href).searchParams.has("debug");

// локальный режим — без Telegram, сразу заходим в приложение
if (isDev && !tg?.initData) {
  localStorage.setItem("token", "debug");
  localStorage.setItem(
    "profile",
    JSON.stringify({ first_name: "Dev", username: "dev" })
  );
  root.render(<App />);
} else {
  // реальная авторизация через Telegram
  root.render(<div style={{ padding: 20 }}>Авторизация…</div>);
  auth();
}

// --- авторизация через Telegram API ---
async function auth() {
  const initData =
    tg?.initData ||
    new URLSearchParams(location.search).get("tgWebAppData") ||
    "";

  try {
    const r = await fetch(`${import.meta.env.VITE_API_URL}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    if (!r.ok) throw new Error(await r.text());

    const { token } = await r.json();
    localStorage.setItem("token", token);
    root.render(<App />);
  } catch (e: any) {
    root.render(
      <div style={{ padding: 20 }}>Ошибка: {e?.message || String(e)}</div>
    );
  }
}
