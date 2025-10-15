import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// рендерим лоадер до авторизации
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<div style={{ padding: 20 }}>Авторизация…</div>);

// Telegram WebApp SDK (скрипт подключи в index.html)
const tg = (window as any)?.Telegram?.WebApp;
tg?.expand?.();
tg?.ready?.();

console.log("initData?", !!tg?.initData, import.meta.env.VITE_API_URL);

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

    if (!r.ok) {
      const t = await r.text();
      root.render(
        <div style={{ padding: 20 }}>
          Ошибка авторизации: {r.status} {t}
        </div>
      );
      return;
    }

    const { token } = await r.json();
    localStorage.setItem("token", token);

    // успешная авторизация — рендерим приложение
    root.render(<App />);
  } catch (e: any) {
    root.render(
      <div style={{ padding: 20 }}>
        Сеть/CORS: {e?.message || String(e)}
      </div>
    );
  }
}

auth();