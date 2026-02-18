import { useState, useEffect, type CSSProperties } from "react";
import { ChevronRight, BookOpen } from "lucide-react";
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
                <BookOpen size={14} strokeWidth={1.9} style={s.triggerIcon} />
                <span style={s.triggerLabel}>Техника выполнения</span>
                <ChevronRight
                    size={14}
                    strokeWidth={1.9}
                    style={{
                        ...s.chevron,
                        transform: open ? "rotate(-90deg)" : "rotate(90deg)",
                    }}
                />
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
    },
    trigger: {
        width: "100%",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        border: "none",
        background: "transparent",
        color: "rgba(15, 23, 42, 0.62)",
        borderRadius: 0,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        appearance: "none",
    },
    chevron: {
        flex: "0 0 auto",
        marginLeft: "auto",
        transition: "transform 160ms ease",
    },
    triggerIcon: {
        flex: "0 0 auto",
        color: "rgba(15,23,42,0.45)",
    },
    triggerLabel: {
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.45,
    },
    content: {
        display: "grid",
        gap: 10,
        padding: "2px 0 4px",
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
