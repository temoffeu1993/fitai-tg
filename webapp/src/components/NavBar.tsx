// webapp/src/components/NavBar.tsx
import React, { useEffect, useMemo, useState } from "react";

export type TabKey = "home" | "history" | "nutrition" | "profile";
export type NavCurrent = TabKey | "none";

/** Локальная проверка завершения онбординга */
function isOnboardingCompleteLocal(): boolean {
  try {
    if (localStorage.getItem("onb_complete") === "1") return true;
    const s = JSON.parse(localStorage.getItem("onb_summary") || "null");
    if (!s) return false;
    const ok =
      s?.profile?.name &&
      s?.ageSex?.sex &&
      Number.isFinite(Number(s?.ageSex?.age)) &&
      Number.isFinite(Number(s?.body?.height)) &&
      Number.isFinite(Number(s?.body?.weight)) &&
      s?.experience &&
      s?.schedule?.daysPerWeek &&
      s?.dietPrefs &&
      s?.motivation?.goal;
    return Boolean(ok);
  } catch {
    return false;
  }
}

export default function NavBar({
  current,
  onChange,
  pushDown = 0,
  /** Если передан, имеет приоритет над автоопределением */
  disabledAll,
}: {
  current: NavCurrent;
  onChange?: (t: TabKey) => void;
  pushDown?: number;
  disabledAll?: boolean;
}) {
  const [complete, setComplete] = useState<boolean>(isOnboardingCompleteLocal());

  useEffect(() => {
    const handler = () => setComplete(isOnboardingCompleteLocal());

    // 1) Слушаем мгновенные сигналы из онбординга
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("onb");
      bc.onmessage = (e) => {
        if (e?.data === "onb_updated" || e?.data === "onb_complete") handler();
      };
    } catch {}

    // 2) Кастомное DOM-событие на случай отсутствия BroadcastChannel
    const onbUpdated = () => handler();
    window.addEventListener("onb_updated" as any, onbUpdated);

    // 3) Доп. хуки жизненного цикла вкладки
    const vis = () => handler();
    window.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);

    // 4) storage + редкий fallback-таймер
    window.addEventListener("storage", handler);
    const id = setInterval(handler, 2000);

    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("onb_updated" as any, onbUpdated);
      window.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", vis);
      clearInterval(id);
      try { bc && bc.close(); } catch {}
    };
  }, []);

  // Итоговая блокировка: внешняя пропса имеет приоритет. Иначе — авто.
  const lock = useMemo(() => {
    if (typeof disabledAll === "boolean") return disabledAll;
    return !complete;
  }, [disabledAll, complete]);

  return (
    <nav
      style={{
        ...st.tabbar,
        transform: pushDown ? `translateY(${pushDown}px)` : undefined,
      }}
      aria-label="Навигация"
    >
      <div style={st.tabbarInner}>
        <TabBtn
          emoji="🏠"
          label="Главная"
          active={current === "home"}
          onClick={() => onChange?.("home")}
          // Главная всегда доступна
          disabled={false}
        />
        <TabBtn
          emoji="🏋️"
          label="Трен"
          active={current === "history"}
          onClick={() => onChange?.("history")}
          disabled={lock}
        />
        <TabBtn
          emoji="🍽️"
          label="Питание"
          active={current === "nutrition"}
          onClick={() => onChange?.("nutrition")}
          disabled={lock}
        />
        <TabBtn
          emoji="👤"
          label="Профиль"
          active={current === "profile"}
          onClick={() => onChange?.("profile")}
          disabled={lock}
        />
      </div>
    </nav>
  );
}

function TabBtn({
  emoji,
  label,
  active,
  onClick,
  disabled,
}: {
  emoji: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      style={{ ...st.tabBtn, ...(active ? st.tabBtnActive : {}), ...(disabled ? st.tabBtnDisabled : {}) }}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      aria-disabled={disabled}
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
    transition: "background .2s, color .2s, opacity .2s",
    position: "relative",
    overflow: "hidden",
  },
  tabBtnActive: {
    background: "rgba(255,255,255,0.4)",
    color: "#000",
    border: "0px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  tabBtnDisabled: {
    opacity: 0.5,
    cursor: "default",
    pointerEvents: "none",
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
