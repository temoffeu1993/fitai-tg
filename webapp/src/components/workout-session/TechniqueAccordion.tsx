import { useState, useEffect, type CSSProperties } from "react";
import { workoutTheme } from "./theme";

type Props = {
    technique?: {
        setup: string;
        execution: string;
        commonMistakes: string[];
    };
    proTip?: string;
    /** Reset accordion when this key changes (e.g. exercise index) */
    resetKey?: string | number;
};

export default function TechniqueAccordion({ technique, proTip, resetKey }: Props) {
    const [open, setOpen] = useState(false);

    // Collapse when exercise changes
    useEffect(() => {
        setOpen(false);
    }, [resetKey]);

    if (!technique && !proTip) return null;

    return (
        <div style={s.root}>
            <button
                type="button"
                style={s.trigger}
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                aria-label="Техника выполнения"
            >
                <span style={s.chevron}>{open ? "▾" : "▸"}</span>
                <span style={s.triggerLabel}>Техника выполнения</span>
            </button>

            {open ? (
                <div style={s.content}>
                    {technique ? (
                        <>
                            <div style={s.section}>
                                <div style={s.sectionTitle}>Подготовка</div>
                                <div style={s.text}>{technique.setup}</div>
                            </div>

                            <div style={s.section}>
                                <div style={s.sectionTitle}>Выполнение</div>
                                <div style={s.text}>{technique.execution}</div>
                            </div>

                            {technique.commonMistakes.length > 0 ? (
                                <div style={s.section}>
                                    <div style={s.sectionTitle}>⚠ Частые ошибки</div>
                                    <ul style={s.mistakesList}>
                                        {technique.commonMistakes.map((m, i) => (
                                            <li key={i} style={s.mistakeItem}>{m}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </>
                    ) : null}

                    {proTip ? (
                        <div style={s.proTipWrap}>
                            <span style={s.proTipIcon}>💡</span>
                            <span style={s.proTipText}>{proTip}</span>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

const s: Record<string, CSSProperties> = {
    root: {
        padding: "0 2px",
    },
    trigger: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 0",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        appearance: "none",
    },
    chevron: {
        fontSize: 14,
        lineHeight: 1,
        color: workoutTheme.textSecondary,
        flexShrink: 0,
        width: 16,
        textAlign: "center",
    },
    triggerLabel: {
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.4,
        color: workoutTheme.textSecondary,
    },
    content: {
        display: "grid",
        gap: 10,
        padding: "2px 0 4px 22px",
    },
    section: {
        display: "grid",
        gap: 2,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        color: workoutTheme.textSecondary,
        textTransform: "uppercase" as const,
        letterSpacing: 0.3,
    },
    text: {
        fontSize: 13,
        fontWeight: 400,
        lineHeight: 1.45,
        color: workoutTheme.textMuted,
    },
    mistakesList: {
        margin: 0,
        padding: "0 0 0 16px",
        display: "grid",
        gap: 2,
    },
    mistakeItem: {
        fontSize: 13,
        fontWeight: 400,
        lineHeight: 1.45,
        color: workoutTheme.textMuted,
    },
    proTipWrap: {
        display: "flex",
        gap: 6,
        alignItems: "flex-start",
        padding: "6px 0 0",
    },
    proTipIcon: {
        fontSize: 14,
        lineHeight: 1.4,
        flexShrink: 0,
    },
    proTipText: {
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.45,
        color: "rgba(15,23,42,0.55)",
        fontStyle: "italic",
    },
};
