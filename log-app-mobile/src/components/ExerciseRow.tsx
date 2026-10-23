import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, shadows, spacing } from "../theme/spacing";
import { exerciseTypeFor } from "../utils/derive";
import { muscleTagStyle, typeTagStyle } from "../utils/tags";
import { parsePositiveInt, parsePositiveNumber, requestIdForAttempt } from "../utils/parse";
import { buildSetSeeds } from "../utils/liftPrefill";
import { formatTargetWeight, planHintFor } from "../utils/planTargets";
import { inferLoadMode, type LoadMode } from "../utils/bodyweight";
import {
  clampPlatePosition,
  clampPositionToRange,
  estimatedPlateLoad,
  formatLiftSet,
  formatPlateSet,
  formatPlanLoad,
} from "../utils/plate";
import { formatMediumDate } from "../utils/date";
import type {
  LastSessionSets,
  LiftLog,
  LiftLogCreate,
  LiftSetLoad,
  PlanSetTarget,
  PlateConfig,
} from "../api/types";
import { successTick } from "../hooks/useHaptics";
import { SegmentedControl, StepField } from "./ui/controls";
import { IconBadge, Tag } from "./ui/primitives";

type RowStatus = "idle" | "editing" | "saving" | "error" | "saved";

interface Draft {
  key: string;
  requestId: string;
  /** The parsed payload the last attempt sent ("weight|reps"), null before any. */
  lastAttempt: string | null;
  ordinal: number;
  weight: string;
  reps: string;
  /** Machine stack position; empty for kg/bodyweight rows. */
  position: string;
  status: RowStatus;
  /** Prefilled rows are placeholders until the athlete actually edits them. */
  touched: boolean;
  /** What the server actually stored, so a saved row keeps its load across mode switches. */
  savedWeight?: number | null;
  savedPosition?: number | null;
}

function makeDraft(ordinal: number, weight = "", reps = "", position = ""): Draft {
  return {
    key: Crypto.randomUUID(),
    requestId: Crypto.randomUUID(),
    lastAttempt: null,
    ordinal,
    weight,
    reps,
    position,
    status: "idle",
    touched: false,
  };
}

function canLogDraft(draft: Draft, bodyweight: boolean, plate: boolean): boolean {
  const reps = parsePositiveInt(draft.reps.trim(), 9999) != null;
  if (!reps) return false;
  if (plate) return parsePositiveInt(draft.position.trim(), 999) != null;
  return bodyweight || parsePositiveNumber(draft.weight.trim(), 9999) != null;
}

/**
 * One-line summary of a previous session: the load range plus how many sets.
 * A straight set reads "60 kg × 8 · 3 sets"; a pyramid reads "60–65 kg · 3 sets".
 */
function lastSessionSummary(sets: LiftSetLoad[]): string | null {
  if (sets.length === 0) return null;
  const count = `${sets.length} ${sets.length === 1 ? "set" : "sets"}`;
  const positions = sets
    .map((set) => set.plate_position ?? null)
    .filter((position): position is number => position != null);
  if (positions.length === sets.length) {
    const reps = new Set(sets.map((set) => set.reps));
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    const load =
      min === max ? `Pos ${min}` : `Pos ${min}–${max}`;
    return reps.size === 1 ? `${load} × ${sets[0].reps} · ${count}` : `${load} · ${count}`;
  }
  const weights = sets
    .map((set) => set.weight_kg)
    .filter((weight): weight is number => weight != null);
  const reps = new Set(sets.map((set) => set.reps));
  if (weights.length === 0) {
    return reps.size === 1 ? `BW × ${sets[0].reps} · ${count}` : `BW · ${count}`;
  }
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  if (min === max) {
    return reps.size === 1
      ? `${max} kg × ${sets[0].reps} · ${count}`
      : `${max} kg · ${count}`;
  }
  return `${min}–${max} kg · ${count}`;
}

