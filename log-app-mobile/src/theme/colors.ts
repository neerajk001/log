/**
 * Theme palettes. Every scheme exposes the SAME token keys (`Palette`), so
 * components never branch on theme — they read tokens via `useTheme()`.
 *
 * - `light`: the current light palette (unchanged).
 * - `dark`: soft charcoal dark, aligned with `design-system.md`
 *   (`graphite` bg, `chalk` text, `rustSoft` accent-on-dark).
 * - `trueBlack`: pure-black backgrounds for max contrast / OLED.
 *
 * Rules carried over from the design system: the rust/orange family is the
 * only action color; green is reserved for positive-trend data.
 */

export type Scheme = "light" | "dark" | "trueBlack";

/** What the user picks in Settings. `system` follows the OS color scheme. */
export type ThemePreference = "system" | Scheme;

export const THEME_STORAGE_KEY = "log.theme-preference";

const light = {
  // Surfaces
  bg: "#F6F6F4",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F2F4",
  border: "#EAEAEC",
  borderStrong: "#DEDFE2",

  // Text
  text: "#14161A",
  textDim: "#8A8F98",
  textMuted: "#B4B8BF",
  onPrimary: "#FFFFFF",

  // Brand
  primary: "#F0552A",
  primarySoft: "#FDECE6",
  primarySoftBorder: "#F8D6C8",

  // Semantic
  success: "#22A06B",
  successSoft: "#E8F7EF",
  danger: "#E5484D",
  dangerSoft: "#FDECEC",
  warning: "#E08A00",
  warningSoft: "#FDF3E2",

  // Accent pairs (icon badges, metrics)
  blue: "#3B82F6",
  blueSoft: "#E8F1FE",
  orange: "#F0552A",
  orangeSoft: "#FEECE8",
  green: "#22A06B",
  greenSoft: "#E8F7EF",
  purple: "#7C5CFC",
  purpleSoft: "#EFEBFE",
  pink: "#EC4899",
  pinkSoft: "#FCE9F3",
  teal: "#0E9AA5",
  tealSoft: "#E4F5F7",
  amber: "#E08A00",
  amberSoft: "#FDF3E2",

  // Chart palette
  chartBar: "#C7D2FE",
  chartBarActive: "#4F7BF7",
  chart1: "#6366F1",
  chart2: "#8B5CF6",
  chart3: "#3B82F6",
  chart4: "#34C759",
  chart5: "#EC4899",
  chartTrack: "#EEF0F4",

  // Tags
  tagNeutralBg: "#EEF2F7",
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
  // Surfaces — graphite family from design-system.md
  bg: "#15171B",
  surface: "#1E2227",
  surfaceAlt: "#262B32",
  border: "#2C313A",
  borderStrong: "#3D434E",

  // Text — chalk family; muted maps to `steel`
  text: "#ECE8E0",
  textDim: "#9A978F",
  textMuted: "#5B6470",
  onPrimary: "#FFFFFF",

  // Brand — rustSoft stays readable on dark fills of primary
  primary: "#F0552A",
  primarySoft: "#3A2117",
  primarySoftBorder: "#5C3323",

  // Semantic — brightened text hues on tinted dark surfaces
  success: "#3DD68C",
  successSoft: "#0F2E22",
  danger: "#FF6369",
  dangerSoft: "#3A1D1F",
  warning: "#F5A524",
  warningSoft: "#33230A",

  // Accent pairs
  blue: "#60A5FA",
  blueSoft: "#16294D",
  orange: "#F0703F",
  orangeSoft: "#3A2117",
  green: "#3DD68C",
  greenSoft: "#0F2E22",
  purple: "#9D86FF",
  purpleSoft: "#241D4D",
  pink: "#F472B6",
  pinkSoft: "#3B1A2E",
  teal: "#2DD4BF",
  tealSoft: "#0C2B2E",
  amber: "#F5A524",
  amberSoft: "#33230A",

  // Chart palette
  chartBar: "#3A4356",
  chartBarActive: "#6B93FF",
  chart1: "#818CF8",
  chart2: "#A78BFA",
  chart3: "#60A5FA",
  chart4: "#3DD68C",
  chart5: "#F472B6",
  chartTrack: "#23272E",

  // Tags
  tagNeutralBg: "#23272E",
  tagNeutralText: "#94A3B8",

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

  // Text — neutral whites for max contrast
  text: "#F5F5F4",
  textDim: "#A8A8AE",
  textMuted: "#6E6E73",
  onPrimary: "#FFFFFF",

  // Brand
  primary: "#F0552A",
  primarySoft: "#2C1A12",
  primarySoftBorder: "#4A2A1D",

  // Semantic
  success: "#3DD68C",
  successSoft: "#0B241B",
  danger: "#FF6369",
  dangerSoft: "#2E1618",
  warning: "#F5A524",
  warningSoft: "#291C08",

  // Accent pairs
  blue: "#60A5FA",
  blueSoft: "#101F3A",
  orange: "#F0703F",
  orangeSoft: "#2C1A12",
  green: "#3DD68C",
  greenSoft: "#0B241B",
  purple: "#9D86FF",
  purpleSoft: "#1B1640",
  pink: "#F472B6",
  pinkSoft: "#2E1424",
  teal: "#2DD4BF",
  tealSoft: "#082225",
  amber: "#F5A524",
  amberSoft: "#291C08",

  // Chart palette
  chartBar: "#2E2E33",
  chartBarActive: "#6B93FF",
  chart1: "#818CF8",
  chart2: "#A78BFA",
  chart3: "#60A5FA",
  chart4: "#3DD68C",
  chart5: "#F472B6",
  chartTrack: "#1A1A1D",

  // Tags
  tagNeutralBg: "#1A1A1D",
  tagNeutralText: "#94A3B8",

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
