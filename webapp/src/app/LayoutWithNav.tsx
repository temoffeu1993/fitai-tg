// webapp/src/app/LayoutWithNav.tsx
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import NavBar, { type NavCurrent, type TabKey } from "@/components/NavBar";

function resolveNavCurrent(pathname: string): NavCurrent {
  // 👇 спец-кейс: отдельный экран — без подсветки табов
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
  return false;
}

export default function LayoutWithNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const keyboardOffset = useKeyboardOffset();

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

  return (
    <div style={{ minHeight: "100%", background: "#fff", paddingBottom: 72 }}>
      <div style={{ height: safeTop, background: "#f3f4f6" }} />
      <div style={{ marginTop: -safeTop }}>
        <Outlet />
      </div>
      {!hideNav && <NavBar current={current} onChange={handleChange} pushDown={keyboardOffset} />}
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
