import { useLayoutEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type ScheduleReplaceConfirmModalProps = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ScheduleReplaceConfirmModal({
  message,
  confirmLabel = "Заменить",
  cancelLabel = "Отмена",
  busy = false,
  onConfirm,
  onCancel,
}: ScheduleReplaceConfirmModalProps) {
  useLayoutEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={st.wrap} role="dialog" aria-modal="true">
      <style>{styles}</style>
      <div style={st.card} className="dtw-card-enter">
        <p style={st.message}>{message}</p>
        <div style={st.actions}>
          <button
            type="button"
            style={{
              ...st.cancelBtn,
              ...(busy ? st.secondaryDisabled : null),
            }}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            style={{
              ...st.confirmBtn,
              ...(busy ? st.primaryDisabled : null),
            }}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Сохраняем..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const styles = `
  @keyframes dtwCardIn {
    0% { opacity: 0; transform: translateY(14px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .dtw-card-enter {
    animation: dtwCardIn 260ms ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .dtw-card-enter { animation: none !important; }
  }
`;

const st: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    zIndex: 2600,
    background: "rgba(255,255,255,0.01)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: 680,
    minWidth: 280,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.78)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,245,250,0.96) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    padding: "22px 18px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  message: {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1.45,
    color: "#1e1f22",
    textAlign: "left",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  cancelBtn: {
    borderRadius: 14,
    padding: "14px 14px",
    border: "1px solid rgba(30,31,34,0.2)",
    background: "linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%)",
    color: "rgba(30,31,34,0.88)",
    fontSize: 16,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.82)",
  },
  confirmBtn: {
    borderRadius: 14,
    padding: "14px 14px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 16,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  primaryDisabled: {
    opacity: 0.72,
    cursor: "default",
    boxShadow: "0 4px 8px rgba(0,0,0,0.14)",
  },
  secondaryDisabled: {
    opacity: 0.72,
    cursor: "default",
  },
};
