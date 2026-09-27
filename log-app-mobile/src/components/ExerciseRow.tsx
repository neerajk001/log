import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, shadows, spacing } from "../theme/spacing";
import { exerciseTypeFor } from "../utils/derive";
import { muscleTagStyle, typeTagStyle } from "../utils/tags";
import { parsePositiveInt, parsePositiveNumber } from "../utils/parse";
import type { LiftLog, LiftLogCreate } from "../api/types";
import { useLiftHistory } from "../hooks/useLiftHistory";
import { useCurrentDate } from "../hooks/useCurrentDate";
import { successTick } from "../hooks/useHaptics";
import { IconBadge, Tag } from "./ui/primitives";

const AUTOSAVE_DELAY_MS = 1200;

type RowStatus = "idle" | "editing" | "saving" | "saved" | "error";

interface Draft {
  weight: string;
  reps: string;
  status: RowStatus;
}

function blankDraft(): Draft {
  return { weight: "", reps: "", status: "idle" };
}

/**
 * Expandable exercise row. Expanding shows every planned set row up front,
 * pre-filled with last session's values; each row autosaves ~2.5s after the
 * user stops typing. No checkboxes, no save button.
 */
export function ExerciseRow({
  index,
  name,
  sets,
  reps,
  muscle,
  lastLog,
  loggedSets,
  planDayId,
  date,
  expanded,
  onToggle,
  onAddSet,
  onDeleteSet,
  showChevron = false,
}: {
  index: number;
  name: string;
  sets: number;
  reps: string;
  muscle?: string;
  lastLog?: { weight_kg: number; reps: number } | null;
  loggedSets?: LiftLog[];
  planDayId?: string | null;
  date?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onAddSet?: (data: LiftLogCreate) => Promise<LiftLog>;
  onDeleteSet?: (id: string) => void;
  showChevron?: boolean;
}) {
  const { colors, scheme, typography } = useTheme();
  const styles = useStyles();
  const type = exerciseTypeFor(name);
  const tagTheme = { colors, scheme };
  const muscleStyle = muscleTagStyle(muscle ?? "", tagTheme);
  const logged = useMemo(() => loggedSets ?? [], [loggedSets]);
  const doneCount = logged.length;

  const { logs: history } = useLiftHistory(expanded ? name : null);
  const today = useCurrentDate();
  const lastSession = useMemo(() => {
    return history.find((h) => h.date < today) ?? history[0] ?? null;
  }, [history, today]);
  const seed = useMemo(
    () =>
      lastSession
        ? { weight_kg: Number(lastSession.weight_kg), reps: lastSession.reps }
        : lastLog,
    [lastSession, lastLog],
  );

  const expandKey = `${name}:${sets}:${logged.map((l) => l.id).join(",")}`;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const prefilledKey = useRef("");
  useEffect(() => {
    if (!expanded) return;
    if (prefilledKey.current === expandKey) return;
    prefilledKey.current = expandKey;
    const count = Math.max(1, sets - logged.length);
    const fill =
      seed != null
        ? { weight: String(seed.weight_kg), reps: String(seed.reps) }
        : { weight: "", reps: "" };
    setDrafts(Array.from({ length: count }, () => ({ ...fill, status: "idle" as RowStatus })));
  }, [expanded, expandKey, sets, logged.length, seed]);

  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const savedSig = useRef<Record<number, string>>({});
  const savingRef = useRef<Record<number, boolean>>({});
  const draftsRef = useRef<Draft[]>([]);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const clearTimer = useCallback((i: number) => {
    const t = timers.current[i];
    if (t) {
      clearTimeout(t);
      delete timers.current[i];
    }
  }, []);

  useEffect(
    () => () => {
      for (const t of Object.values(timers.current)) clearTimeout(t);
      timers.current = {};
    },
    [],
  );

  const commitSet = useCallback(
    async (i: number) => {
      if (!onAddSet || !date || savingRef.current[i]) return;
      const d = draftsRef.current[i];
      if (!d) return;
      const weight = parsePositiveNumber(d.weight.trim(), 9999);
      const repsNum = parsePositiveInt(d.reps.trim(), 9999);
      if (weight == null || repsNum == null) return;
      const sig = `${weight}|${repsNum}`;
      if (savedSig.current[i] === sig) return;
      savingRef.current[i] = true;
      setDrafts((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "saving" } : r)));
      try {
        await onAddSet({
          date,
          exercise_name: name,
          weight_kg: weight,
          reps: repsNum,
          plan_day_id: planDayId ?? null,
        });
        savedSig.current[i] = sig;
        setDrafts((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "saved" } : r)));
        successTick();
        setTimeout(() => {
          setDrafts((prev) => prev.map((r, idx) => (idx === i && r.status === "saved" ? { ...r, status: "idle" } : r)));
        }, 800);
      } catch {
        setDrafts((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "error" } : r)));
      } finally {
        savingRef.current[i] = false;
      }
    },
    [date, name, onAddSet, planDayId, setDrafts],
  );

  const patchDraft = useCallback(
    (i: number, patch: Partial<Pick<Draft, "weight" | "reps">>) => {
      setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch, status: "editing" } : d)));
      clearTimer(i);
      timers.current[i] = setTimeout(() => {
        delete timers.current[i];
        commitSet(i);
      }, AUTOSAVE_DELAY_MS);
    },
    [clearTimer, commitSet, setDrafts],
  );

  const flushRow = useCallback(
    (i: number) => {
      clearTimer(i);
      commitSet(i);
    },
    [clearTimer, commitSet],
  );

  const confirmDelete = useCallback(
    (id: string) => {
      if (!onDeleteSet) return;
      Alert.alert("Delete set?", "This removes the logged set.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDeleteSet(id) },
      ]);
    },
    [onDeleteSet],
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
          {logged.length > 0 ? (
            <View style={styles.loggedList}>
              {logged.map((l) => (
                <View key={l.id} style={styles.loggedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={typography.bodyStrong}>
                    {l.weight_kg} kg × {l.reps}
                  </Text>
                  <Pressable onPress={() => confirmDelete(l.id)} hitSlop={8} accessibilityLabel="Delete set">
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {drafts.map((d, i) => (
            <View key={i} style={[styles.setRow, d.status === "error" && styles.setRowError]}>
              <View style={styles.setBadge}>
                <Text style={styles.setBadgeText}>{logged.length + i + 1}</Text>
              </View>
              <TextInput
                value={d.weight}
                onChangeText={(t) => patchDraft(i, { weight: t })}
                onBlur={() => flushRow(i)}
                keyboardType="numeric"
                placeholder="kg"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={d.status !== "saving"}
              />
              <Text style={styles.x}>×</Text>
              <TextInput
                value={d.reps}
                onChangeText={(t) => patchDraft(i, { reps: t })}
                onBlur={() => flushRow(i)}
                keyboardType="numeric"
                placeholder="reps"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={d.status !== "saving"}
              />
              <RowStatusIcon status={d.status} />
            </View>
          ))}

          <Pressable
            onPress={() => setDrafts((prev) => [...prev, blankDraft()])}
            hitSlop={8}
            style={styles.addSet}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addSetText}>Add set</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function RowStatusIcon({ status }: { status: RowStatus }) {
  const { colors } = useTheme();
  if (status === "saving") return null;
  if (status === "saved")
    return <Ionicons name="checkmark-circle" size={22} color={colors.success} />;
  if (status === "error")
    return <Ionicons name="alert-circle" size={22} color={colors.danger} />;
  if (status === "editing")
    return <Ionicons name="ellipse-outline" size={22} color={colors.textDim} />;
  return <View style={{ width: 22 }} />;
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
    addSet: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
    addSetText: { fontSize: 14, fontWeight: "600", color: t.colors.primary },
  }),
);
