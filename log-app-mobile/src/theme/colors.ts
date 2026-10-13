/**
 * Theme palettes. Every scheme exposes the SAME token keys (`Palette`), so
 * components never branch on theme — they read tokens via `useTheme()`.
 *
 * The app family is the mint-on-black brand system first established on the
 * onboarding screens (`src/theme/brand.ts`):
 *
 * - `dark`: the brand surface — near-black "ink" backgrounds, mint action
 *   color, warm off-white text. This is the canonical look.
 * - `trueBlack`: the same family with pure-black backgrounds for OLED.
 * - `light`: a light counterpart for daylight use; the action color stays in
 *   the green family but darkens so text/icons remain legible on white.
 *
 * Rules carried over from the design system: a single accent (mint in the
 * dark family, green on light) drives actions, navigation and progress;
 * accent hues (blue/purple/amber/…) are reserved for metric badges and tags.
 */

export type Scheme = "light" | "dark" | "trueBlack";

/** What the user picks in Settings. `system` follows the OS color scheme. */
export type ThemePreference = "system" | Scheme;

export const THEME_STORAGE_KEY = "log.theme-preference";

/** Mint brand constants shared by the dark family. */
const MINT = "#BEE3B6";
const ON_MINT = "#0C150C";

const light = {
  // Surfaces — warm off-white with a faint green cast
  bg: "#F4F6F2",
  surface: "#FFFFFF",
  surfaceAlt: "#EDF1EA",
  border: "#E3E8DE",
  borderStrong: "#D1D8CB",
  /** Minimal card outline — a low-opacity tint of the action color. */
  cardBorder: "rgba(47,133,90,0.22)",

  // Text
  text: "#151A16",
  textDim: "#68756D",
  textMuted: "#9BA69E",
  onPrimary: "#FFFFFF",

  // Brand — green action color for daylight contrast
  primary: "#2F855A",
  primarySoft: "#E4F2E9",
  primarySoftBorder: "#C6E2D2",

  // Semantic
  success: "#2F9E68",
  successSoft: "#E4F5EC",
  danger: "#E5484D",
  dangerSoft: "#FDECEC",
  warning: "#D98A00",
  warningSoft: "#FBF2E0",

  // Accent pairs (icon badges, metrics)
  blue: "#3B82F6",
  blueSoft: "#E8F1FE",
  orange: "#E07A3F",
  orangeSoft: "#FBEDE4",
  green: "#2F9E68",
  greenSoft: "#E4F5EC",
  purple: "#7C5CFC",
  purpleSoft: "#EFEBFE",
  pink: "#EC4899",
  pinkSoft: "#FCE9F3",
  teal: "#0E9AA5",
  tealSoft: "#E4F5F7",
  amber: "#D98A00",
  amberSoft: "#FBF2E0",

  // Chart palette
  chartBar: "#CFE3D6",
  chartBarActive: "#2F855A",
  chart1: "#2F855A",
  chart2: "#7C5CFC",
  chart3: "#3B82F6",
  chart4: "#0E9AA5",
  chart5: "#EC4899",
  chartTrack: "#E8EDE5",

  // Tags
  tagNeutralBg: "#EDF1EA",
  tagNeutralText: "#64748B",

  // Misc
  overlay: "rgba(17,19,24,0.45)",
  white: "#FFFFFF",
} as const;

export type Palette = {
  [K in keyof typeof light]: string;
};

export const lightColors: Palette = { ...light };

export const darkColors: Palette = {
  // Surfaces — the brand "ink" family
  bg: "#0A0B0B",
  surface: "#15191B",
  surfaceAlt: "#1E2325",
  border: "#242B2D",
  borderStrong: "#394143",
  /** Minimal card outline — a low-opacity tint of the mint action color. */
  cardBorder: "rgba(190,227,182,0.16)",

  // Text — warm off-white, dimmed greys
  text: "#F2F3F0",
  textDim: "#A9B0AE",
  textMuted: "#7C8482",
  onPrimary: ON_MINT,

  // Brand — mint action color, tinted translucent surfaces
  primary: MINT,
  primarySoft: "rgba(190,227,182,0.12)",
  primarySoftBorder: "rgba(190,227,182,0.50)",

  // Semantic — mint for positive, muted coral/amber for alerts
  success: MINT,
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
  green: MINT,
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
  chartBarActive: MINT,
  chart1: MINT,
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

export const trueBlackColors: Palette = {
  // Surfaces — pure black, one step darker than `dark`
  bg: "#000000",
  surface: "#0B0B0C",
  surfaceAlt: "#161618",
  border: "#232326",
  borderStrong: "#333336",
  /** Minimal card outline — a low-opacity tint of the mint action color. */
  cardBorder: "rgba(190,227,182,0.16)",

  // Text — neutral whites for max contrast
  text: "#F5F5F4",
  textDim: "#A8A8AE",
  textMuted: "#6E6E73",
  onPrimary: ON_MINT,

  // Brand — same mint action color on true black
  primary: MINT,
  primarySoft: "rgba(190,227,182,0.12)",
  primarySoftBorder: "rgba(190,227,182,0.50)",

  // Semantic
  success: MINT,
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
  green: MINT,
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
  chartBar: "#2E2E33",
  chartBarActive: MINT,
  chart1: MINT,
  chart2: "#9B86F5",
  chart3: "#5B9BF5",
  chart4: "#5BD6C4",
  chart5: "#F58FB4",
  chartTrack: "#1A1A1D",

  // Tags
  tagNeutralBg: "#1A1A1D",
  tagNeutralText: "#A8A8AE",

  // Misc
  overlay: "rgba(0,0,0,0.7)",
  white: "#FFFFFF",
};

export const palettes: Record<Scheme, Palette> = {
  light: lightColors,
  dark: darkColors,
  trueBlack: trueBlackColors,
};

export type ColorToken = keyof Palette;

/** Pure mapping: user preference + OS scheme -> concrete scheme. */
export function resolveTheme(
  preference: ThemePreference,
  systemScheme: "light" | "dark" | null | undefined,
): Scheme {
  if (preference === "system") {
    return systemScheme === "dark" ? "dark" : "light";
  }
  return preference;
}

/** True for both dark variants (StatusBar style, splash, etc.). */
export function isDarkScheme(scheme: Scheme): boolean {
  return scheme !== "light";
}

export function isValidPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark" || value === "trueBlack";
}
