import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import { colors } from "../../src/theme/colors";
import { typography } from "../../src/theme/typography";
import { spacing } from "../../src/theme/spacing";
import { useLiftLogs } from "../../src/hooks/useLiftLogs";
import { usePlanToday } from "../../src/hooks/usePlanToday";
import { usePlansApi } from "../../src/api/plans";
import type { LiftLog, PlanDay } from "../../src/api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SetEntry {
  weight: string;
  reps: string;
}

function makeEmptySets(count: number): SetEntry[] {
  return Array.from({ length: count }, () => ({ weight: "", reps: "" }));
}

function isValidSet(set: SetEntry): boolean {
  const w = parseFloat(set.weight.trim());
  const r = parseInt(set.reps.trim(), 10);
  return !isNaN(w) && w > 0 && !isNaN(r) && r > 0;
}

export default function LiftScreen() {
  const { entries, loading: liftsLoading, error: liftsError, addEntry } = useLiftLogs();
  const { planId, planName, day: rotatedDay } = usePlanToday();
  const plansApi = usePlansApi();
  const [allDays, setAllDays] = useState<PlanDay[]>([]);
  const [overrideDayId, setOverrideDayId] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) {
      setAllDays([]);
      return;
    }
    let cancelled = false;
    plansApi.getPlans().then((plans) => {
      if (cancelled) return;
      const active = plans.find((p) => p.id === planId);
      setAllDays(active?.days ?? []);
    }).catch(() => {
      // Fall back to rotated-day-only behavior silently
    });
    return () => {
      cancelled = true;
    };
  }, [planId, plansApi]);

  const day = useMemo(() => {
    if (overrideDayId) {
      return allDays.find((d) => d.id === overrideDayId) ?? rotatedDay;
    }
    return rotatedDay;
  }, [overrideDayId, allDays, rotatedDay]);

  const [openExercises, setOpenExercises] = useState<Record<string, boolean>>({});
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({});

  const [exercise, setExercise] = useState("");
  const [manualSets, setManualSets] = useState<SetEntry[]>([{ weight: "", reps: "" }]);

  const getSetsFor = useCallback(
    (name: string, plannedCount: number): SetEntry[] => {
      return setsByExercise[name] ?? makeEmptySets(plannedCount);
    },
    [setsByExercise],
  );

  const toggleOpen = useCallback((name: string, plannedCount: number) => {
    setOpenExercises((prev) => ({ ...prev, [name]: !prev[name] }));
    setSetsByExercise((prev) => prev[name] ? prev : { ...prev, [name]: makeEmptySets(plannedCount) });
  }, []);

  const updateSet = useCallback((name: string, index: number, patch: Partial<SetEntry>) => {
    setSetsByExercise((prev) => {
      const current = prev[name] ?? [];
      const updated = current.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, [name]: updated };
    });
  }, []);

  const addSet = useCallback((name: string) => {
    setSetsByExercise((prev) => {
      const current = prev[name] ?? [];
      const last = current[current.length - 1];
      return {
        ...prev,
        [name]: [...current, { weight: last?.weight ?? "", reps: last?.reps ?? "" }],
      };
    });
  }, []);

  const removeSet = useCallback((name: string, index: number) => {
    setSetsByExercise((prev) => {
      const current = prev[name] ?? [];
      if (current.length <= 1) return prev;
      return { ...prev, [name]: current.filter((_, i) => i !== index) };
    });
  }, []);

  const handleSaveSets = useCallback(
    async (exerciseName: string, planDayId: string | null) => {
      const sets = setsByExercise[exerciseName] ?? [];
      const validSets = sets.filter(isValidSet);
      if (validSets.length === 0) {
        Alert.alert("Invalid", "Enter valid weight and reps for at least one set");
        return;
      }

      const date = today();
      const saves = validSets.map((set) =>
        addEntry({
          date,
          exercise_name: exerciseName,
          weight_kg: parseFloat(set.weight.trim()),
          reps: parseInt(set.reps.trim(), 10),
          plan_day_id: planDayId,
        }),
      );

      try {
        await Promise.all(saves);
      } catch {
        // errors already tracked by addEntry; keep entry form open so user can retry
        return;
      }

      setOpenExercises((prev) => ({ ...prev, [exerciseName]: false }));
      setSetsByExercise((prev) => {
        const next = { ...prev };
        delete next[exerciseName];
        return next;
      });
    },
    [setsByExercise, addEntry],
  );

  const handleManualSave = useCallback(async () => {
    const trimmed = exercise.trim();
    const validSets = manualSets.filter(isValidSet);
    if (!trimmed || validSets.length === 0) {
      Alert.alert("Invalid", "Fill exercise name and valid weight/reps for at least one set");
      return;
    }
    const date = today();
    const saves = validSets.map((set) =>
      addEntry({
        date,
        exercise_name: trimmed,
        weight_kg: parseFloat(set.weight.trim()),
        reps: parseInt(set.reps.trim(), 10),
      }),
    );
    try {
      await Promise.all(saves);
    } catch {
      return;
    }
    setExercise("");
    setManualSets([{ weight: "", reps: "" }]);
  }, [exercise, manualSets, addEntry]);

  const updateManualSet = useCallback((index: number, patch: Partial<SetEntry>) => {
    setManualSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  const addManualSet = useCallback(() => {
    setManualSets((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { weight: last?.weight ?? "", reps: last?.reps ?? "" }];
    });
  }, []);

  const removeManualSet = useCallback((index: number) => {
    setManualSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const todaysLogs = useMemo(() => entries, [entries]);
  const logsByExercise = useMemo(() => {
    const map: Record<string, LiftLog[]> = {};
    for (const log of todaysLogs) {
      if (!map[log.exercise_name]) map[log.exercise_name] = [];
      map[log.exercise_name].push(log);
    }
    return map;
  }, [todaysLogs]);

  const groupedByExercise = useMemo(() => {
    const seen: Record<string, boolean> = {};
    const groups: { name: string; sets: LiftLog[] }[] = [];
    for (const log of todaysLogs) {
      if (seen[log.exercise_name]) continue;
      seen[log.exercise_name] = true;
      groups.push({ name: log.exercise_name, sets: logsByExercise[log.exercise_name] });
    }
    return groups;
  }, [todaysLogs, logsByExercise]);

  const toggleHistory = useCallback((name: string) => {
    setOpenHistory((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={typography.screenTitle}>Lift</Text>
        </View>

        {day ? (
          <View style={styles.section}>
            <Text style={typography.sectionLabel}>
              {planName ? planName.toUpperCase() : "TODAY'S PLAN"} — {day.day_name}
            </Text>
            {allDays.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayPicker}
              >
                <Pressable
                  style={[
                    styles.dayChip,
                    overrideDayId == null && styles.dayChipActive,
                  ]}
                  onPress={() => setOverrideDayId(null)}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      overrideDayId == null && styles.dayChipTextActive,
                    ]}
                  >
                    Today
                  </Text>
                </Pressable>
                {allDays.map((d) => {
                  const isActive =
                    (overrideDayId ?? rotatedDay?.id) === d.id;
                  return (
                    <Pressable
                      key={d.id}
                      style={[
                        styles.dayChip,
                        isActive && styles.dayChipActive,
                      ]}
                      onPress={() =>
                        setOverrideDayId((cur) => (cur === d.id ? null : d.id))
                      }
                    >
                      <Text
                        style={[
                          styles.dayChipText,
                          isActive && styles.dayChipTextActive,
                        ]}
                      >
                        {d.day_name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {day.exercises.map((ex) => {
              const completedSets = logsByExercise[ex.name] ?? [];
              const isOpen = !!openExercises[ex.name];
              const sets = getSetsFor(ex.name, ex.sets);
              return (
                <View key={ex.name} style={styles.exerciseCard}>
                  <Pressable
                    style={styles.exerciseCardBody}
                    onPress={() => toggleOpen(ex.name, ex.sets)}
                  >
                    <View style={styles.exerciseInfo}>
                      <Text style={typography.body} numberOfLines={1}>
                        {ex.name}
                      </Text>
                      <Text style={typography.bodySmall}>
                        {ex.sets} sets × {ex.reps} reps
                      </Text>
                    </View>
                    <View style={styles.exerciseRight}>
                      {completedSets.length > 0 ? (
                        <Text style={styles.doneText}>
                          ✓ {completedSets.length}/{ex.sets}
                        </Text>
                      ) : null}
                      <Text style={styles.logText}>{isOpen ? "Cancel" : "Log"}</Text>
                    </View>
                  </Pressable>

                  {completedSets.length > 0 ? (
                    <View style={styles.completedSets}>
                      {completedSets.map((s, i) => (
                        <Text key={s.id} style={styles.completedSetText}>
                          Set {i + 1}: {String(s.weight_kg)} kg × {s.reps}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {isOpen ? (
                    <View style={styles.setsContainer}>
                      {sets.map((set, i) => (
                        <View key={i} style={styles.setRow}>
                          <Text style={styles.setLabel}>Set {i + 1}</Text>
                          <TextInput
                            style={[styles.input, styles.setInput]}
                            placeholder="Weight (kg)"
                            placeholderTextColor={colors.chalkDim}
                            value={set.weight}
                            onChangeText={(t) => updateSet(ex.name, i, { weight: t })}
                            keyboardType="numeric"
                          />
                          <TextInput
                            style={[styles.input, styles.setInput]}
                            placeholder="Reps"
                            placeholderTextColor={colors.chalkDim}
                            value={set.reps}
                            onChangeText={(t) => updateSet(ex.name, i, { reps: t })}
                            keyboardType="numeric"
                          />
                          {sets.length > 1 ? (
                            <Pressable
                              onPress={() => removeSet(ex.name, i)}
                              hitSlop={8}
                              style={styles.removeSetBtn}
                            >
                              <Text style={styles.removeSetText}>×</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      <View style={styles.setActions}>
                        <Pressable
                          style={styles.addSetBtn}
                          onPress={() => addSet(ex.name)}
                        >
                          <Text style={styles.addSetText}>+ Add set</Text>
                        </Pressable>
                        <Pressable
                          style={styles.saveSetsBtn}
                          onPress={() => handleSaveSets(ex.name, day.id)}
                        >
                          <Text style={styles.saveSetsText}>Save all</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>
            {day ? "Not on your plan? Log manually" : "Log a lift"}
          </Text>
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Exercise name"
              placeholderTextColor={colors.chalkDim}
              value={exercise}
              onChangeText={setExercise}
              autoCapitalize="words"
            />
            {manualSets.map((set, i) => (
              <View key={i} style={styles.setRow}>
                <Text style={styles.setLabel}>Set {i + 1}</Text>
                <TextInput
                  style={[styles.input, styles.setInput]}
                  placeholder="Weight (kg)"
                  placeholderTextColor={colors.chalkDim}
                  value={set.weight}
                  onChangeText={(t) => updateManualSet(i, { weight: t })}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.setInput]}
                  placeholder="Reps"
                  placeholderTextColor={colors.chalkDim}
                  value={set.reps}
                  onChangeText={(t) => updateManualSet(i, { reps: t })}
                  keyboardType="numeric"
                />
                {manualSets.length > 1 ? (
                  <Pressable
                    onPress={() => removeManualSet(i)}
                    hitSlop={8}
                    style={styles.removeSetBtn}
                  >
                    <Text style={styles.removeSetText}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <View style={styles.setActions}>
              <Pressable style={styles.addSetBtn} onPress={addManualSet}>
                <Text style={styles.addSetText}>+ Add set</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleManualSave}>
                <Text style={styles.saveBtnText}>Save all</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>{"Today's lifts"}</Text>
          {liftsLoading ? (
            <Text style={typography.bodySmall}>Loading...</Text>
          ) : groupedByExercise.length === 0 ? (
            <Text style={[typography.bodySmall, styles.empty]}>No lifts logged today</Text>
          ) : (
            groupedByExercise.map((group) => {
              const isOpen = !!openHistory[group.name];
              return (
                <View key={group.name} style={styles.entry}>
                  <Pressable
                    style={styles.entryHeader}
                    onPress={() => toggleHistory(group.name)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body} numberOfLines={1}>
                        {group.name}
                      </Text>
                      <Text style={typography.bodySmall}>
                        {group.sets.length} {group.sets.length === 1 ? "set" : "sets"}
                      </Text>
                    </View>
                    <Text style={styles.entryChevron}>{isOpen ? "−" : "+"}</Text>
                  </Pressable>
                  {isOpen ? (
                    <View style={styles.entrySets}>
                      {group.sets.map((s, i) => (
                        <View key={s.id} style={styles.entrySetRow}>
                          <Text style={styles.entrySetLabel}>Set {i + 1}</Text>
                          <Text style={typography.dataSmall}>
                            {String(s.weight_kg)} kg × {s.reps}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {liftsError ? (
          <View style={styles.errorBanner}>
            <Text style={typography.bodySmall}>{liftsError}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.graphite,
  },
  scroll: {
    padding: spacing.screenPadding,
    paddingBottom: 40,
  },
  header: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  section: {
    marginTop: spacing.sectionTop,
    marginBottom: spacing.sectionBottom,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    marginTop: 8,
  },
  dayPicker: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  dayChipActive: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
  },
  dayChipText: {
    fontFamily: "Inter-Medium",
    fontSize: 13,
    color: colors.chalk,
  },
  dayChipTextActive: {
    color: colors.chalk,
    fontWeight: "600",
  },
  exerciseCardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    gap: 8,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logText: {
    fontFamily: "Inter-Medium",
    fontSize: 13,
    color: colors.rustSoft,
  },
  doneText: {
    fontFamily: "JetBrainsMono",
    fontSize: 13,
    color: colors.moss,
  },
  completedSets: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 2,
  },
  completedSetText: {
    fontFamily: "JetBrainsMono",
    fontSize: 12,
    color: colors.chalkDim,
  },
  setsContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  setLabel: {
    fontFamily: "JetBrainsMono",
    fontSize: 12,
    color: colors.chalkDim,
    width: 48,
  },
  setInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  removeSetBtn: {
    width: 28,
    alignItems: "center",
  },
  removeSetText: {
    fontFamily: "Inter",
    fontSize: 18,
    color: colors.steel,
  },
  setActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  addSetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addSetText: {
    fontFamily: "Inter-Medium",
    fontSize: 13,
    color: colors.rustSoft,
  },
  saveSetsBtn: {
    backgroundColor: colors.rust,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveSetsText: {
    fontFamily: "Inter-SemiBold",
    fontSize: 14,
    color: colors.chalk,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 12,
    fontFamily: "JetBrainsMono",
    fontSize: 16,
    color: colors.chalk,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  half: {
    flex: 1,
  },
  saveBtn: {
    backgroundColor: colors.rust,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  saveBtnText: {
    fontFamily: "Inter-SemiBold",
    fontSize: 16,
    color: colors.chalk,
  },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 14,
    marginTop: 8,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryChevron: {
    fontFamily: "JetBrainsMono",
    fontSize: 18,
    color: colors.rustSoft,
    paddingHorizontal: 8,
  },
  entrySets: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: 4,
  },
  entrySetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  entrySetLabel: {
    fontFamily: "JetBrainsMono",
    fontSize: 12,
    color: colors.chalkDim,
  },
  empty: {
    marginTop: 8,
    textAlign: "center",
  },
  errorBanner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.rust,
    padding: 12,
    marginTop: 16,
  },
});
