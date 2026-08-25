import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing } from "../theme/spacing";

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
}

export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={[typography.screenTitle, styles.title]}>{title}</Text>
      <Text style={typography.bodyLabel}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.graphite,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.screenPadding,
  },
  title: {
    marginBottom: 8,
  },
});
