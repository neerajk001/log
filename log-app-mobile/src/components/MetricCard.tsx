import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, shadows, spacing } from "../theme/spacing";
import { IconBadge, type IoniconName } from "./ui/primitives";
import { MAX_DAILY, parsePositiveNumber } from "../utils/parse";
import { successTick } from "../hooks/useHaptics";

/**
 * Today metric tile: compact 2-up card like the design — icon + label + lock
 * row on top, big logged value + unit below. Tappable to edit inline, saves
 * on blur (no explicit save button).
 */
export function MetricCard({
  field,
  label,
  value,
  placeholder,
  unit,
  icon,
  iconBg,
  iconColor,
  locked = false,
  onToggleLock,
  onSave,
  fieldError,
}: {
  field: keyof typeof MAX_DAILY;
  label: string;
  value: number | null;
  placeholder?: number | null;
  unit: string;
  icon: IoniconName;
  iconBg: string;
  iconColor: string;
  locked?: boolean;
  onToggleLock?: () => void;
  onSave: (value: number | null) => void;
  fieldError?: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const display = value != null ? String(value) : placeholder != null ? String(placeholder) : "—";
  const isPlaceholder = value == null && placeholder != null;

  const startEdit = useCallback(() => {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value != null) {
        Alert.alert(`Clear ${label}?`, "This removes the logged value.", [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", style: "destructive", onPress: () => onSave(null) },
        ]);
      }
      return;
    }
    const num = parsePositiveNumber(trimmed, MAX_DAILY[field]);
    if (num != null) {
      onSave(num);
      successTick();
    }
  }, [draft, field, label, value, onSave]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${display} ${unit}`}
      onPress={startEdit}
      style={[styles.tile, fieldError ? styles.tileError : null]}
    >
      <View style={styles.topRow}>
        <IconBadge name={icon} bg={iconBg} color={iconColor} size={28} rounded={false} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {onToggleLock ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={locked ? `Unlock ${label} default` : `Lock ${label} as daily default`}
            onPress={onToggleLock}
            hitSlop={8}
            style={styles.lock}
          >
            <Ionicons
              name={locked ? "lock-closed" : "lock-open-outline"}
              size={15}
              color={locked ? colors.primary : colors.textMuted}
            />
          </Pressable>
        ) : null}
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>

      <View style={styles.valueRow}>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            autoFocus
            selectTextOnFocus
            keyboardType="numeric"
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            style={[typography.metric, styles.input]}
          />
        ) : (
          <Text style={[typography.metric, isPlaceholder && styles.placeholder]} numberOfLines={1}>
            {display}
          </Text>
        )}
        <Text style={typography.metricUnit}>{unit}</Text>
      </View>

      {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    tile: {
      width: "48%",
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
      gap: spacing.xs,
      ...shadows.card,
    },
    tileError: { borderColor: t.colors.danger },
    topRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    lock: { marginLeft: "auto", padding: 2 },
    label: { ...t.typography.small, color: t.colors.textDim, flexShrink: 1 },
    valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
    input: { flex: 1, padding: 0, minWidth: 40 },
    placeholder: { color: t.colors.textMuted },
    error: { ...t.typography.caption, color: t.colors.danger },
  }),
);
