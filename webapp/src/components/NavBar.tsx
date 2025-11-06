// webapp/src/components/NavBar.tsx
import React from "react";

export type TabKey = "home" | "history" | "nutrition" | "profile";
export type NavCurrent = TabKey | "none"; // 👈 добавили "none"

export default function NavBar({
  current,
  onChange,
}: {
  current: NavCurrent;          // 👈 тип расширили
  onChange?: (t: TabKey) => void;
}) {
  return (
    <nav style={st.tabbar} aria-label="Навигация">
      <TabBtn emoji="🏠" label="Главная" active={current === "home"}      onClick={() => onChange?.("home")} />
      <TabBtn emoji="🏋️" label="Трен"    active={current === "history"}  onClick={() => onChange?.("history")} />
      <TabBtn emoji="🍽️" label="Питание" active={current === "nutrition"} onClick={() => onChange?.("nutrition")} />
      <TabBtn emoji="👤" label="Профиль" active={current === "profile"}    onClick={() => onChange?.("profile")} />
    </nav>
  );
}

function TabBtn({
  emoji,
  label,
  active,
  onClick,
}: {
  emoji: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...st.tabBtn, ...(active ? st.tabBtnActive : {}) }}
      aria-current={active ? "page" : undefined}
    >
      <div style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</div>
      <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
    </button>
  );
}

const st: Record<string, React.CSSProperties> = {
  tabbar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    background: "#fff",
    boxShadow: "0 -6px 18px rgba(0,0,0,.08)",
    borderTop: "1px solid rgba(0,0,0,.06)",
    padding: "8px 12px",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    maxWidth: 720,
    margin: "0 auto",
    zIndex: 10,
  },
  tabBtn: {
    border: "none",
    borderRadius: 12,
    padding: "8px",
    background: "#f6f7fb",
    display: "grid",
    placeItems: "center",
    gap: 4,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  tabBtnActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
  },
};
