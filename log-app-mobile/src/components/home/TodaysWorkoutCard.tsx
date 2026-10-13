import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Button, Card, Divider, IconBadge, Tag, type IoniconName } from "../ui/primitives";
import { formatDuration, formatNumber } from "../../utils/derive";

function Stat({ icon, value, label }: { icon: IoniconName; value: string; label: string }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={colors.textDim} />
      <View style={styles.statText}>
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Text>
        <Text
          style={[typography.caption, styles.statLabel]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * Today's prescribed session (hidden by the screen when there's no plan): day
 * title, muscle tags and exercise preview up top, then count / duration / volume
 * with a single "Log Lift" action.
 */
export function TodaysWorkoutCard({
  dayName,
  exerciseNames,
  muscles,
  durationMin,
  volumeKg,
  onLogLift,
  onOpenDay,
}: {
  dayName: string;
  exerciseNames: string[];
  muscles: string[];
  durationMin: number;
  volumeKg: number;
  onLogLift: () => void;
  onOpenDay: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  // Three stats plus the button don't fit on narrow phones — drop the button
  // to its own row rather than letting the row overflow.
  const narrow = width < 380;

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
        style={styles.top}
      >
        <IconBadge name="barbell" bg={colors.primarySoft} color={colors.primary} size={44} rounded={false} />
        <View style={styles.topText}>
          <Text style={styles.title} numberOfLines={1}>
            {dayName}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {exerciseNames.length > 0 ? exerciseNames.join(", ") : "No exercises in this day"}
          </Text>
          {muscles.length > 0 ? (
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
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <Divider />

      <View style={[styles.bottom, narrow && styles.bottomStack]}>
        <View style={styles.stats}>
          <Stat icon="barbell-outline" value={String(exerciseNames.length)} label="exercises" />
          <View style={styles.vDivider} />
          <Stat icon="time-outline" value={formatDuration(durationMin)} label="duration" />
          <View style={styles.vDivider} />
          <Stat icon="flame" value={formatNumber(volumeKg)} label="volume (kg)" />
        </View>
        <Button
          label="Log Lift"
          icon="add"
          size="sm"
          onPress={onLogLift}
          style={narrow ? styles.fullButton : undefined}
        />
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { overflow: "hidden", borderColor: t.colors.cardBorder },
    top: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
    },
    topText: { flex: 1, gap: 3, minWidth: 0 },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: t.colors.text,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    preview: { ...t.typography.small, color: t.colors.textDim },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 3 },

    bottom: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
    bottomStack: { flexDirection: "column", alignItems: "stretch" },
    stats: { flexDirection: "row", alignItems: "center", flexGrow: 1, flexShrink: 1, minWidth: 0 },
    stat: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs, minWidth: 0 },
    statText: { flex: 1, minWidth: 0 },
    statValue: { fontSize: 15, fontWeight: "700", color: t.colors.text },
    statLabel: { color: t.colors.textDim },
    vDivider: {
      width: StyleSheet.hairlineWidth,
      height: 26,
      backgroundColor: t.colors.border,
      marginHorizontal: spacing.sm,
    },
    fullButton: { marginTop: spacing.md },
  }),
);
