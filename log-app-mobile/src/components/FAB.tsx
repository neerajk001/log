import { Pressable, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, shadows } from "../theme/spacing";

interface FABProps {
  label: string;
  onPress: () => void;
}

export function FAB({ label, onPress }: FABProps) {
  return (
    <Pressable style={[styles.fab, shadows.fab]} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: spacing.fabBottom,
    right: spacing.fabRight,
    backgroundColor: colors.rust,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: spacing.cardRadius,
    elevation: 8,
  },
  label: {
    fontFamily: "JetBrainsMono",
    fontSize: 14,
    color: colors.chalk,
    fontWeight: "600",
  },
});
