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

const debugEnabled = (() => {
  if (typeof window === "undefined") return false;
  const byQuery = new URLSearchParams(window.location.search).has("debug");
  const byStorage = window.localStorage.getItem("boot_debug") === "1";
  return byQuery || byStorage;
})();

const timeMark = (label: string) => {
  try {
    if (typeof performance === "undefined") return;
    performance.mark(label);
    const entries = performance.getEntriesByName(label);
    const last = entries[entries.length - 1];
    if (last) {
      console.log(`[perf] ${label}: ${last.startTime.toFixed(0)}ms`);
      if (debugEnabled) {
        const list = (window as any).__BOOT_TIMES__ as string[] | undefined;
        const next = `${label}: ${last.startTime.toFixed(0)}ms`;
        if (list) {
          list.push(next);
        } else {
          (window as any).__BOOT_TIMES__ = [next];
        }
      }
    }
  } catch (err) {
    console.warn("perf mark failed", err);
  }
};

timeMark("boot:main-start");

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
timeMark("boot:telegram-ready");
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
timeMark("boot:theme-applied");

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

function DebugOverlay() {
  if (!debugEnabled) return null;
  const times = ((window as any).__BOOT_TIMES__ as string[] | undefined) ?? [];
  const nav = ((window as any).__BOOT_NAV__ as string[] | undefined) ?? [];
  return (
    <div style={debugUi.wrap}>
      <div style={debugUi.title}>Boot debug</div>
      <div style={debugUi.list}>
        {(times.length || nav.length)
          ? [...nav, ...times].map((line) => <div key={line}>{line}</div>)
          : "no marks yet"}
      </div>
    </div>
  );
}

const debugUi = {
  wrap: {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(15, 23, 42, 0.85)",
    color: "#fff",
    fontSize: 12,
    lineHeight: 1.35,
    zIndex: 9999,
    maxHeight: "45vh",
    overflow: "auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  } as React.CSSProperties,
  title: {
    fontWeight: 700,
    marginBottom: 6,
  } as React.CSSProperties,
  list: {
    display: "grid",
    gap: 4,
  } as React.CSSProperties,
};

const attachBootDebugTap = () => {
  if (typeof window === "undefined") return;
  let count = 0;
  let timer: number | null = null;
  const reset = () => {
    count = 0;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  const handler = () => {
    count += 1;
    if (count === 1) {
      timer = window.setTimeout(reset, 1200);
    }
    if (count >= 5) {
      reset();
      try {
        const next = window.localStorage.getItem("boot_debug") === "1" ? "0" : "1";
        window.localStorage.setItem("boot_debug", next);
      } catch (err) {
        console.warn("boot_debug storage failed", err);
      }
      window.location.reload();
    }
  };
  window.addEventListener("click", handler);
};

attachBootDebugTap();

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

const captureNavigationTiming = () => {
  if (!debugEnabled || typeof performance === "undefined") return;
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!entry) return;
    const lines = [
      `nav:dns ${Math.max(0, entry.domainLookupEnd - entry.domainLookupStart).toFixed(0)}ms`,
      `nav:tcp ${Math.max(0, entry.connectEnd - entry.connectStart).toFixed(0)}ms`,
      `nav:ssl ${Math.max(0, entry.connectEnd - entry.secureConnectionStart).toFixed(0)}ms`,
      `nav:ttfb ${Math.max(0, entry.responseStart - entry.requestStart).toFixed(0)}ms`,
      `nav:download ${Math.max(0, entry.responseEnd - entry.responseStart).toFixed(0)}ms`,
      `nav:domInteractive ${Math.max(0, entry.domInteractive).toFixed(0)}ms`,
    ];
    (window as any).__BOOT_NAV__ = lines;
  } catch (err) {
    console.warn("navigation timing failed", err);
  }
};

captureNavigationTiming();

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
  const allImages = [
    robotImg,
    morobotImg,
    fonImg,
    mozgImg,
    maleRobotImg,
    femaleRobotImg,
    beginnerImg,
    intermediateImg,
    advancedImg,
  ];
  Promise.all(allImages.map(preloadImage)).finally(() => {
    timeMark("boot:critical-images-ready");
    root.render(
      <>
        <App />
        <DebugOverlay />
      </>
    );
    timeMark("boot:app-rendered");
    window.requestAnimationFrame(hideBootSplash);
  });
} else {
  // реальная авторизация через Telegram
  root.render(<LoadingScreen />);
  timeMark("boot:loading-screen-rendered");
  auth();
}

// --- авторизация через Telegram API ---
async function auth() {
  const initData =
    tg?.initData ||
    new URLSearchParams(location.search).get("tgWebAppData") ||
    "";

  try {
    timeMark("auth:request-start");
    const r = await fetch(`${import.meta.env.VITE_API_URL}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    if (!r.ok) throw new Error(await r.text());

    timeMark("auth:response-ok");
    const { token } = await r.json();
    localStorage.setItem("token", token);
    const allImages = [
      robotImg,
      morobotImg,
      fonImg,
      mozgImg,
      maleRobotImg,
      femaleRobotImg,
      beginnerImg,
      intermediateImg,
      advancedImg,
    ];
    await Promise.all(allImages.map(preloadImage));
    timeMark("boot:critical-images-ready");
    root.render(
      <>
        <App />
        <DebugOverlay />
      </>
    );
    timeMark("boot:app-rendered");
    window.requestAnimationFrame(hideBootSplash);
  } catch (e: any) {
    root.render(<LoadingScreen />);
    timeMark("auth:failed");
  }
}
