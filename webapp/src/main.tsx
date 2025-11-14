import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// инициализация Telegram WebApp SDK
const tg = (window as any)?.Telegram?.WebApp;

const docEl = document.documentElement;
const syncViewportHeight = () => {
  const height = tg?.viewportHeight || window.innerHeight;
  const stableHeight = tg?.viewportStableHeight || height;
  docEl.style.setProperty("--app-height", `${height}px`);
  docEl.style.setProperty("--app-height-stable", `${stableHeight}px`);
};

// сохраняем профиль пользователя (включая photo_url) из initData сразу при старте
try {
  const tgUser = tg?.initDataUnsafe?.user;
  if (tgUser) {
    localStorage.setItem("profile", JSON.stringify(tgUser));
  }
} catch (err) {
  console.warn("initData profile parse error", err);
}
tg?.expand?.();
tg?.disableVerticalSwipes?.();
tg?.ready?.();
syncViewportHeight();
tg?.onEvent?.("viewportChanged", syncViewportHeight);
window.addEventListener("resize", syncViewportHeight);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    tg?.offEvent?.("viewportChanged", syncViewportHeight);
    window.removeEventListener("resize", syncViewportHeight);
  });
}
const applyLightTheme = () => {
  const root = document.documentElement;
  root.style.setProperty("--tg-theme-bg-color", "#f5f6f8");
  root.style.setProperty("--tg-theme-secondary-bg-color", "#ffffff");
  root.style.setProperty("--tg-theme-header-bg-color", "#f3f4f6");
  root.style.setProperty("--tg-theme-bottom-bar-bg-color", "#ffffff");

  tg?.setBackgroundColor?.("#ffffff");
  tg?.setSecondaryBackgroundColor?.("#ffffff");
  tg?.setHeaderColor?.("#f3f4f6");
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

function LoadingScreen({ text = "Загружаем твоего фитнес-тренера" }: { text?: string }) {
  return (
    <div style={loader.wrap}>
      <style>{loader.css}</style>
      <div style={loader.card}>
        <div style={loader.emoji}>💪</div>
        <div style={loader.title}>FitAI</div>
        <div style={loader.text}>{text}</div>
        <div className="loader-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

const loader = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "var(--app-gradient, #f5f6fb)",
    position: "relative",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
  } as React.CSSProperties,
  card: {
    position: "relative",
    padding: "32px 36px",
    borderRadius: 28,
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    textAlign: "center",
    zIndex: 2,
  } as React.CSSProperties,
  emoji: { fontSize: 44, marginBottom: 8 } as React.CSSProperties,
  title: { fontSize: 24, fontWeight: 800, color: "#1b1b1b" } as React.CSSProperties,
  text: { marginTop: 6, fontSize: 15, color: "#4b5563" } as React.CSSProperties,
  css: `
    .loader-dots{
      margin-top: 18px;
      display:flex;
      gap:8px;
      justify-content:center;
    }
    .loader-dots span{
      width:10px;
      height:10px;
      border-radius:50%;
      background:linear-gradient(135deg,#6a8dff,#8a64ff);
      animation: pulseDot 1.1s ease-in-out infinite;
    }
    .loader-dots span:nth-child(2){ animation-delay: .15s; }
    .loader-dots span:nth-child(3){ animation-delay: .3s; }
    @keyframes pulseDot{ 0%,100%{ transform: scale(.7); opacity:.5; } 50%{ transform: scale(1); opacity:1; } }
  `,
};

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
  root.render(<LoadingScreen />);
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
    root.render(<LoadingScreen text={`Ошибка: ${e?.message || String(e)}`} />);
  }
}
