import React from "react";

/**
 * Astronaut base — draws the suit, visor, backpack, belt, legs, arms and a prop slot.
 * Role components below just pass different icon/prop builders + accent colors.
 *
 * Props:
 *  - size: px (number) — overall SVG size (default 256)
 *  - accent: hex string — role color
 *  - icon: "wrench" | "molecule" | "star" | "check" | "shield" | "food"
 *  - propType: "tablet" | "shield" | "crate"
 *  - decor: boolean — floating pixels (default true)
 */
export function Astronaut({
  size = 256,
  accent = "#3A7BFF",
  icon = "check",
  propType = "tablet",
  decor = true,
}) {
  const stroke = "#1A1A1A";
  const suit = "#FFFFFF";
  const panel = "#EDEFF3";
  const visor = "#2C2F33";
  const glare = "#A7B3C6";

  // Helper: chest icon path(s)
  const ChestIcon = () => {
    switch (icon) {
      case "wrench":
        return (
          <path
            d="M13 9l4 4m-1.2-6.4a3.2 3.2 0 11-2.6 2.6L7.6 7.6 5 10.2 4 9.2 6.7 6.5 6.5 4l1-1 2.6 2.6z"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "molecule":
        return (
          <>
            <circle cx="8" cy="12" r="2" fill={stroke} />
            <circle cx="16" cy="11" r="2" fill={stroke} />
            <circle cx="12" cy="7" r="2" fill={stroke} />
            <path
              d="M9.8 10.8L11 9m1.2 2.7L14 12m-2.2-3.6l1.4 1.1"
              stroke={stroke}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </>
        );
      case "star":
        return (
          <path
            d="M12 6l2 4 4 .6-3 2.9.7 4.2L12 15l-3.7 2.7.7-4.2-3-2.9 4-.6z"
            fill={stroke}
          />
        );
      case "check":
        return (
          <path
            d="M6.5 12.5l3.5 3.5 7-7"
            fill="none"
            stroke={stroke}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "shield":
        return (
          <path
            d="M12 6l6 2v4.2c0 3-2.4 5.6-6 7.8-3.6-2.2-6-4.8-6-7.8V8z"
            fill={stroke}
          />
        );
      case "food":
        return (
          <>
            <path
              d="M9 14c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3-3-1.3-3-3z"
              fill={stroke}
            />
            <path
              d="M12 9.2c1.2-1.6 2.2-1.6 3.2 0"
              fill="none"
              stroke={stroke}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </>
        );
      default:
        return null;
    }
  };

  // Helper: right-hand prop
  const RightProp = () => {
    if (propType === "shield") {
      return (
        <g transform="translate(170,136)">
          <rect
            x="0"
            y="0"
            rx="10"
            ry="10"
            width="60"
            height="76"
            fill={panel}
            stroke={stroke}
            strokeWidth="6"
          />
          <path
            d="M30 20l18 6v12c0 9-7.3 16.7-18 23.2-10.7-6.5-18-14.2-18-23.2V26z"
            fill={accent}
            stroke={stroke}
            strokeWidth="4"
          />
        </g>
      );
    }
    if (propType === "crate") {
      return (
        <g transform="translate(170,148)">
          <rect
            x="0"
            y="0"
            rx="12"
            ry="12"
            width="70"
            height="64"
            fill="#FF5A5A"
            stroke={stroke}
            strokeWidth="6"
          />
          {/* strap */}
          <rect x="30" y="-8" width="10" height="80" fill={stroke} />
          {/* food glyph */}
          <circle cx="35" cy="32" r="12" fill={panel} />
          <path
            d="M35 26c4-5 6-5 9 0"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
    }
    // default tablet
    return (
      <g transform="translate(176,148)">
        <rect
          x="0"
          y="0"
          rx="10"
          ry="10"
          width="64"
          height="52"
          fill={panel}
          stroke={stroke}
          strokeWidth="6"
        />
        <path
          d="M10 34c10-10 20-10 30 0"
          fill="none"
          stroke={accent}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="50" cy="40" r="3" fill={accent} />
      </g>
    );
  };

  // Floating confetti/pixels
  const Decor = () =>
    decor ? (
      <g>
        <rect x="196" y="116" width="10" height="10" fill={accent} />
        <rect x="216" y="120" width="8" height="8" fill="#FFC83D" />
        <rect x="206" y="136" width="8" height="8" fill="#8BD3F7" />
      </g>
    ) : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role="img"
      aria-label="Astronaut character"
    >
      {/* base shadow */}
      <ellipse cx="128" cy="236" rx="70" ry="10" fill="#000" opacity="0.2" />
      {/* backpack */}
      <g transform="translate(44,84)">
        <rect
          x="-24"
          y="10"
          width="52"
          height="70"
          rx="14"
          ry="14"
          fill={panel}
          stroke={stroke}
          strokeWidth="6"
        />
        {/* cable */}
        <path
          d="M22,24 c38,-26 76,-26 114,0"
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>

      {/* head + visor */}
      <g transform="translate(36,12)">
        {/* helmet */}
        <rect
          x="20"
          y="8"
          width="164"
          height="108"
          rx="28"
          ry="28"
          fill={suit}
          stroke={stroke}
          strokeWidth="6"
        />
        {/* ear pods */}
        <rect x="2" y="52" width="32" height="28" rx="8" fill={accent} stroke={stroke} strokeWidth="6" />
        <rect x="170" y="52" width="32" height="28" rx="8" fill={accent} stroke={stroke} strokeWidth="6" />
        {/* visor */}
        <rect
          x="34"
          y="28"
          width="136"
          height="70"
          rx="18"
          fill={visor}
          stroke={stroke}
          strokeWidth="6"
        />
        {/* glare */}
        <rect x="50" y="40" width="18" height="10" rx="4" fill={glare} opacity="0.7" />
        <rect x="72" y="40" width="12" height="10" rx="4" fill={glare} opacity="0.4" />
      </g>

      {/* torso */}
      <g transform="translate(48,120)">
        <rect
          x="0"
          y="0"
          width="160"
          height="92"
          rx="16"
          fill={suit}
          stroke={stroke}
          strokeWidth="6"
        />
        {/* chest panel */}
        <g transform="translate(54,18)">
          <rect
            x="0"
            y="0"
            width="52"
            height="40"
            rx="8"
            fill={accent}
            stroke={stroke}
            strokeWidth="6"
          />
          <g transform="translate(8,8) scale(1)">
            <ChestIcon />
          </g>
        </g>

        {/* belt */}
        <rect
          x="20"
          y="58"
          width="120"
          height="16"
          rx="8"
          fill={panel}
          stroke={stroke}
          strokeWidth="6"
        />
        <rect
          x="92"
          y="54"
          width="24"
          height="24"
          rx="6"
          fill={accent}
          stroke={stroke}
          strokeWidth="6"
        />
      </g>

      {/* arms */}
      <g transform="translate(36,120)">
        {/* left arm */}
        <rect
          x="0"
          y="18"
          width="36"
          height="24"
          rx="10"
          fill={suit}
          stroke={stroke}
          strokeWidth="6"
        />
        <rect x="26" y="18" width="18" height="24" rx="10" fill={panel} stroke={stroke} strokeWidth="6" />
      </g>

      {/* right arm + prop */}
      <g transform="translate(174,120)">
        <rect
          x="0"
          y="18"
          width="36"
          height="24"
          rx="10"
          fill={suit}
          stroke={stroke}
          strokeWidth="6"
        />
        <rect x="-6" y="18" width="18" height="24" rx="10" fill={panel} stroke={stroke} strokeWidth="6" />
      </g>

      {/* legs */}
      <g transform="translate(76,212)">
        <rect
          x="0"
          y="0"
          width="36"
          height="40"
          rx="6"
          fill={suit}
          stroke={stroke}
          strokeWidth="6"
        />
        <rect
          x="68"
          y="0"
          width="36"
          height="40"
          rx="6"
          fill={suit}
          stroke={stroke}
          strokeWidth="6"
        />
        {/* leg bands pattern */}
        <rect x="4" y="16" width="28" height="8" rx="4" fill={accent} />
        <rect x="72" y="16" width="28" height="8" rx="4" fill={accent} />
      </g>

      {/* prop (right hand) */}
      <RightProp />

      {/* decor */}
      <Decor />
    </svg>
  );
}

/* ------------------- ROLE WRAPPERS ------------------- */

export const Engineer = ({ size = 256, decor = true }) => (
  <Astronaut size={size} decor={decor} accent="#FF8D3A" icon="wrench" propType="tablet" />
);

export const Research = ({ size = 256, decor = true }) => (
  <Astronaut size={size} decor={decor} accent="#27C9B8" icon="molecule" propType="tablet" />
);

export const StationDirector = ({ size = 256, decor = true }) => (
  <Astronaut size={size} decor={decor} accent="#FFC83D" icon="star" propType="tablet" />
);

export const Officer = ({ size = 256, decor = true }) => (
  <Astronaut size={size} decor={decor} accent="#3A7BFF" icon="check" propType="tablet" />
);

export const Guard = ({ size = 256, decor = true }) => (
  <Astronaut size={size} decor={decor} accent="#2B3A67" icon="shield" propType="shield" />
);

export const FoodSupplier = ({ size = 256, decor = true }) => (
  <Astronaut size={size} decor={decor} accent="#6BCB77" icon="food" propType="crate" />
);

/* Optional: a simple role registry for dynamic rendering */
export const ROLE_COMPONENTS = {
  Engineer,
  Research,
  StationDirector,
  Officer,
  Guard,
  FoodSupplier,
};
