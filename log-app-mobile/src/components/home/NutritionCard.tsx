import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, G } from "react-native-svg";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { Card, type IoniconName } from "../ui/primitives";
import { formatNumber } from "../../utils/derive";
import { MAX_DAILY, parsePositiveInt } from "../../utils/parse";

const RING_SIZE = 68;
const RING_STROKE = 6;

/** Circular progress with an icon in the middle. */
function Ring({ progress, color, icon }: { progress: number; color: string; icon: IoniconName }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const center = RING_SIZE / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(1, Math.max(0, progress));

  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle cx={center} cy={center} r={radius} stroke={colors.chartTrack} strokeWidth={RING_STROKE} fill="none" />
          {filled > 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={[circumference, circumference]}
              strokeDashoffset={circumference * (1 - filled)}
              strokeLinecap="round"
            />
          ) : null}
        </G>
      </Svg>
      <View style={styles.ringCenter}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
    </View>
  );
}

/** Tap the number to type a corrected total for the day. */
function EditableValue({
  value,
  accessibilityLabel,
  onSave,
}: {
  value: number;
  accessibilityLabel: string;
  onSave: (value: number | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      onSave(null);
      return;
    }
    const num = parsePositiveInt(trimmed, MAX_DAILY.calories);
    if (num != null) onSave(num);
  };

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        autoFocus
        selectTextOnFocus
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        style={[styles.value, styles.valueInput]}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {formatNumber(value)}
      </Text>
    </Pressable>
  );
}

function Metric({
  value,
  target,
  unit,
  color,
  icon,
  accessibilityLabel,
  onSave,
}: {
  value: number;
  target: number | null;
  unit: string;
  color: string;
  icon: IoniconName;
  accessibilityLabel: string;
  onSave: (value: number | null) => void;
}) {
  const styles = useStyles();
  const progress = target != null && target > 0 ? value / target : 0;

  return (
    <View style={styles.metric}>
      <Ring progress={progress} color={color} icon={icon} />
      <View style={styles.metricText}>
        <EditableValue value={value} accessibilityLabel={accessibilityLabel} onSave={onSave} />
        <Text style={styles.target} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {target != null ? `of ${formatNumber(target)} ${unit}` : "no target"}
        </Text>
      </View>
    </View>
  );
}

function Macro({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  const styles = useStyles();

  return (
    <View style={styles.macro}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{value == null ? "—" : `${formatNumber(value)} g`}</Text>
    </View>
  );
}

/**
 * Today's nutrition: two rings (calories and protein) and a C/P/F summary.
 * Carbs and fat are placeholders until meal estimates start returning them;
 * calories and protein remain the values you can tap and correct.
 */
export function NutritionCard({
  loggedCalories,
  calorieTarget,
  loggedProtein,
  proteinTarget,
  mealCount,
  onLogMeal,
  onPressMeals,
  onEdit,
}: {
  loggedCalories: number;
  calorieTarget: number | null;
  loggedProtein: number;
  proteinTarget: number | null;
  mealCount: number;
  onLogMeal: () => void;
  onPressMeals: () => void;
  onEdit: (field: "calories" | "protein_g", value: number | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const mealLabel = mealCount === 0 ? "No meals yet" : `${mealCount} ${mealCount === 1 ? "meal" : "meals"}`;

  return (
    <Card padded={false} style={styles.card}>
      <View style={styles.rings}>
        <Metric
          value={loggedCalories}
          target={calorieTarget}
          unit="kcal"
          color={colors.green}
          icon="flame"
          accessibilityLabel="Edit calories"
          onSave={(v) => onEdit("calories", v)}
        />
        <View style={styles.verticalDivider} />
        <Metric
          value={loggedProtein}
          target={proteinTarget}
          unit="g"
          color={colors.blue}
          icon="stats-chart"
          accessibilityLabel="Edit protein"
          onSave={(v) => onEdit("protein_g", v)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View meals"
          onPress={onPressMeals}
          hitSlop={10}
          style={({ pressed }) => [styles.chevron, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.macroRow}>
        <Macro label="C" value={null} color={colors.amber} />
        <View style={styles.macroDivider} />
        <Macro label="P" value={loggedProtein} color={colors.blue} />
        <View style={styles.macroDivider} />
        <Macro label="F" value={null} color={colors.pink} />
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${mealLabel}. Open meals`}
          onPress={onPressMeals}
          hitSlop={8}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
        >
          <Text style={styles.footerText}>{mealLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textDim} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log a meal with the coach"
          onPress={onLogMeal}
          hitSlop={8}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.footerAction}>Log meal</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      borderRadius: radii.xl,
      borderColor: t.colors.cardBorder,
      overflow: "hidden",
    },
    rings: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    metric: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
    metricText: { flex: 1, minWidth: 0, gap: 1 },
    ring: { width: RING_SIZE, height: RING_SIZE },
    ringCenter: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    value: { fontSize: 23, fontWeight: "800", letterSpacing: -0.4, color: t.colors.text },
    valueInput: { padding: 0, height: 30 },
    target: { fontSize: 11, fontWeight: "500", color: t.colors.textDim },
    verticalDivider: { width: StyleSheet.hairlineWidth, height: 44, backgroundColor: t.colors.border },
    chevron: { paddingVertical: spacing.sm },
    pressed: { opacity: 0.6 },

    macroRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    macro: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
    dot: { width: 8, height: 8, borderRadius: radii.pill },
    macroLabel: { fontSize: 13, fontWeight: "700", color: t.colors.text },
    macroValue: { fontSize: 13, fontWeight: "500", color: t.colors.textDim },
    macroDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: t.colors.border },

    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    footerButton: { flexDirection: "row", alignItems: "center", gap: 2 },
    footerText: { fontSize: 12, fontWeight: "500", color: t.colors.textDim },
    footerAction: { fontSize: 13, fontWeight: "700", color: t.colors.primary },
  }),
);
