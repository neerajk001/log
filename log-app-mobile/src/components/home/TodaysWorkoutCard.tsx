import { StyleSheet, Text, View } from "react-native";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, IconBadge } from "../ui/primitives";

/**
 * Today's prescribed session as one slim strip: day name, the day's exercises,
 * and a single "Log Lift" action. Hidden by the screen when there's no plan.
 */
export function TodaysWorkoutCard({
  dayName,
  exerciseNames,
  done,
  total,
  onLogLift,
}: {
  dayName: string;
  exerciseNames: string[];
  done: number;
  total: number;
  onLogLift: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <Card padded={false} style={styles.strip}>
      <IconBadge name="barbell" bg={colors.primarySoft} color={colors.primary} size={30} rounded={false} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text style={typography.bodyStrong} numberOfLines={1}>
            {dayName}
          </Text>
          <Text style={styles.sets}>{done}/{total} sets</Text>
        </View>
        <Text style={[typography.caption, styles.exercises]} numberOfLines={1}>
          {exerciseNames.length > 0 ? exerciseNames.join(", ") : "No exercises in this day"}
        </Text>
      </View>
      <Button label="Log Lift" icon="add" size="sm" onPress={onLogLift} />
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    strip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderColor: t.colors.primarySoftBorder,
    },
    text: { flex: 1, gap: 2, minWidth: 0 },
    titleRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    sets: { ...t.typography.caption, color: t.colors.textMuted },
    exercises: { color: t.colors.textDim },
  }),
);
