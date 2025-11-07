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
      <div style={st.tabbarInner}>
        <TabBtn emoji="🏠" label="Главная" active={current === "home"}      onClick={() => onChange?.("home")} />
        <TabBtn emoji="🏋️" label="Трен"    active={current === "history"}  onClick={() => onChange?.("history")} />
        <TabBtn emoji="🍽️" label="Питание" active={current === "nutrition"} onClick={() => onChange?.("nutrition")} />
        <TabBtn emoji="👤" label="Профиль" active={current === "profile"}    onClick={() => onChange?.("profile")} />
      </div>
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
      <div style={{ ...st.emojiWrap, ...(active ? st.emojiWrapActive : {}) }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
      </div>
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
    padding: "0 16px 20px",
    pointerEvents: "none",
    zIndex: 20,
  },
  tabbarInner: {
    pointerEvents: "auto",
    margin: "0 auto",
    maxWidth: 640,
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 12px 30px rgba(0,0,0,.18)",
    borderRadius: 28,
    padding: "10px 12px",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
  },
  tabBtn: {
    border: "none",
    borderRadius: 16,
    padding: "10px 6px 6px",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    gap: 4,
    cursor: "pointer",
    fontWeight: 700,
    color: "#1b1b1b",
  } as React.CSSProperties,
  tabBtnActive: {
    color: "#1b1b1b",
  },
  emojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    transition: "background .2s",
  },
  emojiWrapActive: {
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(104,112,255,.35)",
  },
};
