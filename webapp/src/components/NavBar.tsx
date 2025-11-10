// webapp/src/components/NavBar.tsx
import React from "react";

export type TabKey = "home" | "history" | "nutrition" | "profile";
export type NavCurrent = TabKey | "none"; // 👈 добавили "none"

export default function NavBar({
  current,
  onChange,
  pushDown = 0,
}: {
  current: NavCurrent;          // 👈 тип расширили
  onChange?: (t: TabKey) => void;
  pushDown?: number;
}) {
  return (
    <nav
      style={{
        ...st.tabbar,
        transform: pushDown ? `translateY(${pushDown}px)` : undefined,
      }}
      aria-label="Навигация"
    >
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
      <div style={{ ...st.emojiWrap }}>
       <span style={{ fontSize: 26, lineHeight: 1 }}>{emoji}</span>
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
    transition: "transform .2s ease",
  },
  tabbarInner: {
    pointerEvents: "auto",
    margin: "0 auto",
    maxWidth: 640,
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(18px) saturate(180%)",
    WebkitBackdropFilter: "blur(18px) saturate(180%)",
    boxShadow: "0 12px 30px rgba(0,0,0,.18)",
    borderRadius: 28,
    padding: "10px 12px",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.15)",
  },
  tabBtn: {
    border: "none",
    borderRadius: 16,
    padding: "10px 6px 6px",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    gap: 1,
    cursor: "pointer",
    fontWeight: 700,
    color: "#1b1b1b",
    transition: "background .2s, color .2s",
    position: "relative",
    overflow: "hidden",
  },
  // ⇩ Стиль активной кнопки = как у «Расписание/Питание/Прогресс»
  tabBtnActive: {
    background: "rgba(255,255,255,0.4)",
    color: "#000",
    border: "0px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  emojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "transparent",
    display: "grid",
    placeItems: "center",
    transition: "background .2s",
  },
};