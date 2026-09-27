import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { ProTipCard } from "../../src/components/ProTipCard";
import { SetTable, isValidSet, makeEmptySets, type SetEntry } from "../../src/components/SetTable";
import { Button, Card, IconBadge, LoadingState, Tag } from "../../src/components/ui/primitives";
import { TextField } from "../../src/components/ui/controls";
import { usePlans } from "../../src/hooks/usePlans";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { useLiftHistory } from "../../src/hooks/useLiftHistory";
import { exerciseTypeFor, muscleGroupFor } from "../../src/utils/derive";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { muscleTagStyle, typeTagStyle } from "../../src/utils/tags";
import { formatMediumDate } from "../../src/utils/date";

/** Exercise detail / logger (design `lift (2).png` + `lift4.png`). */
export default function ExerciseScreen() {
  const { name = "", dayId = "" } = useLocalSearchParams<{ name: string; dayId: string }>();
  const today = useCurrentDate();

  const { days } = usePlans();
  const { entries, addEntry, deleteEntry } = useLiftLogs(today);
  const { logs: history, loading: historyLoading } = useLiftHistory(name);
  const { colors, scheme, typography } = useTheme();
  const styles = useStyles();
  const tagTheme = { colors, scheme };

  const day = useMemo(() => days.find((d) => d.id === dayId) ?? null, [days, dayId]);
  const planned = useMemo(() => day?.exercises.find((e) => e.name === name) ?? null, [day, name]);
  const index = useMemo(() => day?.exercises.findIndex((e) => e.name === name) ?? -1, [day, name]);

  const plannedSets = planned?.sets ?? 3;
  const [sets, setSets] = useState<SetEntry[]>(() => makeEmptySets(plannedSets));
  const [notes, setNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const muscle = muscleGroupFor(name);
  const type = exerciseTypeFor(name);
  const loggedSets = useMemo(() => entries.filter((e) => e.exercise_name === name), [entries, name]);
  const lastLog = loggedSets[0] ?? null;

  const update = useCallback((i: number, patch: Partial<SetEntry>) => {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }, [setSets]);

  const save = useCallback(async () => {
    const valid = sets.filter(isValidSet);
    if (valid.length === 0) {
      Alert.alert("Nothing to save", "Enter weight and reps for at least one set.");
      return;
    }
    setSaving(true);
    try {
      for (const s of valid) {
        await addEntry({
          date: today,
          exercise_name: name,
          weight_kg: parseFloat(s.weight.trim()),
          reps: parseInt(s.reps.trim(), 10),
          plan_day_id: day?.id ?? null,
        });
      }
      setSets(makeEmptySets(plannedSets));
      router.back();
    } catch {
      // handled by hook
    } finally {
      setSaving(false);
    }
  }, [sets, addEntry, today, name, day, plannedSets, setSets]);

  const goToSibling = useCallback(
    (offset: number) => {
      if (!day || index < 0) return;
      const next = day.exercises[index + offset];
      if (next) {
        router.replace({ pathname: "/exercise/[name]", params: { name: next.name, dayId: day.id } } as never);
      }
    },
    [day, index],
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          variant="detail"
          title={name || "Exercise"}
          subtitle={muscle}
          onBack={() => router.back()}
        />

        <Card style={styles.hero}>
          <IconBadge name="barbell" bg={colors.surfaceAlt} color={colors.textDim} size={96} rounded={false} />
          <View style={styles.heroText}>
            <Text style={typography.h3} numberOfLines={2}>
              {name || "Exercise"}
            </Text>
            <View style={styles.tags}>
              <Tag label={muscle} bg={muscleTagStyle(muscle, tagTheme).bg} text={muscleTagStyle(muscle, tagTheme).text} />
              <Tag label={type} bg={typeTagStyle(type, tagTheme).bg} text={typeTagStyle(type, tagTheme).text} />
            </View>
          </View>
        </Card>

        <View style={styles.infoRow}>
          <InfoTile label="Sets" value={planned ? String(planned.sets) : "—"} />
          <InfoTile label="Reps" value={planned?.reps ?? "—"} />
          <InfoTile label="Rest" value="—" />
          <InfoTile label="Target" value={muscle} />
        </View>

        <Card style={styles.infoCard}>
          <View style={styles.infoCardText}>
            <Text style={typography.bodyStrong}>
              {planned ? `${planned.sets} sets × ${planned.reps} reps` : "Manual entry"}
            </Text>
            <Text style={typography.small}>
              {lastLog ? `Last: ${lastLog.weight_kg} kg × ${lastLog.reps} reps` : "No previous log"}
            </Text>
          </View>
          <Button
            label={showHistory ? "Hide" : "View History"}
            icon="time-outline"
            variant="outline"
            size="sm"
            onPress={() => setShowHistory((v) => !v)}
          />
        </Card>

        {showHistory ? (
          <Card style={styles.history}>
            {historyLoading ? (
              <LoadingState label="Loading history…" />
            ) : history.length === 0 ? (
              <Text style={typography.small}>No past logs for this exercise.</Text>
            ) : (
              history.slice(0, 12).map((h) => (
                <View key={h.id} style={styles.historyRow}>
                  <Text style={typography.small}>{formatMediumDate(h.date)}</Text>
                  <Text style={typography.bodyStrong}>
                    {h.weight_kg} kg × {h.reps}
                  </Text>
                </View>
              ))
            )}
          </Card>
        ) : null}

        <Card>
          <SetTable
            sets={sets}
            onUpdate={update}
            onToggleDone={(i) => update(i, { done: !sets[i].done })}
            onRemove={sets.length > 1 ? (i) => setSets((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
          />
          <Button
            label="Add Set"
            icon="add"
            variant="soft"
            onPress={() => {
              const last = sets[sets.length - 1];
              setSets((prev) => [...prev, { weight: last?.weight ?? "", reps: last?.reps ?? "", done: false }]);
            }}
            style={styles.addSet}
          />
        </Card>

        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. felt strong, good form, increased weight…"
          multiline
          autoCapitalize="sentences"
        />

        <ProTipCard text="Keep your core tight, control the movement and don't let momentum do the work." />

        {loggedSets.length > 0 ? (
          <Card style={styles.logged}>
            <Text style={typography.caption}>Logged today</Text>
            {loggedSets.map((e) => (
              <View key={e.id} style={styles.historyRow}>
                <Text style={typography.bodyStrong}>
                  {e.weight_kg} kg × {e.reps}
                </Text>
                <Pressable
                  onPress={() =>
                    Alert.alert("Delete set?", "This removes the logged set.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteEntry(e.id).catch(() => {}) },
                    ])
                  }
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        <Button label="Complete Exercise" icon="checkmark" onPress={save} loading={saving} />

        {day && index >= 0 ? (
          <View style={styles.nav}>
            <Button
              label="Previous"
              icon="arrow-back"
              variant="outline"
              disabled={index <= 0}
              onPress={() => goToSibling(-1)}
              style={styles.flex}
            />
            <Button
              label="Next Exercise"
              icon="arrow-forward"
              disabled={index >= day.exercises.length - 1}
              onPress={() => goToSibling(1)}
              style={styles.flex}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.infoTile}>
      <Text style={[typography.caption, styles.infoLabel]}>{label}</Text>
      <Text style={[typography.bodyStrong, styles.infoValue]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    heroText: { flex: 1, gap: spacing.sm },
    tags: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
    infoRow: { flexDirection: "row", gap: spacing.sm },
    infoTile: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      alignItems: "center",
      gap: 2,
    },
    infoLabel: { color: t.colors.textDim },
    infoValue: { fontSize: 14 },
    infoCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    infoCardText: { flex: 1, gap: 2 },
    history: { gap: spacing.sm },
    historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    addSet: { marginTop: spacing.md },
    logged: { gap: spacing.sm },
    nav: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
  }),
);
