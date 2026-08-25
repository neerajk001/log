import { StyleSheet } from "react-native";
import { colors } from "./colors";

export const fonts = {
  oswald: {
    regular: "Oswald",
    semiBold: "Oswald-SemiBold",
    bold: "Oswald-Bold",
  },
  inter: {
    regular: "Inter",
    medium: "Inter-Medium",
    semiBold: "Inter-SemiBold",
  },
  jetbrains: {
    regular: "JetBrainsMono",
    medium: "JetBrainsMono-Medium",
    bold: "JetBrainsMono-Bold",
  },
} as const;

export const typography = StyleSheet.create({
  screenTitle: {
    fontFamily: fonts.oswald.semiBold,
    fontSize: 28,
    color: colors.chalk,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontFamily: fonts.jetbrains.regular,
    fontSize: 10,
    color: colors.chalkDim,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  data: {
    fontFamily: fonts.jetbrains.regular,
    fontSize: 28,
    color: colors.chalk,
  },
  dataSmall: {
    fontFamily: fonts.jetbrains.regular,
    fontSize: 20,
    color: colors.chalk,
  },
  dataMuted: {
    fontFamily: fonts.jetbrains.regular,
    fontSize: 20,
    color: colors.chalkDim,
  },
  body: {
    fontFamily: fonts.inter.regular,
    fontSize: 16,
    color: colors.chalk,
  },
  bodyLabel: {
    fontFamily: fonts.inter.medium,
    fontSize: 14,
    color: colors.chalkDim,
  },
  bodySmall: {
    fontFamily: fonts.inter.regular,
    fontSize: 12,
    color: colors.steel,
  },
  tabLabel: {
    fontFamily: fonts.inter.medium,
    fontSize: 13,
  },
  verdicStamp: {
    fontFamily: fonts.oswald.bold,
    fontSize: 20,
    color: colors.rust,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
} as const);
