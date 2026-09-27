import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";

export function BrandWordmark({ size = 22 }: { size?: number }) {
  const { colors, typography } = useTheme();
  return (
    <Text style={[typography.brand, { fontSize: size }]}>
      <Text>LogMy</Text>
      <Text style={{ color: colors.primary }}>Lift</Text>
    </Text>
  );
}

/**
 * Screen header with three shapes:
 * - `brand`  — LogMyLift wordmark on the left (Today / Lift).
 * - `page`   — large page title with optional subtitle (Insights / History / Plan).
 * - `detail` — back chevron, centered title, optional right action (pushed screens).
 */
export function ScreenHeader({
  variant = "page",
  title,
  subtitle,
  onBack,
  right,
  style,
}: {
  variant?: "brand" | "page" | "detail";
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  style?: object;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  if (variant === "brand") {
    return (
      <View style={[styles.row, { paddingTop: insets.top + spacing.sm }, style]}>
        <View style={styles.brandBlock}>
          <BrandWordmark />
          {subtitle ? <Text style={[typography.small, styles.brandSubtitle]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    );
  }

  if (variant === "detail") {
    return (
      <View style={[styles.detailWrap, { paddingTop: insets.top + spacing.sm }, style]}>
        <View style={styles.detailTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.detailCenter}>
            <Text style={[typography.h3, styles.detailTitle]} numberOfLines={1}>
              {title ?? ""}
            </Text>
            {subtitle ? (
              <Text style={[typography.small, styles.detailSubtitle]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.detailRight}>{right}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={[{ paddingTop: insets.top + spacing.sm }, style]}>
      <View style={styles.row}>
        <View style={styles.brandBlock}>
          <Text style={typography.h1} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[typography.small, styles.pageSubtitle]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
    },
    brandBlock: { flex: 1, flexShrink: 1, gap: 2, minWidth: 0 },
    brandSubtitle: { color: t.colors.textDim },
    pageSubtitle: { color: t.colors.textDim, marginTop: 2 },
    right: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 0, maxWidth: "62%" },

    detailWrap: { gap: spacing.sm, paddingHorizontal: spacing.screen },
    detailTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    backButton: { width: 32, height: 32, alignItems: "flex-start", justifyContent: "center", flexShrink: 0 },
    detailCenter: { flex: 1, alignItems: "center", minWidth: 0 },
    detailTitle: { textAlign: "center" },
    detailSubtitle: { textAlign: "center" },
    detailRight: { minWidth: 32, maxWidth: 88, alignItems: "flex-end", flexShrink: 0 },
  }),
);
