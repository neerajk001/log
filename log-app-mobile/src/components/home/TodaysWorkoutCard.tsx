import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, IconBadge, Tag } from "../ui/primitives";

/**
 * Today's prescribed session as a single strip: day title, exercise count and
 * muscle tags on the left, one "Log" action on the right. Tapping the strip
 * opens the day; the button jumps straight into logging it.
 */
export function TodaysWorkoutCard({
  dayName,
  exerciseCount,
  muscles,
  onLogLift,
  onOpenDay,
}: {
  dayName: string;
  exerciseCount: number;
  muscles: string[];
  onLogLift: () => void;
  onOpenDay: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const tones = [
    { bg: colors.amberSoft, text: colors.amber },
    { bg: colors.blueSoft, text: colors.blue },
    { bg: colors.purpleSoft, text: colors.purple },
    { bg: colors.tealSoft, text: colors.teal },
    { bg: colors.pinkSoft, text: colors.pink },
  ];

  return (
    <Card padded={false} style={styles.card}>
      <Pressable
        onPress={onOpenDay}
        accessibilityRole="button"
        accessibilityLabel={`Open ${dayName}`}
        style={styles.row}
      >
        <IconBadge name="barbell" bg={colors.primarySoft} color={colors.primary} size={44} rounded={false} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {dayName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.bottom}>
        <View style={styles.tags}>
          {muscles.slice(0, 3).map((m, i) => (
            <Tag
              key={m}
              label={m}
              bg={tones[i % tones.length].bg}
              text={tones[i % tones.length].text}
            />
          ))}
        </View>
        <Button
          label="Log workout"
          icon="arrow-forward"
          iconPosition="trailing"
          size="sm"
          onPress={onLogLift}
          style={styles.logButton}
        />
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { overflow: "hidden", borderColor: t.colors.cardBorder },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    bottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    logButton: { flexShrink: 0 },
    text: { flex: 1, gap: 3, minWidth: 0 },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: t.colors.text,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    subtitle: { ...t.typography.small, color: t.colors.textDim },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, flexShrink: 1, minWidth: 0 },
  }),
);
