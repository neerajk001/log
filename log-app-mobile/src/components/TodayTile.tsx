import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing } from "../theme/spacing";

interface TodayTileProps {
  label: string;
  value: number | null;
  placeholder: number | null;
  unit: string;
  fieldError?: string;
  onSave: (value: number | null) => void;
}

type InputMode = "none" | "text" | "decimal" | "numeric" | "search" | "email" | "tel" | "url" | undefined;

export function TodayTile({ label, value, placeholder, unit, fieldError, onSave }: TodayTileProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const displayValue = value != null ? String(value) : (placeholder != null ? String(placeholder) : "—");
  const isPlaceholder = value == null && placeholder != null;

  const handlePress = useCallback(() => {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  }, [value]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      onSave(null);
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num > 0) {
        onSave(num);
      }
    }
  }, [draft, onSave]);

  return (
    <Pressable
      style={[styles.tile, fieldError ? styles.tileError : null]}
      onPress={handlePress}
    >
      <Text style={typography.sectionLabel}>{label}</Text>
      {editing ? (
        <TextInput
          style={[typography.data, styles.input]}
          value={draft}
          onChangeText={setDraft}
          onBlur={handleBlur}
          keyboardType="numeric"
          inputMode={"decimal" satisfies InputMode as InputMode}
          autoFocus
          selectTextOnFocus
          placeholderTextColor={colors.chalkDim}
        />
      ) : (
        <Text style={[typography.data, isPlaceholder && styles.placeholderText]}>
          {displayValue}
          {displayValue !== "—" ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
      )}
      {fieldError ? (
        <Text style={styles.errorText}>{fieldError}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadius,
    borderWidth: spacing.cardBorder,
    borderColor: colors.hairline,
    padding: 14,
    minHeight: 90,
  },
  tileError: {
    borderColor: colors.rust,
  },
  input: {
    padding: 0,
    marginTop: 4,
  },
  placeholderText: {
    color: colors.chalkDim,
  },
  unit: {
    fontSize: 13,
    color: colors.steel,
  },
  errorText: {
    fontFamily: "Inter",
    fontSize: 10,
    color: colors.rust,
    marginTop: 4,
  },
});
