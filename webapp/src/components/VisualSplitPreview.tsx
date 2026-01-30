// webapp/src/components/VisualSplitPreview.tsx
// Visual split preview — row of mini body silhouettes with colored zones
// Shows which body parts are trained per split type (e.g., upper_lower → 2 figures)

import React from "react";

// ============================================================================
// MINI BODY SVG — rounded silhouette with colorable zones
// ============================================================================

/**
 * Compact human silhouette SVG.
 * Three colorable zones: head+torso (upper), hips+legs (lower).
 * All shapes use rounded corners to match the app's design language.
 */
function MiniBodySvg({
  upperColor,
  lowerColor,
  size = 36,
}: {
  upperColor: string;
  lowerColor: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 28 35"
      fill="none"
      style={{ display: "block" }}
    >
      {/* Head */}
      <circle cx="14" cy="4.5" r="4" fill={upperColor} />
      {/* Neck */}
      <rect x="12" y="8" width="4" height="2.5" rx="1.5" fill={upperColor} />
      {/* Torso + Shoulders */}
      <path
        d="M5 11.5C5 10.67 5.67 10 6.5 10h15c.83 0 1.5.67 1.5 1.5V20c0 .83-.67 1.5-1.5 1.5h-15C5.67 21.5 5 20.83 5 20V11.5Z"
        fill={upperColor}
      />
      {/* Left arm */}
      <path
        d="M3.2 11C3.2 10.34 3.74 9.8 4.4 9.8H5.5v8H4.2c-.55 0-1-.45-1-1v-6.8Z"
        fill={upperColor}
        rx="1"
      />
      {/* Right arm */}
      <path
        d="M22.5 9.8h1.1c.66 0 1.2.54 1.2 1.2v6.8c0 .55-.45 1-1 1h-1.3v-8h0Z"
        fill={upperColor}
        rx="1"
      />
      {/* Hips */}
      <rect x="7" y="21" width="14" height="3.5" rx="1.5" fill={lowerColor} />
      {/* Left leg */}
      <rect x="7.5" y="24" width="5.5" height="10" rx="2.5" fill={lowerColor} />
      {/* Right leg */}
      <rect x="15" y="24" width="5.5" height="10" rx="2.5" fill={lowerColor} />
    </svg>
  );
}

// ============================================================================
// COLORS
// ============================================================================

const ZONE_COLORS = {
  upper:    "#3B82F6", // blue — chest, back, shoulders, arms
  lower:    "#22C55E", // green — legs, glutes
  full:     "#3B82F6", // blue — whole body
  push:     "#F97316", // orange — push muscles
  pull:     "#8B5CF6", // purple — pull muscles
  chest:    "#F97316", // orange
  back:     "#8B5CF6", // purple
  shoulders:"#0EA5E9", // sky
  arms:     "#EC4899", // pink
  core:     "#EAB308", // yellow
  muted:    "#E2E8F0", // light gray — inactive zone
  conditioning: "#EAB308", // yellow — cardio/functional
} as const;

// ============================================================================
// SPLIT CONFIGS — figures per split type
// ============================================================================

type FigureConfig = {
  upperColor: string;
  lowerColor: string;
  label?: string;
};

type SplitConfig = {
  figures: FigureConfig[];
};

function getSplitConfig(splitType: string): SplitConfig {
  switch (splitType) {
    case "full_body":
      return {
        figures: [
          { upperColor: ZONE_COLORS.full, lowerColor: ZONE_COLORS.full, label: "Пн" },
          { upperColor: ZONE_COLORS.full, lowerColor: ZONE_COLORS.full, label: "Ср" },
          { upperColor: ZONE_COLORS.full, lowerColor: ZONE_COLORS.full, label: "Пт" },
        ],
      };

    case "upper_lower":
      return {
        figures: [
          { upperColor: ZONE_COLORS.upper, lowerColor: ZONE_COLORS.muted, label: "Верх" },
          { upperColor: ZONE_COLORS.muted, lowerColor: ZONE_COLORS.lower, label: "Низ" },
        ],
      };

    case "push_pull_legs":
      return {
        figures: [
          { upperColor: ZONE_COLORS.push, lowerColor: ZONE_COLORS.muted, label: "Жим" },
          { upperColor: ZONE_COLORS.pull, lowerColor: ZONE_COLORS.muted, label: "Тяга" },
          { upperColor: ZONE_COLORS.muted, lowerColor: ZONE_COLORS.lower, label: "Ноги" },
        ],
      };

    case "bro_split":
      return {
        figures: [
          { upperColor: ZONE_COLORS.chest, lowerColor: ZONE_COLORS.muted, label: "Грудь" },
          { upperColor: ZONE_COLORS.back, lowerColor: ZONE_COLORS.muted, label: "Спина" },
          { upperColor: ZONE_COLORS.muted, lowerColor: ZONE_COLORS.lower, label: "Ноги" },
          { upperColor: ZONE_COLORS.shoulders, lowerColor: ZONE_COLORS.muted, label: "Плечи" },
          { upperColor: ZONE_COLORS.arms, lowerColor: ZONE_COLORS.muted, label: "Руки" },
        ],
      };

    case "conditioning":
      return {
        figures: [
          { upperColor: ZONE_COLORS.conditioning, lowerColor: ZONE_COLORS.conditioning, label: "Кр1" },
          { upperColor: ZONE_COLORS.conditioning, lowerColor: ZONE_COLORS.conditioning, label: "Кр2" },
          { upperColor: ZONE_COLORS.conditioning, lowerColor: ZONE_COLORS.conditioning, label: "Кр3" },
        ],
      };

    // Fallback for unknown split types (strength_focus, lower_focus, etc.)
    default:
      return {
        figures: [
          { upperColor: ZONE_COLORS.full, lowerColor: ZONE_COLORS.full },
          { upperColor: ZONE_COLORS.full, lowerColor: ZONE_COLORS.full },
          { upperColor: ZONE_COLORS.full, lowerColor: ZONE_COLORS.full },
        ],
      };
  }
}

// ============================================================================
// VISUAL SPLIT PREVIEW COMPONENT
// ============================================================================

interface VisualSplitPreviewProps {
  splitType: string;
  style?: React.CSSProperties;
}

export function VisualSplitPreview({ splitType, style }: VisualSplitPreviewProps) {
  const config = getSplitConfig(splitType);
  const figureCount = config.figures.length;
  // Slightly smaller figures for bro_split (5 figures)
  const figureSize = figureCount > 3 ? 28 : 34;

  return (
    <div style={{ ...styles.container, ...style }}>
      <div style={styles.figuresRow}>
        {config.figures.map((fig, idx) => (
          <div key={idx} style={styles.figureWrap}>
            <MiniBodySvg
              upperColor={fig.upperColor}
              lowerColor={fig.lowerColor}
              size={figureSize}
            />
            {fig.label && (
              <span
                style={{
                  ...styles.figureLabel,
                  color: fig.upperColor !== ZONE_COLORS.muted
                    ? fig.upperColor
                    : fig.lowerColor !== ZONE_COLORS.muted
                      ? fig.lowerColor
                      : "#94A3B8",
                }}
              >
                {fig.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    paddingTop: 4,
  },
  figuresRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 16,
    flexWrap: "nowrap",
  },
  figureWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  figureLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    lineHeight: 1,
  },
};
