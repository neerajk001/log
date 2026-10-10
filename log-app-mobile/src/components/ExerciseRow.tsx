import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, shadows, spacing } from "../theme/spacing";
import { exerciseTypeFor } from "../utils/derive";
import { muscleTagStyle, typeTagStyle } from "../utils/tags";
import { parsePositiveInt, parsePositiveNumber } from "../utils/parse";
import type { LiftLog, LiftLogCreate } from "../api/types";
import { successTick } from "../hooks/useHaptics";
import { IconBadge, Tag } from "./ui/primitives";

const AUTOSAVE_DELAY_MS = 1200;

type RowStatus = "idle" | "editing" | "saving" | "error";

interface Draft {
  key: string;
  requestId: string;
  ordinal: number;
  weight: string;
  reps: string;
  status: RowStatus;
}

function makeDraft(ordinal: number, weight = "", reps = ""): Draft {
  return {
    key: Crypto.randomUUID(),
    requestId: Crypto.randomUUID(),
    ordinal,
    weight,
    reps,
    status: "idle",
  };
}

/** First integer in a rep scheme, e.g. "8-12" -> 8. */
function firstInt(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function canLogDraft(draft: Draft): boolean {
  return (
    parsePositiveNumber(draft.weight.trim(), 9999) != null &&
    parsePositiveInt(draft.reps.trim(), 9999) != null
  );
}

export function ExerciseRow({
  index,
  name,
  sets,
  reps,
  plannedWeight,
  muscle,
  lastLog,
  loggedSets,
  planDayId,
  date,
  expanded,
  onToggle,
  onAddSet,
  onDeleteSet,
  logsLoading = false,
  pendingIds,
}: {
  index: number;
  name: string;
  sets: number;
  reps: string;
  /** Target weight from the plan; used to pre-fill the inputs. */
  plannedWeight?: number | null;
  muscle?: string;
  lastLog?: { weight_kg: number; reps: number } | null;
  loggedSets?: LiftLog[];
  planDayId?: string | null;
  date?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onAddSet?: (data: LiftLogCreate) => Promise<LiftLog>;
  onDeleteSet?: (id: string) => void;
  logsLoading?: boolean;
  pendingIds?: Set<string>;
}) {
  const { colors, scheme, typography } = useTheme();
  const styles = useStyles();
  const type = exerciseTypeFor(name);
  const tagTheme = { colors, scheme };
  const muscleStyle = muscleTagStyle(muscle ?? "", tagTheme);
  const logged = useMemo(() => loggedSets ?? [], [loggedSets]);
  const confirmedLogged = useMemo(
    () => logged.filter((entry) => !pendingIds?.has(entry.id)),
    [logged, pendingIds],
  );
  const doneCount = logged.length;

  const scopeKey = `${date ?? ""}:${planDayId ?? ""}:${name}`;
  const initializedScopeRef = useRef("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const focusedRowRef = useRef<string | null>(null);

  const applyDrafts = useCallback((update: (current: Draft[]) => Draft[]) => {
    const next = update(draftsRef.current);
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const clearTimer = useCallback((key: string) => {
    const timer = timers.current[key];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[key];
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const timer of Object.values(timers.current)) clearTimeout(timer);
    timers.current = {};
  }, []);

  useEffect(() => {
    if (!expanded || logsLoading) return;
    if (initializedScopeRef.current === scopeKey) return;
    initializedScopeRef.current = scopeKey;
    const count = Math.max(1, sets - confirmedLogged.length);
    // Pre-fill: the plan's target weight, else what you lifted last session.
    const seedWeight = plannedWeight ?? lastLog?.weight_kg ?? null;
    const seedReps = firstInt(reps) ?? lastLog?.reps ?? null;
    const next = Array.from({ length: count }, (_, draftIndex) =>
      makeDraft(
        confirmedLogged.length + draftIndex + 1,
        seedWeight != null ? String(seedWeight) : "",
        seedReps != null ? String(seedReps) : "",
      ),
    );
    draftsRef.current = next;
    setDrafts(next);
  }, [confirmedLogged.length, expanded, lastLog, logsLoading, plannedWeight, reps, scopeKey, sets]);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const commitSet = useCallback(
    (key: string): Promise<void> => {
      const existing = inFlightRef.current.get(key);
      if (existing) return existing;
      if (!onAddSet || !date) return Promise.resolve();

      const draft = draftsRef.current.find((entry) => entry.key === key);
      if (!draft) return Promise.resolve();
      const weight = parsePositiveNumber(draft.weight.trim(), 9999);
      const repsNum = parsePositiveInt(draft.reps.trim(), 9999);
      if (weight == null || repsNum == null) return Promise.resolve();

      const requestId = draft.requestId;
      const requestScope = scopeKey;
      applyDrafts((current) =>
        current.map((entry) =>
          entry.key === key ? { ...entry, status: "saving" } : entry,
        ),
      );

      const request = onAddSet({
        id: requestId,
        date,
        exercise_name: name,
        weight_kg: weight,
        reps: repsNum,
        plan_day_id: planDayId ?? null,
      })
        .then(() => {
          if (initializedScopeRef.current !== requestScope) return;
          applyDrafts((current) => current.filter((entry) => entry.key !== key));
          successTick();
        })
        .catch(() => {
          if (initializedScopeRef.current !== requestScope) return;
          applyDrafts((current) =>
            current.map((entry) =>
              entry.key === key && entry.requestId === requestId
                ? { ...entry, status: "error" }
                : entry,
            ),
          );
        })
        .finally(() => {
          inFlightRef.current.delete(key);
        });

      inFlightRef.current.set(key, request);
      return request;
    },
    [applyDrafts, date, name, onAddSet, planDayId, scopeKey],
  );

  const patchDraft = useCallback(
    (key: string, patch: Partial<Pick<Draft, "weight" | "reps">>) => {
      applyDrafts((current) =>
        current.map((entry) => {
          if (entry.key !== key) return entry;
          const requestId = entry.status === "error" ? Crypto.randomUUID() : entry.requestId;
          return { ...entry, ...patch, requestId, status: "editing" };
        }),
      );
      clearTimer(key);
      timers.current[key] = setTimeout(() => {
        delete timers.current[key];
        commitSet(key);
      }, AUTOSAVE_DELAY_MS);
    },
    [applyDrafts, clearTimer, commitSet],
  );

  const handleFocus = useCallback((key: string) => {
    focusedRowRef.current = key;
  }, []);

  const handleBlur = useCallback(
    (key: string) => {
      if (focusedRowRef.current === key) focusedRowRef.current = null;
      setTimeout(() => {
        if (focusedRowRef.current === key) return;
        clearTimer(key);
        commitSet(key);
      }, 0);
    },
    [clearTimer, commitSet],
  );

  const addDraft = useCallback(() => {
    const highestOrdinal = draftsRef.current.reduce(
      (highest, draft) => Math.max(highest, draft.ordinal),
      doneCount,
    );
    applyDrafts((current) => [...current, makeDraft(highestOrdinal + 1)]);
  }, [applyDrafts, doneCount]);

  const confirmDelete = useCallback(
    (id: string) => {
      if (!onDeleteSet || pendingIds?.has(id)) return;
      Alert.alert("Delete set?", "This removes the logged set.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDeleteSet(id) },
      ]);
    },
    [onDeleteSet, pendingIds],
  );

  const activeRequestIds = useMemo(
    () => new Set(drafts.map((draft) => draft.requestId)),
    [drafts],
  );
  const visibleLogged = useMemo(
    () => logged.filter((entry) => !activeRequestIds.has(entry.id)),
    [activeRequestIds, logged],
  );
  const canExpand = !!onToggle;

  return (
    <View style={[styles.card, expanded && styles.cardOpen]}>
      <Pressable
        accessibilityRole={canExpand ? "button" : undefined}
        onPress={canExpand ? onToggle : undefined}
        style={({ pressed }) => [styles.row, pressed && canExpand ? styles.pressed : null]}
      >
        <View style={styles.index}>
          <Text style={styles.indexText}>{index}</Text>
        </View>

        <IconBadge name="barbell" bg={colors.surfaceAlt} color={colors.textDim} size={44} rounded={false} />

        <View style={styles.body}>
          <Text style={[typography.bodyStrong, styles.name]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[typography.small, styles.prescription]} numberOfLines={1}>
            {sets} sets × {reps} reps
            {plannedWeight != null ? `  ·  ${plannedWeight} kg` : ""}
            {doneCount > 0 ? `  ·  ${doneCount} logged` : ""}
          </Text>
          {lastLog ? (
            <Text style={[typography.caption, styles.last]} numberOfLines={1}>
              Last: {lastLog.weight_kg} kg × {lastLog.reps} reps
            </Text>
          ) : null}
          <View style={styles.tags}>
            {muscle ? <Tag label={muscle} bg={muscleStyle.bg} text={muscleStyle.text} /> : null}
            <Tag label={type} bg={typeTagStyle(type, tagTheme).bg} text={typeTagStyle(type, tagTheme).text} />
          </View>
        </View>

        {canExpand ? (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.expanded}>
          {visibleLogged.length > 0 ? (
            <View style={styles.loggedList}>
              {visibleLogged.map((entry) => (
                <View key={entry.id} style={styles.loggedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={typography.bodyStrong}>
                    {entry.weight_kg} kg × {entry.reps}
                  </Text>
                  <Pressable
                    onPress={() => confirmDelete(entry.id)}
                    hitSlop={14}
                    accessibilityLabel="Delete set"
                    disabled={pendingIds?.has(entry.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {drafts.map((draft) => (
            <View key={draft.key} style={styles.draftWrap}>
              <View style={[styles.setRow, draft.status === "error" && styles.setRowError]}>
                <View style={styles.setBadge}>
                  <Text style={styles.setBadgeText}>{draft.ordinal}</Text>
                </View>
                <TextInput
                  value={draft.weight}
                  onChangeText={(text) => patchDraft(draft.key, { weight: text })}
                  onFocus={() => handleFocus(draft.key)}
                  onBlur={() => handleBlur(draft.key)}
                  keyboardType="numeric"
                  placeholder="kg"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  editable={draft.status !== "saving"}
                />
                <Text style={styles.x}>×</Text>
                <TextInput
                  value={draft.reps}
                  onChangeText={(text) => patchDraft(draft.key, { reps: text })}
                  onFocus={() => handleFocus(draft.key)}
                  onBlur={() => handleBlur(draft.key)}
                  keyboardType="numeric"
                  placeholder="reps"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  editable={draft.status !== "saving"}
                />
                {draft.status === "saving" ? null : draft.status === "error" ? (
                  <Ionicons name="alert-circle" size={22} color={colors.danger} />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Log set ${draft.ordinal}`}
                    onPress={() => {
                      clearTimer(draft.key);
                      void commitSet(draft.key);
                    }}
                    disabled={!canLogDraft(draft)}
                    hitSlop={8}
                    style={styles.tick}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={26}
                      color={canLogDraft(draft) ? colors.primary : colors.borderStrong}
                    />
                  </Pressable>
                )}
              </View>
              {draft.status === "error" ? (
                <View style={styles.retryRow}>
                  <Text style={styles.errorText}>Couldn’t save. Your values are kept.</Text>
                  <Pressable onPress={() => commitSet(draft.key)} hitSlop={8}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}

          <Pressable onPress={addDraft} hitSlop={8} style={styles.addSet}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addSetText}>Add set</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
      ...shadows.card,
    },
    cardOpen: { borderColor: t.colors.primary },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    pressed: { opacity: 0.85 },
    index: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    indexText: { fontSize: 12, fontWeight: "700", color: t.colors.textDim },
    body: { flex: 1, gap: 3 },
    name: {},
    prescription: { color: t.colors.textDim },
    last: { color: t.colors.textMuted },
    tags: { flexDirection: "row", gap: spacing.xs, marginTop: 2, flexWrap: "wrap" },
    expanded: { marginTop: spacing.md, gap: spacing.sm },
    loggedList: { gap: spacing.xs },
    loggedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    draftWrap: { gap: spacing.xs },
    setRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    setRowError: { borderWidth: 1, borderColor: t.colors.danger, borderRadius: radii.sm, padding: 2 },
    setBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    setBadgeText: { fontSize: 13, fontWeight: "700", color: t.colors.textDim },
    input: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.sm,
      height: 44,
      paddingHorizontal: spacing.md,
      fontSize: 15,
      color: t.colors.text,
    },
    x: { fontSize: 15, fontWeight: "600", color: t.colors.textMuted },
    tick: { padding: 2 },
    retryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    errorText: { ...t.typography.caption, color: t.colors.danger, flex: 1 },
    retryText: { fontSize: 13, fontWeight: "700", color: t.colors.primary },
    addSet: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
    addSetText: { fontSize: 14, fontWeight: "600", color: t.colors.primary },
  }),
);
