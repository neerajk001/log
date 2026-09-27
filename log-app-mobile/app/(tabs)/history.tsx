import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { StatTile } from "../../src/components/StatTile";
import { CalendarMonth } from "../../src/components/CalendarMonth";
import { Card, IconBadge, EmptyState, LoadingState, ErrorState, Tag, Divider } from "../../src/components/ui/primitives";
import { Chip, ChipRow, OverflowMenu } from "../../src/components/ui/controls";
import { useHistory } from "../../src/hooks/useHistory";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { formatLongDate } from "../../src/utils/date";
import { formatNumber, muscleGroupFor } from "../../src/utils/derive";
import { muscleTagStyle } from "../../src/utils/tags";

const RANGE_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 3650, label: "All time" },
];

export default function HistoryScreen() {
  const [rangeDays, setRangeDays] = useState(90);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const { colors, scheme, typography } = useTheme();
  const styles = useStyles();
  const tagTheme = { colors, scheme };
  const today = useCurrentDate();

  const {
    dailyLogs,
    activityLogs,
    groups,
    stats,
    loading,
    error,
    refetch,
    deleteDailyLog,
    deleteLiftLog,
    deleteActivity,
  } = useHistory(rangeDays);

  const rangeLabel = RANGE_OPTIONS.find((o) => o.days === rangeDays)?.label ?? "All time";

  const visibleGroups = useMemo(
    () => (selectedDate ? groups.filter((g) => g.date === selectedDate) : groups),
    [groups, selectedDate],
  );

  const strengthLabel = stats.strengthPct == null ? "—" : `${stats.strengthPct > 0 ? "+" : ""}${stats.strengthPct}%`;

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* FlatList (not ScrollView): "All time" can hold hundreds of day
          groups, so only the visible window is rendered. */}
      <FlatList
        data={visibleGroups}
        keyExtractor={(group) => group.date}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />}
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={6}
        ListHeaderComponent={
          <>
            <ScreenHeader
              variant="page"
              title="History"
              subtitle="Look back. See how far you've come."
              right={
                <Pressable style={styles.filterChip} onPress={() => setFilterOpen(true)}>
                  <Ionicons name="funnel-outline" size={14} color={colors.text} />
                  <Text style={styles.filterText} numberOfLines={1}>{rangeLabel.replace("Last ", "")}</Text>
                </Pressable>
              }
            />

            {error ? <ErrorState message={error} onRetry={refetch} /> : null}

            {/* Overall stats */}
            <View style={styles.statRow}>
              <StatTile icon="barbell-outline" iconBg={colors.purpleSoft} iconColor={colors.purple} value={String(stats.workouts)} label="Workouts" />
              <StatTile icon="time-outline" iconBg={colors.greenSoft} iconColor={colors.green} value="—" label="Total Time" />
              <StatTile icon="cube-outline" iconBg={colors.orangeSoft} iconColor={colors.orange} value={formatNumber(stats.totalVolume)} label="Total Volume (kg)" />
              <StatTile icon="trending-up-outline" iconBg={colors.blueSoft} iconColor={colors.blue} value={strengthLabel} label="Strength" />
            </View>

            <CalendarMonth
              month={month}
              onPrevMonth={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
              onNextMonth={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
              selected={selectedDate ?? today}
              max={today}
              onSelect={(iso) => setSelectedDate((cur) => (cur === iso ? null : iso))}
              marked={stats.workoutDates}
            />

            {selectedDate ? (
              <ChipRow>
                <Chip label={formatLongDate(selectedDate)} active onPress={() => setSelectedDate(null)} />
                <Chip label="All dates" onPress={() => setSelectedDate(null)} />
              </ChipRow>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading && groups.length === 0 ? (
            <LoadingState label="Loading history…" />
          ) : (
            <EmptyState
              icon="time-outline"
              title="No workouts logged"
              subtitle="Once you log lifts they'll show up here, grouped by day."
            />
          )
        }
        renderItem={({ item: group }) => {
          const exercises = Array.from(new Set(group.logs.map((l) => l.exercise_name)));
          const volume = group.logs.reduce((s, l) => s + Number(l.weight_kg) * l.reps, 0);
          const isOpen = !!openDates[group.date];
          return (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={typography.bodyStrong}>{formatLongDate(group.date)}</Text>
                <Text style={typography.caption}>
                  {"—"} • {exercises.length} exercise{exercises.length === 1 ? "" : "s"} • {formatNumber(volume)} kg
                </Text>
              </View>

              <Pressable
                style={styles.workoutCard}
                onPress={() => setOpenDates((prev) => ({ ...prev, [group.date]: !prev[group.date] }))}
              >
                <IconBadge name="barbell-outline" bg={colors.surfaceAlt} color={colors.textDim} size={44} rounded={false} />
                <View style={styles.workoutText}>
                  <Text style={typography.bodyStrong}>
                    {exercises.length === 1 ? exercises[0] : `${exercises.length}-exercise session`}
                  </Text>
                  <View style={styles.muscleTags}>
                    {Array.from(new Set(exercises.map(muscleGroupFor)))
                      .slice(0, 3)
                      .map((m) => (
                        <Tag key={m} label={m} bg={muscleTagStyle(m, tagTheme).bg} text={muscleTagStyle(m, tagTheme).text} />
                      ))}
                  </View>
                  <View style={styles.metaRow}>
                    <Meta icon="time-outline" value="—" />
                    <Meta icon="barbell-outline" value={`${exercises.length}`} />
                    <Meta icon="layers-outline" value={formatNumber(volume)} />
                  </View>
                </View>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-forward"} size={18} color={colors.textMuted} />
              </Pressable>

              {isOpen ? (
                <Card style={styles.setsCard}>
                  {exercises.map((ex) => (
                    <View key={ex} style={styles.exerciseBlock}>
                      <Text style={typography.bodyStrong}>{ex}</Text>
                      {group.logs
                        .filter((l) => l.exercise_name === ex)
                        .map((l) => (
                          <View key={l.id} style={styles.setRow}>
                            <Text style={typography.small}>
                              {l.weight_kg} kg × {l.reps}
                            </Text>
                            <Pressable
                              onPress={() =>
                                confirm("Delete set?", "This removes the logged set.", () => deleteLiftLog(l.id).catch(() => {}))
                              }
                              hitSlop={8}
                            >
                              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  ))}
                </Card>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          <>
            {/* Daily logs (Next.js parity) */}
            <Card style={styles.section}>
              <Text style={typography.bodyStrong}>Daily logs</Text>
              {dailyLogs.length === 0 ? (
                <Text style={typography.small}>No daily logs in this range.</Text>
              ) : (
                dailyLogs
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((d) => (
                    <View key={d.date}>
                      <Divider />
                      <View style={styles.dailyRow}>
                        <View style={styles.dailyText}>
                          <Text style={typography.bodyStrong}>{formatLongDate(d.date)}</Text>
                          <Text style={typography.small}>
                            {[
                              d.weight_kg != null ? `${d.weight_kg} kg` : null,
                              d.calories != null ? `${d.calories} kcal` : null,
                              d.protein_g != null ? `${d.protein_g} g` : null,
                              d.sleep_hours != null ? `${d.sleep_hours} h` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No values"}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => confirm("Delete daily log?", "This removes all values for this day.", () => deleteDailyLog(d.date).catch(() => {}))}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                  ))
              )}
            </Card>

            {/* Activity (Next.js parity) */}
            <Card style={styles.section}>
              <Text style={typography.bodyStrong}>Activity</Text>
              {activityLogs.length === 0 ? (
                <Text style={typography.small}>No activity in this range.</Text>
              ) : (
                activityLogs.slice(0, 20).map((a) => (
                  <View key={a.id}>
                    <Divider />
                    <View style={styles.dailyRow}>
                      <View style={styles.dailyText}>
                        <Text style={typography.bodyStrong}>{a.name}</Text>
                        <Text style={typography.small}>
                          {formatLongDate(a.date)} · {a.duration_min} min
                          {a.distance_km != null ? ` · ${a.distance_km} km` : ""}
                          {a.calories_burned != null ? ` · ${a.calories_burned} kcal` : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => confirm("Delete activity?", "This removes the logged activity.", () => deleteActivity(a.id).catch(() => {}))}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        }
      />

      <OverflowMenu
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Time filter"
        actions={RANGE_OPTIONS.map((o) => ({
          label: o.label,
          icon: o.days === rangeDays ? "checkmark-circle" : "ellipse-outline",
          onPress: () => setRangeDays(o.days),
        }))}
      />
    </View>
  );
}

function Meta({ icon, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; value: string }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={colors.textDim} />
      <Text style={typography.caption}>{value}</Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },

    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      height: 38,
      maxWidth: 170,
      flexShrink: 1,
    },
    filterText: { fontSize: 13, fontWeight: "600", color: t.colors.text, flexShrink: 1 },

    statRow: { flexDirection: "row", gap: spacing.sm },

    group: { gap: spacing.sm },
    groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    workoutCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
    workoutText: { flex: 1, gap: 4 },
    muscleTags: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
    metaRow: { flexDirection: "row", gap: spacing.md, marginTop: 2 },
    meta: { flexDirection: "row", alignItems: "center", gap: 3 },

    setsCard: { gap: spacing.md },
    exerciseBlock: { gap: spacing.sm },
    setRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

    section: { gap: spacing.sm },
    dailyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
    dailyText: { flex: 1, gap: 2 },
  }),
);
