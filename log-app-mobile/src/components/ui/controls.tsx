import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, shadows, spacing } from "../../theme/spacing";
import { Divider, ListRow, type IoniconName } from "./primitives";

/* ------------------------------------------------------- SegmentedControl */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.segmentTrack, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ Chip */

export function Chip({
  label,
  active = false,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.chipRow, style]}
    >
      {children}
    </ScrollView>
  );
}

/* ------------------------------------------------------------- TextField */

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  autoCapitalize = "none",
  error,
  style,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.inputMultiline, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/* ----------------------------------------------------------------- Sheet */

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          {title ? <Text style={[typography.h3, styles.sheetTitle]}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ----------------------------------------------------------- OverflowMenu */

export interface MenuAction {
  label: string;
  icon?: IoniconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function OverflowMenu({
  visible,
  onClose,
  actions,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  actions: MenuAction[];
  title?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.menu}>
        {actions.map((action, i) => (
          <View key={action.label}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              icon={action.icon ?? (action.destructive ? "trash-outline" : "ellipse-outline")}
              iconBg={action.destructive ? colors.dangerSoft : colors.surfaceAlt}
              iconColor={action.destructive ? colors.danger : colors.text}
              title={action.label}
              destructive={action.destructive}
              disabled={action.disabled}
              subtitle={action.disabled ? "Not available" : undefined}
              chevron={false}
              onPress={() => {
                onClose();
                action.onPress();
              }}
            />
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ IconButton */

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color,
  size = 22,
  style,
}: {
  name: IoniconName;
  onPress?: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, style]}
    >
      <Ionicons name={name} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    pressed: { opacity: 0.7 },

    segmentTrack: {
      flexDirection: "row",
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.pill,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      height: 38,
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: { backgroundColor: t.colors.primary, ...shadows.card },
    segmentText: { fontSize: 14, fontWeight: "600", color: t.colors.textDim },
    segmentTextActive: { color: t.colors.onPrimary },

    chip: {
      paddingHorizontal: spacing.lg,
      height: 38,
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    chipIdle: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    chipActive: { backgroundColor: t.colors.primarySoft, borderColor: t.colors.primary },
    chipText: { fontSize: 14, fontWeight: "600", color: t.colors.text },
    chipTextActive: { color: t.colors.primary },
    chipRow: { gap: spacing.sm, paddingVertical: 2 },

    field: { gap: spacing.xs },
    fieldLabel: { ...t.typography.caption, color: t.colors.textDim },
    input: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      height: 48,
      fontSize: 15,
      color: t.colors.text,
    },
    inputMultiline: { height: 120, paddingTop: spacing.md },
    inputError: { borderColor: t.colors.danger },
    fieldError: { ...t.typography.small, color: t.colors.danger },

    backdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.colors.overlay,
    },
    sheetWrap: { flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: t.colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      ...shadows.raised,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.colors.borderStrong,
      marginBottom: spacing.md,
    },
    sheetTitle: { marginBottom: spacing.sm },
    menu: { marginHorizontal: -spacing.lg },

    iconButton: { padding: spacing.xs },
  }),
);
