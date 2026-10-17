import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, shadows, spacing } from "../theme/spacing";
import { exerciseTypeFor } from "../utils/derive";
import { muscleTagStyle, typeTagStyle } from "../utils/tags";
import { parsePositiveInt, parsePositiveNumber, requestIdForAttempt } from "../utils/parse";
import { buildSetSeeds } from "../utils/liftPrefill";
import { formatSetList, formatTargetWeight, planHintFor } from "../utils/planTargets";
import { formatMediumDate } from "../utils/date";
import type { LastSessionSets, LiftLog, LiftLogCreate, PlanSetTarget } from "../api/types";
import { successTick } from "../hooks/useHaptics";
import { StepField } from "./ui/controls";
import { IconBadge, Tag } from "./ui/primitives";

const AUTOSAVE_DELAY_MS = 1200;

type RowStatus = "idle" | "editing" | "saving" | "error" | "saved";

interface Draft {
  key: string;
  requestId: string;
  /** The parsed payload the last attempt sent ("weight|reps"), null before any. */
  lastAttempt: string | null;
  ordinal: number;
  weight: string;
  reps: string;
  status: RowStatus;
}

function makeDraft(ordinal: number, weight = "", reps = ""): Draft {
  return {
    key: Crypto.randomUUID(),
    requestId: Crypto.randomUUID(),
    lastAttempt: null,
    ordinal,
    weight,
    reps,
    status: "idle",
  };
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
  lastSession,
  setTargets,
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
  /** The previous session in full (date + every set), for the reference line. */
  lastSession?: LastSessionSets | null;
  /** The plan's per-set targets, in order — shown as the caption under each row. */
  setTargets?: PlanSetTarget[] | null;
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const draftsRef = useRef<Draft[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const focusedRowRef = useRef<string | null>(null);
  const lastSets = lastSession?.sets ?? null;

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
    setHistoryOpen(false);
    const count = Math.max(1, sets - confirmedLogged.length);
    // Pre-fill set by set from the previous session (a pyramid comes back as it
    // was lifted); extra rows repeat its last set. No history => the plan target.
    const seeds = buildSetSeeds({
      count,
      loggedSetCount: confirmedLogged.length,
      lastSets,
      setTargets,
      plannedWeight,
      plannedReps: reps,
      lastLog,
    });
    const next = seeds.map((seed, draftIndex) =>
      makeDraft(confirmedLogged.length + draftIndex + 1, seed.weight, seed.reps),
    );
    draftsRef.current = next;
    setDrafts(next);
  }, [
    confirmedLogged.length,
    expanded,
    lastLog,
    lastSets,
    logsLoading,
    plannedWeight,
    reps,
    scopeKey,
    setTargets,
    sets,
  ]);

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

      // Same values => same request id (a lost response replays safely);
      // edited values => a fresh id, because replaying the old one with a
      // changed payload is a permanent 409.
      const { requestId, lastAttempt } = requestIdForAttempt(
        draft,
        `${weight}|${repsNum}`,
        () => Crypto.randomUUID(),
      );
      const requestScope = scopeKey;
      applyDrafts((current) =>
        current.map((entry) =>
          entry.key === key ? { ...entry, status: "saving", requestId, lastAttempt } : entry,
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
          // Keep the row where it is and mark it saved, so the input you were on
          // doesn't vanish and the set doesn't jump to the list above.
          applyDrafts((current) =>
            current.map((entry) =>
              entry.key === key ? { ...entry, status: "saved" } : entry,
            ),
          );
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
          // Keep requestId stable across retries so a timeout-retry replays the
          // same idempotent request instead of logging the set twice (matches
          // quick-log in app/(tabs)/lift.tsx and useLiftLogs dedup by id).
          return { ...entry, ...patch, status: "editing" };
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
    applyDrafts((current) => [
      ...current,
      makeDraft(highestOrdinal + 1, current[current.length - 1]?.weight ?? "", current[current.length - 1]?.reps ?? ""),
    ]);
  }, [applyDrafts, doneCount]);

  const confirmDelete = useCallback(
    (id: string, onConfirmed?: () => void) => {
      if (!onDeleteSet || pendingIds?.has(id)) return;
      Alert.alert("Delete set?", "This removes the logged set.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            onDeleteSet(id);
            onConfirmed?.();
          },
        },
      ]);
    },
    [onDeleteSet, pendingIds],
  );

  /** Deleting a set that was just logged hands its row back for editing. */
  const deleteSaved = useCallback(
    (draft: Draft) =>
      confirmDelete(draft.requestId, () =>
        applyDrafts((current) =>
          current.map((entry) =>
            entry.key === draft.key ? { ...entry, status: "idle" } : entry,
          ),
        ),
      ),
    [applyDrafts, confirmDelete],
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
  const targetText = formatTargetWeight({ sets, weight_kg: plannedWeight, set_targets: setTargets });
  /** One line of what was lifted last time; tapping it opens the full session. */
  const lastLine = lastSession
    ? `Last (${formatMediumDate(lastSession.date)}): ${formatSetList(lastSession.sets) ?? "no sets"}`
    : lastLog
      ? `Last: ${lastLog.weight_kg} kg × ${lastLog.reps} reps`
      : null;

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
            {targetText ? `  ·  ${targetText}` : ""}
            {doneCount > 0 ? `  ·  ${doneCount} logged` : ""}
          </Text>
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

      {lastLine ? (
        lastSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show the previous session's sets"
            onPress={() => setHistoryOpen((open) => !open)}
            hitSlop={6}
            style={({ pressed }) => [styles.lastRow, pressed && styles.pressed]}
          >
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={[typography.caption, styles.last]} numberOfLines={1}>
              {lastLine}
            </Text>
            <Ionicons
              name={historyOpen ? "chevron-up" : "chevron-down"}
              size={12}
              color={colors.textMuted}
            />
          </Pressable>
        ) : (
          <View style={styles.lastRow}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={[typography.caption, styles.last]} numberOfLines={1}>
              {lastLine}
            </Text>
          </View>
        )
      ) : null}

      {historyOpen && lastSession ? (
        <View style={styles.historyPanel}>
          <Text style={[typography.caption, styles.last]}>{formatMediumDate(lastSession.date)}</Text>
          {lastSession.sets.map((set, i) => (
            <View key={`${i}-${set.weight_kg}-${set.reps}`} style={styles.historyRow}>
              <Text style={styles.historyIndex}>{i + 1}</Text>
              <Text style={typography.small}>
                {set.weight_kg} kg × {set.reps}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

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

          {drafts.map((draft) => {
            const hint = planHintFor(draft.ordinal - 1, {
              sets,
              reps,
              weight_kg: plannedWeight,
              set_targets: setTargets,
            });
            // Logged sets stay where they were entered instead of jumping up to
            // the list above, so the row you were on is still under your thumb.
            if (draft.status === "saved") {
              return (
                <View key={draft.key} style={styles.savedRow}>
                  <View style={styles.setBadge}>
                    <Text style={styles.setBadgeText}>{draft.ordinal}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={[typography.bodyStrong, styles.savedValues]}>
                    {draft.weight} kg × {draft.reps}
                  </Text>
                  <Pressable
                    onPress={() => deleteSaved(draft)}
                    hitSlop={14}
                    accessibilityLabel={`Delete set ${draft.ordinal}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              );
            }
            return (
              <View key={draft.key} style={styles.draftWrap}>
                <View style={[styles.setRow, draft.status === "error" && styles.setRowError]}>
                  <View style={styles.setBadge}>
                    <Text style={styles.setBadgeText}>{draft.ordinal}</Text>
                  </View>
                  <StepField
                    value={draft.weight}
                    onChangeText={(text) => patchDraft(draft.key, { weight: text })}
                    onFocus={() => handleFocus(draft.key)}
                    onBlur={() => handleBlur(draft.key)}
                    placeholder="kg"
                    label="Weight"
                    editable={draft.status !== "saving"}
                  />
                  <Text style={styles.x}>×</Text>
                  <StepField
                    value={draft.reps}
                    onChangeText={(text) => patchDraft(draft.key, { reps: text })}
                    onFocus={() => handleFocus(draft.key)}
                    onBlur={() => handleBlur(draft.key)}
                    placeholder="reps"
                    label="Reps"
                    step={1}
                    minNonZero={1}
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
                {hint ? (
                  <View style={styles.planHint}>
                    <Ionicons name="flag-outline" size={12} color={colors.textDim} />
                    <Text style={styles.planHintText}>{hint}</Text>
                  </View>
                ) : null}
                {draft.status === "error" ? (
                  <View style={styles.retryRow}>
                    <Text style={styles.errorText}>Couldn’t save. Your values are kept.</Text>
                    <Pressable onPress={() => commitSet(draft.key)} hitSlop={8}>
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

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
      borderColor: t.colors.cardBorder,
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
    last: { color: t.colors.textMuted, flexShrink: 1 },
    lastRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs },
    historyPanel: {
      marginTop: spacing.xs,
      padding: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: t.colors.surfaceAlt,
      gap: 2,
    },
    historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    historyIndex: { fontSize: 11, fontWeight: "700", color: t.colors.textMuted, width: 12 },
    tags: { flexDirection: "row", gap: spacing.xs, marginTop: 2, flexWrap: "wrap" },
    expanded: { marginTop: spacing.md, gap: spacing.sm },
    loggedList: { gap: spacing.xs },
    loggedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    savedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: t.colors.successSoft,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      height: 44,
    },
    savedValues: { flex: 1 },
    draftWrap: { gap: spacing.xs },
    planHint: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 36 },
    planHintText: { ...t.typography.caption, color: t.colors.textDim },
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
    x: { fontSize: 15, fontWeight: "600", color: t.colors.textMuted },
    tick: { padding: 2 },
    retryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    errorText: { ...t.typography.caption, color: t.colors.danger, flex: 1 },
    retryText: { fontSize: 13, fontWeight: "700", color: t.colors.primary },
    addSet: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
    addSetText: { fontSize: 14, fontWeight: "600", color: t.colors.primary },
  }),
);
