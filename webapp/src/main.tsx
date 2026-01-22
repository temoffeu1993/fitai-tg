import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import robotImg from "./assets/robot.png";
import morobotImg from "./assets/morobot.png";
import mozgImg from "./assets/mozg.png";
import fonImg from "./assets/fon.png";
import maleRobotImg from "./assets/robonew.png";
import femaleRobotImg from "./assets/zhennew.png";
import beginnerImg from "./assets/novii.png";
import intermediateImg from "./assets/sredne.png";
import advancedImg from "./assets/profi.png";

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
const hideBootSplash = () => {
  const el = document.getElementById("boot-splash");
  if (el) {
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    window.setTimeout(() => {
      el.remove();
    }, 120);
  }
};

function LoadingScreen() {
  return (
    <div style={loader.wrap}>
      <style>{loader.css}</style>
      <div className="boot-loader">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

async function preloadImage(src: string): Promise<void> {
  if (!src || typeof window === "undefined") return;
  await new Promise<void>((resolve) => {
    try {
      const img = new Image();
      img.decoding = "sync";
      img.src = src;
      const done = () => resolve();
      if (img.complete && img.naturalWidth > 0) return resolve();
      const anyImg = img as any;
      if (typeof anyImg.decode === "function") {
        anyImg.decode().then(done).catch(() => {
          img.onload = done;
          img.onerror = done;
        });
      } else {
        img.onload = done;
        img.onerror = done;
      }
    } catch {
      resolve();
    }
  });
}

const loader = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#ffffff",
    position: "relative",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, Inter, Roboto",
  } as React.CSSProperties,
  css: `
    .boot-loader{
      display:flex;
      gap:10px;
      align-items:center;
      justify-content:center;
    }
    .boot-loader span{
      width:10px;
      height:10px;
      border-radius:50%;
      background:#111;
      animation: bootPulse 1s ease-in-out infinite;
    }
    .boot-loader span:nth-child(2){ animation-delay: .15s; }
    .boot-loader span:nth-child(3){ animation-delay: .3s; }
    @keyframes bootPulse{ 0%,100%{ transform: scale(.7); opacity:.35; } 50%{ transform: scale(1); opacity:1; } }
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
  Promise.all([
    preloadImage(robotImg),
    preloadImage(morobotImg),
    preloadImage(mozgImg),
    preloadImage(fonImg),
    preloadImage(maleRobotImg),
    preloadImage(femaleRobotImg),
    preloadImage(beginnerImg),
    preloadImage(intermediateImg),
    preloadImage(advancedImg),
  ]).finally(() => {
    root.render(<App />);
    window.requestAnimationFrame(hideBootSplash);
  });
} else {
  // реальная авторизация через Telegram
  root.render(<LoadingScreen />);
  window.requestAnimationFrame(hideBootSplash);
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
    await Promise.all([
      preloadImage(robotImg),
      preloadImage(morobotImg),
      preloadImage(mozgImg),
      preloadImage(fonImg),
      preloadImage(maleRobotImg),
      preloadImage(femaleRobotImg),
      preloadImage(beginnerImg),
      preloadImage(intermediateImg),
      preloadImage(advancedImg),
    ]);
    root.render(<App />);
    window.requestAnimationFrame(hideBootSplash);
  } catch (e: any) {
    root.render(<LoadingScreen />);
    window.requestAnimationFrame(hideBootSplash);
  }
}
