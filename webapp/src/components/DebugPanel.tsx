// Визуальная панель отладки для телефона
import { useState, useEffect } from "react";

export default function DebugPanel() {
  const [show, setShow] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Перехватываем console.log
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      setLogs(prev => [...prev.slice(-20), `${new Date().toLocaleTimeString()}: ${message}`]);
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  const tgUserId = (() => {
    try {
      return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id || "unknown";
    } catch {
      return "unknown";
    }
  })();

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        style={{
          position: "fixed",
          bottom: 120, // ПОДНЯЛ ВЫШЕ! Был 90, теперь 120 - над tab-bar
          right: 10,
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          border: "none",
          fontSize: 24,
          zIndex: 9999,
          cursor: "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.3)", // Тень чтобы было видно
        }}
      >
        🐛
      </button>
    );
  }

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <span>🐛 Debug Panel</span>
          <button onClick={() => setShow(false)} style={s.closeBtn}>✕</button>
        </div>
        
        <div style={s.content}>
          <div style={s.section}>
            <div style={s.title}>Telegram User ID:</div>
            <div style={s.code}>
              {tgUserId}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(String(tgUserId));
                  alert(`ID скопирован: ${tgUserId}`);
                }}
                style={{
                  marginLeft: 10,
                  padding: "4px 8px",
                  background: "#333",
                  border: "1px solid #555",
                  color: "#0f0",
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                📋 Copy
              </button>
            </div>
          </div>

          <div style={s.section}>
            <div style={s.title}>storage:</div>
            <div style={s.code}>
              window.__ONB_COMPLETE__: {String((window as any).__ONB_COMPLETE__ || "undefined")}<br/>
              localStorage.onb_complete: {localStorage.getItem("onb_complete") || "null"}<br/>
              sessionStorage.onb_complete: {sessionStorage.getItem("onb_complete") || "null"}<br/>
              scheme_selected: {localStorage.getItem("scheme_selected") || "null"}<br/>
              profile: {localStorage.getItem("profile") ? "✅ есть" : "❌ нет"}
            </div>
          </div>

          <div style={s.section}>
            <div style={s.title}>Logs ({logs.length}):</div>
            <div style={s.logs}>
              {logs.length === 0 && <div style={s.empty}>Логов пока нет</div>}
              {logs.map((log, i) => (
                <div key={i} style={s.log}>{log}</div>
              ))}
            </div>
          </div>

          <div style={s.actions}>
            <button 
              onClick={() => {
                localStorage.clear();
                alert("localStorage очищен! Перезагрузи страницу.");
              }}
              style={s.btn}
            >
              Очистить localStorage
            </button>
            <button 
              onClick={() => {
                (window as any).__ONB_COMPLETE__ = true;
                localStorage.setItem("onb_complete", "1");
                sessionStorage.setItem("onb_complete", "1");
                window.dispatchEvent(new Event("onb_complete"));
                alert("✅ Все флаги установлены! Перезагрузи страницу.");
              }}
              style={s.btn}
            >
              Разблокировать принудительно
            </button>
            <button 
              onClick={() => setLogs([])}
              style={s.btn}
            >
              Очистить логи
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  panel: {
    background: "#1a1a1a",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    padding: "16px 20px",
    background: "#2a2a2a",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 24,
    cursor: "pointer",
    padding: 0,
    width: 32,
    height: 32,
  },
  content: {
    padding: 20,
    overflow: "auto",
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  title: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  code: {
    background: "#0a0a0a",
    padding: 12,
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "monospace",
    color: "#0f0",
    lineHeight: 1.6,
  },
  logs: {
    background: "#0a0a0a",
    padding: 12,
    borderRadius: 8,
    maxHeight: 200,
    overflow: "auto",
  },
  log: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#0f0",
    marginBottom: 4,
    wordBreak: "break-all" as const,
  },
  empty: {
    fontSize: 12,
    color: "#666",
    textAlign: "center" as const,
    padding: 20,
  },
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  btn: {
    background: "#333",
    border: "1px solid #555",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
