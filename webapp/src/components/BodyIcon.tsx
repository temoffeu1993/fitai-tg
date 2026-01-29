// webapp/src/components/BodyIcon.tsx
// SVG body silhouette with highlight for upper/lower/full body

import React from "react";

type Highlight = "full" | "upper" | "lower";

interface BodyIconProps {
  highlight: Highlight;
  size?: number;
  activeColor?: string;
  mutedColor?: string;
  style?: React.CSSProperties;
}

const DEFAULT_ACTIVE = "#F97316"; // Orange
const DEFAULT_MUTED = "rgba(255,255,255,0.15)";

export function BodyIcon({
  highlight,
  size = 32,
  activeColor = DEFAULT_ACTIVE,
  mutedColor = DEFAULT_MUTED,
  style,
}: BodyIconProps) {
  const upperColor = highlight === "lower" ? mutedColor : activeColor;
  const lowerColor = highlight === "upper" ? mutedColor : activeColor;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 28"
      fill="none"
      style={style}
    >
      {/* Head */}
      <circle cx="12" cy="3.5" r="3" fill={upperColor} />

      {/* Neck */}
      <rect x="10.5" y="6" width="3" height="2" rx="0.5" fill={upperColor} />

      {/* Torso */}
      <path
        d="M6 8.5C6 8.22 6.22 8 6.5 8H17.5C17.78 8 18 8.22 18 8.5V15C18 15.55 17.55 16 17 16H7C6.45 16 6 15.55 6 15V8.5Z"
        fill={upperColor}
      />

      {/* Arms */}
      <path
        d="M4.5 9C4.5 8.45 4.95 8 5.5 8H6V14H5C4.45 14 4 13.55 4 13V9.5C4 9.22 4.22 9 4.5 9Z"
        fill={upperColor}
      />
      <path
        d="M19.5 9C19.5 8.45 19.05 8 18.5 8H18V14H19C19.55 14 20 13.55 20 13V9.5C20 9.22 19.78 9 19.5 9Z"
        fill={upperColor}
      />

      {/* Hips */}
      <path
        d="M7 16H17V18.5C17 19.05 16.55 19.5 16 19.5H8C7.45 19.5 7 19.05 7 18.5V16Z"
        fill={lowerColor}
      />

      {/* Left Leg */}
      <path
        d="M7.5 19.5H11V27C11 27.28 10.78 27.5 10.5 27.5H8C7.45 27.5 7 27.05 7 26.5V20C7 19.72 7.22 19.5 7.5 19.5Z"
        fill={lowerColor}
      />

      {/* Right Leg */}
      <path
        d="M13 19.5H16.5C16.78 19.5 17 19.72 17 20V26.5C17 27.05 16.55 27.5 16 27.5H13.5C13.22 27.5 13 27.28 13 27V19.5Z"
        fill={lowerColor}
      />
    </svg>
  );
}

// Helper function to determine highlight based on splitType and day label
export function getDayHighlight(splitType: string, label: string): Highlight {
  // Full Body schemes — always full
  if (splitType === "full_body" || splitType === "conditioning") {
    return "full";
  }

  // Upper/Lower, PPL, Bro Split — parse label
  const lower = label.toLowerCase();

  // Legs / lower body keywords
  if (
    lower.includes("ног") ||
    lower.includes("низ") ||
    lower.includes("lower") ||
    lower.includes("legs") ||
    lower.includes("ягодиц") ||
    lower.includes("бёдр") ||
    lower.includes("бедр") ||
    lower.includes("икр")
  ) {
    return "lower";
  }

  // Upper body keywords
  if (
    lower.includes("верх") ||
    lower.includes("upper") ||
    lower.includes("груд") ||
    lower.includes("спин") ||
    lower.includes("плеч") ||
    lower.includes("рук") ||
    lower.includes("push") ||
    lower.includes("pull") ||
    lower.includes("бицепс") ||
    lower.includes("трицепс") ||
    lower.includes("chest") ||
    lower.includes("back") ||
    lower.includes("shoulder") ||
    lower.includes("arm")
  ) {
    return "upper";
  }

  // Default to full
  return "full";
}
