import type { Palette } from "./colors";

/**
 * The mint-on-black brand surface used by first-run onboarding (the hero, the
 * intro carousel and the three setup steps).
 *
 * It exposes exactly the same token keys as the app palettes, which means every
 * themed primitive — buttons, option cards, fields, the step scaffold — renders
 * in brand colours inside a `BrandThemeProvider` with no component changes. It
 * is NOT a user-selectable scheme; the app keeps its own palette everywhere
 * else.
 */
export const brandPalette: Palette = {
  // Surfaces
  bg: "#0A0B0B",
  surface: "#15191B",
  surfaceAlt: "#1E2325",
  border: "#242B2D",
  borderStrong: "#394143",

  // Text
  text: "#F2F3F0",
  textDim: "#A9B0AE",
  textMuted: "#7C8482",
  onPrimary: "#0C150C",

  // Brand — mint
  primary: "#BEE3B6",
  primarySoft: "rgba(190,227,182,0.12)",
  primarySoftBorder: "rgba(190,227,182,0.50)",

  // Semantic
  success: "#BEE3B6",
  successSoft: "rgba(190,227,182,0.12)",
  danger: "#F08A7A",
  dangerSoft: "rgba(240,138,122,0.14)",
  warning: "#E9C46A",
  warningSoft: "rgba(233,196,106,0.14)",

  // Accent pairs
  blue: "#5B9BF5",
  blueSoft: "rgba(91,155,245,0.14)",
  orange: "#F0954A",
  orangeSoft: "rgba(240,149,74,0.14)",
  green: "#BEE3B6",
  greenSoft: "rgba(190,227,182,0.12)",
  purple: "#9B86F5",
  purpleSoft: "rgba(155,134,245,0.14)",
  pink: "#F58FB4",
  pinkSoft: "rgba(245,143,180,0.14)",
  teal: "#5BD6C4",
  tealSoft: "rgba(91,214,196,0.14)",
  amber: "#E9C46A",
  amberSoft: "rgba(233,196,106,0.14)",

  // Chart palette
  chartBar: "#3A4245",
  chartBarActive: "#BEE3B6",
  chart1: "#BEE3B6",
  chart2: "#9B86F5",
  chart3: "#5B9BF5",
  chart4: "#5BD6C4",
  chart5: "#F58FB4",
  chartTrack: "#242B2D",

  // Tags
  tagNeutralBg: "#1E2325",
  tagNeutralText: "#A9B0AE",

  // Misc
  overlay: "rgba(0,0,0,0.6)",
  white: "#FFFFFF",
};
