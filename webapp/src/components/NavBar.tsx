// webapp/src/components/NavBar.tsx
import React, { useEffect, useMemo, useState } from "react";

export type TabKey = "home" | "plan" | "coach" | "profile";
export type NavCurrent = TabKey | "none";
const TAB_ORDER: TabKey[] = ["home", "plan", "coach", "profile"];
const TAB_COUNT = 4;
const TABBAR_INNER_PADDING = 6;
const TAB_GAP = 6;

/** Локальная проверка завершения онбординга */
function isOnboardingCompleteLocal(): boolean {
  try {
    // Проверка 1: Глобальная переменная (самый надёжный способ)
    if ((window as any).__ONB_COMPLETE__ === true) {
      console.log("✅ NavBar: window.__ONB_COMPLETE__ = true");
      return true;
    }
    
    // Проверка 2: localStorage
    const localFlag = localStorage.getItem("onb_complete");
    if (localFlag === "1") {
      console.log("✅ NavBar: localStorage = 1");
      return true;
    }
    
    // Проверка 3: sessionStorage (fallback)
    const sessionFlag = sessionStorage.getItem("onb_complete");
    if (sessionFlag === "1") {
      console.log("✅ NavBar: sessionStorage = 1");
      return true;
    }
    
    console.log("❌ NavBar: все проверки failed");
    return false;
  } catch (err) {
    console.error("❌ NavBar ERROR:", err);
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
  const activeIndex = useMemo(
    () => TAB_ORDER.indexOf(current as TabKey),
    [current]
  );
  const activeTrackTransform = useMemo(() => {
    if (activeIndex < 0) return "translateX(0)";
    return `translateX(calc(${activeIndex} * ((100% - ${TABBAR_INNER_PADDING * 2}px - ${TAB_GAP * (TAB_COUNT - 1)}px) / ${TAB_COUNT} + ${TAB_GAP}px)))`;
  }, [activeIndex]);

  return (
    <nav
      style={{
        ...st.tabbar,
        transform: pushDown ? `translateY(${pushDown}px)` : undefined,
      }}
      aria-label="Навигация"
    >
      <div style={st.tabbarInner}>
        <span
          aria-hidden
          style={{
            ...st.activeTrack,
            transform: activeTrackTransform,
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        />
        <TabBtn
          icon={<HomeIcon />}
          label="Главная"
          active={current === "home"}
          onClick={() => onChange?.("home")}
          // Главная всегда доступна
          disabled={false}
        />
        <TabBtn
          icon={<CalendarIcon />}
          label="Календарь"
          active={current === "plan"}
          onClick={() => onChange?.("plan")}
          disabled={lock}
        />
        <TabBtn
          icon={<CoachIcon />}
          label="Тренер"
          active={current === "coach"}
          onClick={() => onChange?.("coach")}
          disabled={lock}
        />
        <TabBtn
          icon={<ProfileIcon />}
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
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
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
      <div style={{ ...st.iconOrb, ...(active ? st.iconOrbActive : undefined) }}>
        <span style={{ ...st.iconGlyph, ...(active ? st.iconGlyphActive : undefined) }}>{icon}</span>
      </div>
      <div style={{ ...st.tabLabel, ...(active ? st.tabLabelActive : undefined) }}>{label}</div>
    </button>
  );
}

const st: Record<string, React.CSSProperties> = {
  tabbar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "0 14px calc(env(safe-area-inset-bottom, 0px) + 12px)",
    pointerEvents: "none",
    zIndex: 20,
    transition: "transform .2s ease",
  },
  tabbarInner: {
    pointerEvents: "auto",
    margin: "0 auto",
    maxWidth: 640,
    background: "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(242,245,250,0.68) 100%)",
    backdropFilter: "blur(24px) saturate(170%)",
    WebkitBackdropFilter: "blur(24px) saturate(170%)",
    boxShadow:
      "0 10px 24px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.86)",
    borderRadius: 34,
    padding: "6px",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 6,
    border: "1px solid rgba(255,255,255,0.58)",
    position: "relative",
    overflow: "hidden",
  },
  activeTrack: {
    position: "absolute",
    left: TABBAR_INNER_PADDING,
    top: TABBAR_INNER_PADDING,
    bottom: TABBAR_INNER_PADDING,
    width: `calc((100% - ${TABBAR_INNER_PADDING * 2}px - ${TAB_GAP * (TAB_COUNT - 1)}px) / ${TAB_COUNT})`,
    borderRadius: 26,
    background: "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(234,238,244,0.74) 100%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.88), 0 2px 8px rgba(15,23,42,0.08)",
    transition:
      "transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
    zIndex: 0,
    willChange: "transform",
  },
  tabBtn: {
    border: "none",
    borderRadius: 26,
    padding: "6px 6px 5px",
    minHeight: 60,
    background: "transparent",
    display: "grid",
    placeItems: "center",
    gap: 4,
    cursor: "pointer",
    fontWeight: 600,
    color: "rgba(15,23,42,0.72)",
    transition: "color .24s ease, opacity .24s ease, transform .24s ease",
    position: "relative",
    overflow: "hidden",
    zIndex: 1,
  },
  tabBtnActive: {
    background: "transparent",
    color: "#1e1f22",
    transform: "translateY(-0.5px)",
  },
  tabBtnDisabled: {
    opacity: 0.45,
    cursor: "default",
    pointerEvents: "none",
  },
  iconOrb: {
    width: 38,
    height: 38,
    borderRadius: 999,
    background: "transparent",
    display: "grid",
    placeItems: "center",
    transition: "opacity .24s ease, transform .24s ease",
  },
  iconOrbActive: {
    background: "transparent",
    boxShadow: "none",
    transform: "translateY(-0.5px)",
  },
  iconGlyph: {
    width: 27,
    height: 27,
    color: "rgba(15,23,42,0.42)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color .24s ease, opacity .24s ease, transform .24s ease",
  },
  iconGlyphActive: {
    color: "#1e1f22",
    opacity: 1,
    transform: "translateY(-0.5px)",
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.1,
    color: "rgba(15,23,42,0.42)",
    textAlign: "center",
    whiteSpace: "nowrap",
    transition: "color .24s ease, opacity .24s ease, transform .24s ease",
  },
  tabLabelActive: {
    color: "#1e1f22",
    fontWeight: 700,
    transform: "translateY(-0.5px)",
  },
};

function HomeIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 10.3L12 4.5L19.5 10.3V18.5H14.5V13.6H9.5V18.5H4.5V10.3Z" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="6.5" width="15" height="13" rx="3.2" stroke="currentColor" strokeWidth="2.1" />
      <path d="M8 4.7V8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M16 4.7V8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M4.5 10H19.5" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6.2 7.2H17.8C19 7.2 20 8.2 20 9.4V15C20 16.2 19 17.2 17.8 17.2H12.3L8.7 20V17.2H6.2C5 17.2 4 16.2 4 15V9.4C4 8.2 5 7.2 6.2 7.2Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      <circle cx="9" cy="12.2" r="1" fill="currentColor" />
      <circle cx="12" cy="12.2" r="1" fill="currentColor" />
      <circle cx="15" cy="12.2" r="1" fill="currentColor" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="9.2" r="2.7" stroke="currentColor" strokeWidth="2.1" />
      <circle cx="15.4" cy="8.6" r="2.2" stroke="currentColor" strokeWidth="2.1" />
      <path d="M4.6 18C4.6 15.7 6.7 13.9 9.2 13.9C11.7 13.9 13.8 15.7 13.8 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M13.2 17.4C13.4 15.8 14.9 14.6 16.8 14.6C18.6 14.6 20 15.7 20 17.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}
