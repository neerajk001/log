import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { IconBadge, type IoniconName } from "./ui/primitives";

/** Compact stat tile: pastel icon, big value, caption (Insights / History). */
export function StatTile({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  style,
}: {
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.tile, style]}>
      <IconBadge name={icon} bg={iconBg} color={iconColor} size={32} rounded={false} />
      <Text style={[typography.h3, styles.value]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[typography.caption, styles.label]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      minWidth: 0,
    },
    value: { fontSize: 18, fontWeight: "700" },
    label: { color: t.colors.textDim, lineHeight: 14 },
  }),
);
