import { useCallback, useEffect, useRef, useState } from "react";

// ── Minimal toast for inline notifications ──

type ToastEntry = { id: number; message: string };

let nextId = 1;

export function useToast(duration = 3500) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const show = useCallback(
    (message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message }]);
      const t = setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
        timers.current.delete(id);
      }, duration);
      timers.current.set(id, t);
    },
    [duration]
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { toasts, show };
}

const CONTAINER: React.CSSProperties = {
  position: "fixed",
  bottom: 100,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  pointerEvents: "none",
};

const CHIP: React.CSSProperties = {
  background: "rgba(30,41,59,0.92)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: "18px",
  padding: "8px 16px",
  borderRadius: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  maxWidth: "85vw",
  textAlign: "center",
  animation: "toast-in 220ms ease",
};

export function ToastContainer({ toasts }: { toasts: ToastEntry[] }) {
  if (toasts.length === 0) return null;
  return (
    <>
      <style>{`@keyframes toast-in { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div style={CONTAINER}>
        {toasts.map((t) => (
          <div key={t.id} style={CHIP}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
