import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, IconBadge, ProgressBar, Tag } from "../ui/primitives";

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  logged: boolean;
}

/**
 * Today's prescribed session as the screen's lead card: day name, set progress,
 * a jump into logging, and an inline exercise breakdown. Hidden entirely by the
 * screen when there is no active plan.
 */
export function TodaysWorkoutCard({
  dayName,
  exercises,
  done,
  total,
  onContinue,
}: {
  dayName: string;
  exercises: WorkoutExercise[];
  done: number;
  total: number;
  onContinue: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const status =
    done <= 0
      ? { label: "Not started", bg: colors.tagNeutralBg, text: colors.tagNeutralText }
      : done >= total
        ? { label: "Complete", bg: colors.successSoft, text: colors.success }
        : { label: "In Progress", bg: colors.warningSoft, text: colors.warning };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconBadge name="barbell" bg={colors.primarySoft} color={colors.primary} size={30} rounded={false} />
          <Text style={typography.caption}>Today&apos;s Workout</Text>
        </View>
        <Tag label={status.label} bg={status.bg} text={status.text} />
      </View>

      <Text style={typography.h1} numberOfLines={1}>
        {dayName}
      </Text>
      <Text style={typography.small}>
        {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"} · {done}/{total} sets
        completed
      </Text>

      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <ProgressBar value={done} max={Math.max(1, total)} />
        </View>
        <Text style={styles.pct}>{pct}%</Text>
      </View>

      {expanded ? (
        <View style={styles.exList}>
          {exercises.map((ex) => (
            <View key={ex.name} style={styles.exRow}>
              <Ionicons
                name={ex.logged ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={ex.logged ? colors.success : colors.textMuted}
              />
              <Text style={[typography.small, styles.exName]} numberOfLines={1}>
                {ex.name}
              </Text>
              <Text style={typography.caption}>
                {ex.sets} × {ex.reps}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.buttons}>
        <Button label="Continue Workout" icon="play" onPress={onContinue} style={styles.flex} />
        <Button
          label="View Exercises"
          icon={expanded ? "chevron-up" : "list"}
          variant="outline"
          onPress={() => setExpanded((open) => !open)}
          style={styles.flex}
        />
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { gap: spacing.sm, borderColor: t.colors.primarySoftBorder },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
    progressBar: { flex: 1 },
    pct: { ...t.typography.caption, color: t.colors.textDim, minWidth: 34, textAlign: "right" },
    exList: { gap: spacing.sm, marginTop: spacing.xs },
    exRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    exName: { flex: 1, color: t.colors.text },
    buttons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    flex: { flex: 1 },
  }),
);
