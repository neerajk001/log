import { lightColors, type Palette, type Scheme } from "../theme/colors";

export interface TagStyle {
  bg: string;
  text: string;
}

/** Subset of theme state that tag styling needs (kept narrow for tests). */
export interface TagTheme {
  colors: Palette;
  scheme: Scheme;
}

const LIGHT_TAG_THEME: TagTheme = { colors: lightColors, scheme: "light" };

type Accent = "pink" | "blue" | "purple" | "green" | "amber" | "teal" | "neutral";

const TAG_BG_KEY: Record<Accent, keyof Palette> = {
  pink: "pinkSoft",
  blue: "blueSoft",
  purple: "purpleSoft",
  green: "greenSoft",
  amber: "amberSoft",
  teal: "tealSoft",
  neutral: "tagNeutralBg",
};

/** Vivid-on-light text colors (unchanged from the original static styles). */
const TAG_TEXT_LIGHT: Record<Accent, string> = {
  pink: "#D6336C",
  blue: "#2563EB",
  purple: "#6D4AEF",
  green: "#1A8F5E",
  amber: "#B4740A",
  teal: "#0B7C85",
  neutral: lightColors.tagNeutralText,
};

/** Brightened text colors for both dark variants. */
const TAG_TEXT_DARK: Record<Accent, string> = {
  pink: "#F9A8D4",
  blue: "#93C5FD",
  purple: "#C4B5FD",
  green: "#6EE7B7",
  amber: "#FCD34D",
  teal: "#5EEAD4",
  neutral: "#94A3B8",
};

const MUSCLE_ACCENTS: Record<string, Accent> = {
  Chest: "pink",
  Back: "blue",
  Shoulders: "purple",
  Biceps: "green",
  Triceps: "green",
  Quads: "amber",
  Hamstrings: "amber",
  Glutes: "amber",
  Calves: "amber",
  Core: "teal",
};

function toTagStyle(accent: Accent, theme: TagTheme): TagStyle {
  const textTable = theme.scheme === "light" ? TAG_TEXT_LIGHT : TAG_TEXT_DARK;
  return { bg: theme.colors[TAG_BG_KEY[accent]], text: textTable[accent] };
}

export function muscleTagStyle(muscle: string, theme: TagTheme = LIGHT_TAG_THEME): TagStyle {
  return toTagStyle(MUSCLE_ACCENTS[muscle] ?? "neutral", theme);
}

export function typeTagStyle(
  type: "Compound" | "Isolation" | string,
  theme: TagTheme = LIGHT_TAG_THEME,
): TagStyle {
  if (type === "Isolation") return toTagStyle("purple", theme);
  return toTagStyle("neutral", theme);
}
