import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import type { VerdictKind } from "../api/types";

interface VerdictStampProps {
  verdict: VerdictKind;
}

const LABELS: Record<VerdictKind, string> = {
  hold: "Hold Steady",
  adjust_calories: "Adjust Calories",
  check_recovery: "Check Recovery",
};

export function VerdictStamp({ verdict }: VerdictStampProps) {
  return (
    <View style={styles.stamp}>
      <Text style={typography.verdicStamp} numberOfLines={2} adjustsFontSizeToFit>
        {LABELS[verdict]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignSelf: "center",
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderWidth: 3,
    borderColor: colors.rust,
    backgroundColor: "transparent",
    transform: [{ rotate: "-6deg" }],
    marginVertical: 12,
  },
});