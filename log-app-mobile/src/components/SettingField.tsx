import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { parsePositiveInt } from "../utils/parse";
import { successTick } from "../hooks/useHaptics";

/** Numeric settings field that saves on blur (blank clears the value). */
export function SettingField({
  label,
  unit,
  value,
  hint,
  onSave,
}: {
  label: string;
  unit: string;
  value: number | null;
  hint?: string;
  onSave: (value: number | null) => Promise<void>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = async () => {
    focused.current = false;
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : parsePositiveInt(trimmed, 99999);

    if (trimmed !== "" && next == null) {
      setError("Enter a whole number from 1 to 99999.");
      return;
    }
    if (next === value) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(next);
      setSaved(true);
      successTick();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setDraft(value != null ? String(value) : "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {saving ? <Text style={styles.saving}>saving…</Text> : null}
        {!saving && saved ? (
          <View style={styles.savedRow}>
            <Ionicons name="checkmark-circle" size={13} color={colors.success} />
            <Text style={styles.saved}>saved</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            setSaved(false);
            setError(null);
          }}
          onFocus={() => (focused.current = true)}
          onBlur={commit}
          keyboardType="numeric"
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          style={[typography.metric, styles.input]}
        />
        <Text style={typography.metricUnit}>{unit}</Text>
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
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
      padding: spacing.lg,
      gap: spacing.sm,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    label: { ...t.typography.caption, color: t.colors.textDim },
    saving: { ...t.typography.caption, color: t.colors.textMuted },
    savedRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    saved: { ...t.typography.caption, color: t.colors.success },
    valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
    input: { flex: 1, padding: 0 },
    error: { ...t.typography.small, color: t.colors.danger },
    hint: { ...t.typography.caption, color: t.colors.textMuted },
  }),
);
