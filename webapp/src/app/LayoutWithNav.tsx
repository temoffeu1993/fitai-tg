// webapp/src/app/LayoutWithNav.tsx
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import NavBar, { type NavCurrent, type TabKey } from "@/components/NavBar";

function resolveNavCurrent(pathname: string): NavCurrent {
  if (pathname === "/nutrition/today" || pathname.startsWith("/nutrition/today")) {
    return "none";
  }
  if (pathname === "/" || pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/history")) return "history";
  if (pathname === "/nutrition" || pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/profile")) return "profile";
  return "none";
}

function shouldHideNav(_pathname: string) {
  const pathname = _pathname || "";
  if (pathname.startsWith("/workout/session")) return true;
  if (pathname.startsWith("/workout/result")) return true;
  return false;
}

/** Фиксированный градиентный фон под всем UI */
function BgGradient() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background:
          "linear-gradient(135deg, rgba(236,227,255,.35) 0%, rgba(217,194,240,.35) 45%, rgba(255,216,194,.35) 100%)",
      }}
    />
  );
}

function hasOnbLocal(): boolean {
  try {
    // Проверка 1: Глобальная переменная (самый надёжный способ)
    if ((window as any).__ONB_COMPLETE__ === true) {
      console.log("✅ hasOnbLocal: window.__ONB_COMPLETE__ = true");
      return true;
    }
    
    // Проверка 2: localStorage
    const localFlag = localStorage.getItem("onb_complete");
    if (localFlag === "1") {
      console.log("✅ hasOnbLocal: localStorage = 1");
      return true;
    }
    
    // Проверка 3: sessionStorage (fallback)
    const sessionFlag = sessionStorage.getItem("onb_complete");
    if (sessionFlag === "1") {
      console.log("✅ hasOnbLocal: sessionStorage = 1");
      return true;
    }
    
    console.log("❌ hasOnbLocal: все проверки failed");
    return false;
  } catch (err) {
    console.error("❌ hasOnbLocal ERROR:", err);
    return false;
  }
}

export default function LayoutWithNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const keyboardOffset = useKeyboardOffset();

  const [onbDone, setOnbDone] = useState<boolean>(hasOnbLocal());

  useEffect(() => {
    const update = () => {
      const isDone = hasOnbLocal();
      console.log("LayoutWithNav: onboarding check", { isDone, flag: localStorage.getItem("onb_complete") });
      setOnbDone(isDone);
    };
    update();

    const onFocus = () => update();
    const onStorage = (e: StorageEvent) => {
      // Реагируем на любые изменения onb_complete
      if (!e.key || e.key === "onb_complete") {
        console.log("LayoutWithNav: storage event", e.key);
        update();
      }
    };
    const onOnb = () => {
      console.log("LayoutWithNav: onb_updated event");
      update();
    };
    const onComplete = () => {
      console.log("LayoutWithNav: onb_complete event");
      update();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("onb_updated" as any, onOnb);
    window.addEventListener("onb_complete" as any, onComplete);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("onb");
      bc.onmessage = (event) => {
        if (event?.data === "onb_updated" || event?.data === "onb_complete") update();
      };
    } catch {}

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("onb_updated" as any, onOnb);
      window.removeEventListener("onb_complete" as any, onComplete);
      try { bc?.close(); } catch {}
    };
  }, []);

  const current = resolveNavCurrent(pathname);
  const hideNav = shouldHideNav(pathname);
  const safeTop =
    typeof window !== "undefined"
      ? Number.parseInt(
          getComputedStyle(document.documentElement).getPropertyValue("--tg-viewport-inset-top") || "0",
          10
        ) || 0
      : 0;

  const handleChange = (t: TabKey) => {
    if (t === "home") navigate("/");
    if (t === "history") navigate("/history");
    if (t === "nutrition") navigate("/nutrition");
    if (t === "profile") navigate("/profile");
  };

  const disableKeyboardShift = pathname.startsWith("/workout/session");

  return (
    <div
      style={{
        minHeight: "100%",
        background: "transparent",
        paddingBottom: hideNav ? 0 : 72,
        position: "relative",
      }}
    >
      {/* общий фиксированный фон */}
      <BgGradient />

      {/* safe-area сверху */}
      <div style={{ height: safeTop, background: "transparent" }} />

      {/* контент поверх фона */}
      <main style={{ marginTop: -safeTop, position: "relative", zIndex: 1 }}>
        <Outlet />
      </main>

      {!hideNav && (
        <NavBar
          current={current}
          onChange={handleChange}
          pushDown={disableKeyboardShift ? 0 : keyboardOffset}
          disabledAll={!onbDone}
        />
      )}
    </div>
  );
}

function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const vv = window.visualViewport;
    const update = () => {
      const delta = window.innerHeight - (vv.height + (vv.offsetTop || 0));
      setOffset(delta > 80 ? delta : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}
