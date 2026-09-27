import { StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { IconBadge, ProgressBar, type IoniconName } from "./ui/primitives";

/** Orange tinted plan-day banner: icon, day name, muscle groups, progress. */
export function DayBanner({
  dayName,
  muscles,
  completed,
  total,
  icon = "barbell",
}: {
  dayName: string;
  muscles: string[];
  completed: number;
  total: number;
  icon?: IoniconName;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.banner}>
      <IconBadge name={icon} bg={colors.primarySoft} color={colors.primary} size={46} rounded={false} />
      <View style={styles.text}>
        <Text style={typography.h2} numberOfLines={1}>
          {dayName}
        </Text>
        {muscles.length > 0 ? (
          <Text style={[typography.small, styles.muscles]} numberOfLines={1}>
            {muscles.join(" • ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.progress}>
        <Text style={[typography.small, styles.progressLabel]}>
          {completed} / {total} exercises
        </Text>
        <ProgressBar value={completed} max={Math.max(1, total)} />
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.primarySoft,
      borderRadius: radii.lg,
      padding: spacing.lg,
    },
    text: { flex: 1, gap: 2 },
    muscles: { color: t.colors.textDim },
    progress: { width: 96, gap: 6 },
    progressLabel: { textAlign: "right", color: t.colors.textDim, fontSize: 11 },
  }),
);
