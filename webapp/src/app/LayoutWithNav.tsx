// webapp/src/app/LayoutWithNav.tsx
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

export default function LayoutWithNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const current = resolveNavCurrent(pathname);
  const safeTop = typeof window !== "undefined" ? Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--tg-viewport-inset-top") || "0", 10) || 0 : 0;

  const handleChange = (t: TabKey) => {
    if (t === "home") navigate("/");
    if (t === "history") navigate("/history");
    if (t === "nutrition") navigate("/nutrition");
    if (t === "profile") navigate("/profile");
  };

  return (
    <div style={{ minHeight: "100%", background: "#fff", paddingBottom: 72 }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 48 + safeTop,
          background: "#f3f4f6",
          boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div style={{ paddingTop: 16 }}>
        <Outlet />
      </div>
      <NavBar current={current} onChange={handleChange} />
    </div>
  );
}