export function ExerciseRow({
  index,
  name,
  instanceKey,
  sets,
  reps,
  plannedWeight,
  plateMode = false,
  plateConfig,
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
  /** Disambiguates duplicate exercise names in the same plan day. */
  instanceKey?: string;
  sets: number;
  reps: string;
  /** Target weight from the plan; used to pre-fill the inputs. */
  plannedWeight?: number | null;
  /** Plan exercise uses a numbered machine stack instead of kg. */
  plateMode?: boolean;
  /** Optional calibration for the stack; without it only positions are logged. */
  plateConfig?: PlateConfig | null;
  muscle?: string;
  /** The previous session's top set, when no per-set history exists. */
  lastLog?: LiftSetLoad | null;
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

  const scopeKey = `${date ?? ""}:${planDayId ?? ""}:${name}:${instanceKey ?? ""}`;
  const initializedScopeRef = useRef("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadMode, setLoadMode] = useState<LoadMode>("kg");
  const loadModeRef = useRef<LoadMode>("kg");
  const [historyOpen, setHistoryOpen] = useState(false);
  const draftsRef = useRef<Draft[]>([]);
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const focusedRowRef = useRef<string | null>(null);
  const lastSets = lastSession?.sets ?? null;
  const plateMin = plateConfig?.min_position ?? 1;
  const plateMax = plateConfig?.max_position ?? 999;

  const applyDrafts = useCallback((update: (current: Draft[]) => Draft[]) => {
    const next = update(draftsRef.current);
    draftsRef.current = next;
    setDrafts(next);
  }, []);


  /** Weighted vs bodyweight for this exercise — one tap, applies to every row. */
  const changeLoadMode = useCallback((mode: LoadMode) => {
    loadModeRef.current = mode;
    setLoadMode(mode);
  }, []);

  useEffect(() => {
    if (!expanded || logsLoading) return;
    if (initializedScopeRef.current === scopeKey) return;
    initializedScopeRef.current = scopeKey;
    setHistoryOpen(false);
    const mode = plateMode ? "kg" : inferLoadMode({ name, lastSets, lastLog, plannedWeight, setTargets });
    loadModeRef.current = mode;
    setLoadMode(mode);
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
      bodyweight: !plateMode && mode === "bw",
      plate: plateMode,
      minPlatePosition: plateMin,
    });
    const next = seeds.map((seed, draftIndex) => {
      const seedPosition = Number(seed.position);
      return makeDraft(
        confirmedLogged.length + draftIndex + 1,
        seed.weight,
        seed.reps,
        seed.position.trim() !== "" && Number.isFinite(seedPosition)
          ? String(clampPlatePosition(seedPosition, plateConfig))
          : "",
      );
    });
    draftsRef.current = next;
    setDrafts(next);
  }, [
    confirmedLogged.length,
    expanded,
    lastLog,
    lastSets,
    logsLoading,
    name,
    plateConfig,
    plateMin,
    plateMode,
    plannedWeight,
    reps,
    scopeKey,
    setTargets,
    sets,
  ]);

  const commitSet = useCallback(
    (key: string, force = true): Promise<void> => {
      const existing = inFlightRef.current.get(key);
      if (existing) return existing;
      if (!onAddSet || !date) return Promise.resolve();

      const draft = draftsRef.current.find((entry) => entry.key === key);
      if (!draft) return Promise.resolve();
      // Blur only saves rows the athlete actually touched; prefilled values are
      // placeholders until then.
      if (!force && !draft.touched) return Promise.resolve();
      const bodyweight = loadModeRef.current === "bw";
      const parsedWeight = parsePositiveNumber(draft.weight.trim(), 9999);
      const parsedPosition = parsePositiveInt(draft.position.trim(), 999);
      const repsNum = parsePositiveInt(draft.reps.trim(), 9999);
      if (repsNum == null) return Promise.resolve();
      if (plateMode && parsedPosition == null) return Promise.resolve();
      if (!plateMode && !bodyweight && parsedWeight == null) return Promise.resolve();
      const position =
        plateMode && parsedPosition != null
          ? clampPlatePosition(parsedPosition, plateConfig)
          : null;
      const weight = plateMode || bodyweight ? null : parsedWeight;

      // Same values => same request id (a lost response replays safely);
      // edited values => a fresh id, because replaying the old one with a
      // changed payload is a permanent 409.
      const attempt = plateMode
        ? `pos:${position}|${repsNum}`
        : `${weight ?? "bw"}|${repsNum}`;
      const { requestId, lastAttempt } = requestIdForAttempt(
        draft,
        attempt,
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
        ...(plateMode
          ? {
              plate_position: position,
              plate_increment: plateConfig?.increment ?? null,
              plate_unit: plateConfig?.unit ?? null,
            }
          : {}),
        plan_day_id: planDayId ?? null,
      })
        .then(() => {
          if (initializedScopeRef.current !== requestScope) return;
          // Keep the row where it is and mark it saved, so the input you were on
          // doesn't vanish and the set doesn't jump to the list above.
          applyDrafts((current) =>
            current.map((entry) =>
              entry.key === key
                ? { ...entry, status: "saved", savedWeight: weight, savedPosition: position }
                : entry,
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
    [applyDrafts, date, name, onAddSet, planDayId, plateConfig, plateMode, scopeKey],
  );

  const patchDraft = useCallback(
    (key: string, patch: Partial<Pick<Draft, "weight" | "reps" | "position">>) => {
      applyDrafts((current) =>
        current.map((entry) => {
          if (entry.key !== key) return entry;
          // Keep requestId stable across retries so a timeout-retry replays the
          // same idempotent request instead of logging the set twice (matches
          // quick-log in app/(tabs)/lift.tsx and useLiftLogs dedup by id).
          return { ...entry, ...patch, touched: true, status: "editing" };
        }),
      );
      // Commit on row blur / checkmark, never on a typing pause: a 1.2s timer
      // used to save "6" while the athlete was still typing "60".
    },
    [applyDrafts],
  );

  const handleFocus = useCallback((key: string) => {
    focusedRowRef.current = key;
  }, []);

  const handleBlur = useCallback(
    (key: string) => {
      if (focusedRowRef.current === key) focusedRowRef.current = null;
      setTimeout(() => {
        if (focusedRowRef.current === key) return;
        commitSet(key, false);
      }, 0);
    },
    [commitSet],
  );

  const addDraft = useCallback(() => {
    const highestOrdinal = draftsRef.current.reduce(
      (highest, draft) => Math.max(highest, draft.ordinal),
      doneCount,
    );
    applyDrafts((current) => [
      ...current,
      makeDraft(
        highestOrdinal + 1,
        current[current.length - 1]?.weight ?? "",
        current[current.length - 1]?.reps ?? "",
        current[current.length - 1]?.position ?? "",
      ),
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
  const bodyweight = !plateMode && loadMode === "bw";
  const targetText = plateMode
    ? formatPlanLoad({ load_mode: "plate", plate_config: plateConfig })
    : formatTargetWeight({ sets, weight_kg: plannedWeight, set_targets: setTargets });
  /** The previous session in one glance; tapping it opens every set. */
  const lastSummary = lastSession
    ? lastSessionSummary(lastSession.sets)
    : lastLog
      ? formatLiftSet(lastLog)
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

      {lastSummary ? (
        <View style={styles.lastBlock}>
          {lastSession ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: historyOpen }}
              accessibilityLabel="Show the previous session's sets"
              onPress={() => setHistoryOpen((open) => !open)}
              style={({ pressed }) => [styles.lastStrip, pressed && styles.pressed]}
            >
              <View style={styles.lastIcon}>
                <Ionicons name="time-outline" size={13} color={colors.textDim} />
              </View>
              <View style={styles.lastMain}>
                <Text style={styles.lastLabel} numberOfLines={1}>
                  Last session
                </Text>
                <Text style={styles.lastValue} numberOfLines={1}>
                  {lastSummary}
                </Text>
              </View>
              <Text style={styles.lastDate}>{formatMediumDate(lastSession.date)}</Text>
              <Ionicons
                name={historyOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
              />
            </Pressable>
          ) : (
            <View style={styles.lastStrip}>
              <View style={styles.lastIcon}>
                <Ionicons name="time-outline" size={13} color={colors.textDim} />
              </View>
              <View style={styles.lastMain}>
                <Text style={styles.lastLabel} numberOfLines={1}>
                  Last set
                </Text>
                <Text style={styles.lastValue} numberOfLines={1}>
                  {lastSummary}
                </Text>
              </View>
            </View>
          )}

          {historyOpen && lastSession ? (
            <View style={styles.historyPanel}>
              {lastSession.sets.map((set, i) => (
                <View
                  key={`${i}-${set.weight_kg}-${set.plate_position ?? "x"}-${set.reps}`}
                  style={styles.setPill}
                >
                  <Text style={styles.setPillIndex}>{i + 1}</Text>
                  <Text style={styles.setPillValue}>{formatLiftSet(set)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.expanded}>
          {plateMode ? (
            <Text style={[typography.small, styles.plateModeNote]}>
              {plateConfig
                ? `Machine stack · ${plateConfig.increment}${plateConfig.unit} per position`
                : "Machine stack · log the numbered position"}
            </Text>
          ) : (
            <SegmentedControl
              options={[
                { value: "kg", label: "Weighted" },
                { value: "bw", label: "Bodyweight" },
              ]}
              value={loadMode}
              onChange={changeLoadMode}
            />
          )}
          {visibleLogged.length > 0 ? (
            <View style={styles.loggedList}>
              {visibleLogged.map((entry) => (
                <View key={entry.id} style={styles.loggedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={typography.bodyStrong}>{formatLiftSet(entry)}</Text>
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
            const hint = plateMode
              ? planHintFor(draft.ordinal - 1, { sets, reps, weight_kg: null })
              : planHintFor(draft.ordinal - 1, {
                  sets,
                  reps,
                  weight_kg: plannedWeight,
                  set_targets: setTargets,
                });
            const draftReps = parsePositiveInt(draft.reps, 9999) ?? 0;
            const rawPosition = parsePositiveInt(draft.position, 999);
            const draftPosition =
              rawPosition != null ? clampPlatePosition(rawPosition, plateConfig) : null;
            const estimate =
              plateMode && draftPosition != null
                ? estimatedPlateLoad(draftPosition, plateConfig)
                : null;
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
                    {plateMode
                      ? formatPlateSet(
                          {
                            plate_position: draft.savedPosition ?? null,
                            plate_increment: plateConfig?.increment ?? null,
                            plate_unit: plateConfig?.unit ?? null,
                          },
                          draftReps,
                        )
                      : formatLiftSet({
                          weight_kg: draft.savedWeight ?? null,
                          reps: draftReps,
                        })}
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
                  {bodyweight ? (
                    <View style={styles.bwField}>
                      <Text style={styles.bwFieldText}>BW</Text>
                    </View>
                  ) : plateMode ? (
                    <PlatePositionField
                      value={draft.position}
                      min={plateMin}
                      max={plateMax}
                      onChangeText={(text) => patchDraft(draft.key, { position: text })}
                      onFocus={() => handleFocus(draft.key)}
                      onBlur={() => handleBlur(draft.key)}
                      editable={draft.status !== "saving"}
                    />
                  ) : (
                    <StepField
                      value={draft.weight}
                      onChangeText={(text) => patchDraft(draft.key, { weight: text })}
                      onFocus={() => handleFocus(draft.key)}
                      onBlur={() => handleBlur(draft.key)}
                      placeholder="kg"
                      label="Weight"
                      editable={draft.status !== "saving"}
                    />
                  )}
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
                        void commitSet(draft.key);
                      }}
                      disabled={!canLogDraft(draft, bodyweight, plateMode)}
                      hitSlop={8}
                      style={styles.tick}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={26}
                        color={
                          canLogDraft(draft, bodyweight, plateMode)
                            ? colors.primary
                            : colors.borderStrong
                        }
                      />
                    </Pressable>
                  )}
                </View>
                {estimate != null ? (
                  <View style={styles.planHint}>
                    <Ionicons name="calculator-outline" size={12} color={colors.textDim} />
                    <Text style={styles.planHintText}>
                      ≈ {estimate} {plateConfig?.unit}
                    </Text>
                  </View>
                ) : null}
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

/** Numbered stack position input with ± that stays inside the plan's range. */
function PlatePositionField({
  value,
  min,
  max,
  onChangeText,
  onFocus,
  onBlur,
  editable,
}: {
  value: string;
  min: number;
  max: number;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  editable: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const nudge = (direction: 1 | -1) => {
    const parsed = Number(value);
    const current =
      value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
    const next =
      current == null
        ? direction === 1
          ? min
          : null
        : clampPositionToRange(current + direction, min, max);
    onChangeText(next != null ? String(next) : "");
  };

  return (
    <View style={styles.positionField}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease position"
        onPress={() => nudge(-1)}
        disabled={!editable}
        hitSlop={6}
        style={({ pressed }) => [styles.positionButton, pressed && styles.pressed]}
      >
        <Ionicons name="remove" size={18} color={colors.textDim} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="pos"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        editable={editable}
        selectTextOnFocus
        accessibilityLabel="Stack position"
        style={styles.positionInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase position"
        onPress={() => nudge(1)}
        disabled={!editable}
        hitSlop={6}
        style={({ pressed }) => [styles.positionButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={18} color={colors.textDim} />
      </Pressable>
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
    lastBlock: {
      marginTop: spacing.sm,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.md,
      overflow: "hidden",
    },
    lastStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    lastIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    lastMain: { flex: 1, gap: 1, minWidth: 0 },
    lastLabel: { ...t.typography.caption, color: t.colors.textMuted },
    lastValue: { ...t.typography.small, fontWeight: "600", color: t.colors.text },
    lastDate: { ...t.typography.caption, color: t.colors.textMuted },
    historyPanel: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    setPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: t.colors.surface,
      borderRadius: radii.sm,
      paddingHorizontal: 8,
      height: 28,
    },
    setPillIndex: { fontSize: 10, fontWeight: "700", color: t.colors.textMuted },
    setPillValue: { fontSize: 12, fontWeight: "600", color: t.colors.text },
    tags: { flexDirection: "row", gap: spacing.xs, marginTop: 2, flexWrap: "wrap" },
    expanded: { marginTop: spacing.md, gap: spacing.sm },
    plateModeNote: { color: t.colors.textDim },
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
    bwField: {
      flex: 1,
      height: 44,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    bwFieldText: { fontSize: 14, fontWeight: "700", color: t.colors.textDim, letterSpacing: 0.5 },
    positionField: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.md,
      height: 44,
      overflow: "hidden",
    },
    positionButton: { width: 30, height: 42, alignItems: "center", justifyContent: "center" },
    positionInput: {
      flex: 1,
      minWidth: 24,
      padding: 0,
      textAlign: "center",
      fontSize: 15,
      color: t.colors.text,
    },
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
