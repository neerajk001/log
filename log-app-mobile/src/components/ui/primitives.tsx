import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import type { Palette } from "../../theme/colors";
import { radii, shadows, spacing } from "../../theme/spacing";

export type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const styles = useStyles();
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "outline" | "soft" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  size = "md",
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IoniconName;
  size?: "md" | "sm";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;
  const tone = buttonTones(colors)[variant];
  const textColor = variant === "primary" ? colors.onPrimary : tone.text;
  const iconSize = size === "sm" ? 16 : 18;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        size === "sm" ? styles.buttonSm : styles.buttonMd,
        { backgroundColor: tone.bg, borderColor: tone.border },
        variant !== "primary" && styles.buttonBordered,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={iconSize} color={textColor} /> : null}
          <Text style={[typography.button, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function buttonTones(colors: Palette): Record<ButtonVariant, { bg: string; border: string; text: string }> {
  return {
    primary: { bg: colors.primary, border: colors.primary, text: colors.onPrimary },
    outline: { bg: colors.surface, border: colors.borderStrong, text: colors.text },
    soft: { bg: colors.primarySoft, border: colors.primarySoft, text: colors.primary },
    ghost: { bg: "transparent", border: "transparent", text: colors.primary },
  };
}

/* ------------------------------------------------------------------- Tag */

export function Tag({ label, bg, text }: { label: string; bg: string; text: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: text }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------- IconBadge */

export function IconBadge({
  name,
  bg,
  color,
  size = 40,
  iconSize,
  rounded = true,
}: {
  name: IoniconName;
  bg?: string;
  color?: string;
  size?: number;
  iconSize?: number;
  rounded?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[
        styles.iconBadge,
        {
          width: size,
          height: size,
          borderRadius: rounded ? size / 2 : radii.md,
          backgroundColor: bg ?? colors.surfaceAlt,
        },
      ]}
    >
      <Ionicons name={name} size={iconSize ?? Math.round(size * 0.5)} color={color ?? colors.text} />
    </View>
  );
}

/* --------------------------------------------------------- SectionHeader */

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={typography.sectionLabel}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  subtitle,
  children,
  compact = false,
}: {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.empty, compact && styles.emptyCompact]}>
      <IconBadge name={icon} bg={colors.surfaceAlt} color={colors.textDim} size={44} />
      <Text style={[typography.bodyStrong, styles.emptyTitle]}>{title}</Text>
      {subtitle ? <Text style={[typography.small, styles.emptySubtitle]}>{subtitle}</Text> : null}
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------ ProgressBar */

export function ProgressBar({ value, max = 1 }: { value: number; max?: number }) {
  const styles = useStyles();
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

/* ---------------------------------------------------------------- ListRow */

export function ListRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  value,
  chevron = true,
  onPress,
  disabled = false,
  destructive = false,
  right,
  style,
}: {
  icon?: IoniconName;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.listRow, pressed && !disabled && styles.pressed, style]}
    >
      {icon ? (
        <IconBadge name={icon} bg={iconBg ?? colors.surfaceAlt} color={iconColor ?? colors.text} size={38} />
      ) : null}
      <View style={styles.listRowText}>
        <Text
          style={[typography.bodyStrong, destructive && { color: colors.danger }, disabled && styles.dim]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.small, disabled && styles.dim]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {value ? <Text style={[typography.bodyStrong, styles.listRowValue]}>{value}</Text> : null}
      {chevron ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={disabled ? colors.textMuted : colors.textMuted}
        />
      ) : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Banner */

export function Banner({
  tone = "danger",
  message,
  actionLabel,
  onAction,
  style,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const tones = {
    danger: { bg: colors.dangerSoft, text: colors.danger, icon: "alert-circle" as IoniconName },
    warning: { bg: colors.warningSoft, text: colors.warning, icon: "alert" as IoniconName },
    success: { bg: colors.successSoft, text: colors.success, icon: "checkmark-circle" as IoniconName },
    info: { bg: colors.blueSoft, text: colors.blue, icon: "information-circle" as IoniconName },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: tones.bg }, style]}>
      <Ionicons name={tones.icon} size={16} color={tones.text} />
      <Text style={[typography.small, styles.bannerText, { color: tones.text }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.bannerAction, { color: tones.text }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------- State views */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stateView}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[typography.small, styles.stateText]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stateView}>
      <IconBadge name="cloud-offline" bg={colors.dangerSoft} color={colors.danger} size={44} />
      <Text style={[typography.bodyStrong, styles.stateText]}>{message}</Text>
      {onRetry ? (
        <Button label="Retry" variant="outline" size="sm" icon="refresh" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.divider, style]} />;
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      ...shadows.card,
    },
    cardPadded: { padding: spacing.lg },

    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radii.md,
    },
    buttonMd: { height: 48, paddingHorizontal: spacing.lg },
    buttonSm: { height: 38, paddingHorizontal: spacing.md },
    buttonBordered: { borderWidth: 1 },
    buttonDisabled: { opacity: 0.5 },
    pressed: { opacity: 0.75 },

    tag: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: "flex-start",
    },
    tagText: { fontSize: 11, fontWeight: "600" },

    iconBadge: { alignItems: "center", justifyContent: "center" },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
    sectionActionText: { fontSize: 14, fontWeight: "600", color: t.colors.primary },

    empty: {
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    emptyCompact: { paddingVertical: spacing.lg },
    emptyTitle: { textAlign: "center" },
    emptySubtitle: { textAlign: "center" },
    emptyActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.sm,
      justifyContent: "center",
    },

    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: t.colors.chartTrack,
      overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 3, backgroundColor: t.colors.primary },

    listRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    listRowText: { flex: 1, gap: 2 },
    listRowValue: { color: t.colors.textDim },
    dim: { color: t.colors.textMuted },

    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    bannerText: { flex: 1, color: t.colors.text },
    bannerAction: { fontSize: 13, fontWeight: "700" },

    stateView: {
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      paddingVertical: spacing.xxxl,
    },
    stateText: { textAlign: "center" },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },
  }),
);
