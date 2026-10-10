import { StyleSheet, View } from "react-native";
import { makeUseStyles } from "../../theme/ThemeContext";

/** The segmented progress bar across the top of the onboarding steps. */
export function OnboardingProgress({ step, total }: { step: number; total: number }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.seg, i < step ? styles.segOn : null]} />
      ))}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 4 },
    seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceAlt },
    segOn: { backgroundColor: t.colors.primary },
  }),
);
