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

  const handleChange = (t: TabKey) => {
    if (t === "home") navigate("/");
    if (t === "history") navigate("/history");
    if (t === "nutrition") navigate("/nutrition");
    if (t === "profile") navigate("/profile");
  };

  return (
    <div style={{ paddingBottom: 72 }}>
      <Outlet />
      <NavBar current={current} onChange={handleChange} />
    </div>
  );
}
