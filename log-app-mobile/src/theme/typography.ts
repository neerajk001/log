import { StyleSheet, type TextStyle } from "react-native";
import type { Palette } from "./colors";

/**
 * Typography scale. Uses the platform system font (SF Pro / Roboto), which
 * closely matches the design's geometric sans. Swap `fontFamily` here to move
 * the whole app onto a custom face later.
 *
 * Text colors come from the palette, so use `makeTypography(colors)` (or the
 * `typography` field from `useTheme()`) instead of the static `typography`
 * export below. Numbers/dates/measurements still render in monospace via the
 * components that display them — see design-system.md.
 */
export const fontFamily = undefined;

/**
 * Monospaced figures everywhere numbers render, so values don't shift width
 * as they load (e.g. "—" → "82.5"). This is the zero-cost version of the
 * design-system rule "every number renders monospace" — no custom font
 * download, just the system font's tabular figures.
 */
const tabularNumbers: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

export function makeTypography(colors: Palette) {
  return StyleSheet.create({
    brand: {
      fontFamily,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.3,
      color: colors.text,
    },
    h1: {
      fontFamily,
      fontSize: 28,
      fontWeight: "700",
      letterSpacing: -0.4,
      color: colors.text,
      ...tabularNumbers,
    },
    h2: {
      fontFamily,
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: colors.text,
      ...tabularNumbers,
    },
    h3: {
      fontFamily,
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      ...tabularNumbers,
    },
    sectionLabel: {
      fontFamily,
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      ...tabularNumbers,
    },
    body: {
      fontFamily,
      fontSize: 15,
      fontWeight: "400",
      color: colors.text,
      ...tabularNumbers,
    },
    bodyStrong: {
      fontFamily,
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      ...tabularNumbers,
    },
    small: {
      fontFamily,
      fontSize: 13,
      fontWeight: "400",
      color: colors.textDim,
      ...tabularNumbers,
    },
    caption: {
      fontFamily,
      fontSize: 11,
      fontWeight: "600",
      color: colors.textDim,
      letterSpacing: 0.4,
      ...tabularNumbers,
    },
    metric: {
      fontFamily,
      fontSize: 26,
      fontWeight: "700",
      letterSpacing: -0.6,
      color: colors.text,
      ...tabularNumbers,
    },
    metricUnit: {
      fontFamily,
      fontSize: 13,
      fontWeight: "500",
      color: colors.textDim,
      ...tabularNumbers,
    },
    button: {
      fontFamily,
      fontSize: 16,
      fontWeight: "600",
    },
    tabLabel: {
      fontFamily,
      fontSize: 11,
      fontWeight: "600",
    },
  });
}

export type TypographyScale = ReturnType<typeof makeTypography>;
