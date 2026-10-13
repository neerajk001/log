import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "../../src/theme/spacing";

const EMBLEM = require("../../assets/images/Glossy Mint Wave Sunset Emblem.png");

// Mint-on-black, matching the welcome/intro screens (outside the app theme).
const MINT = "#BEE3B6";
const ON_MINT = "#0C150C";
const INK = "#0A0B0B";
const SURFACE = "#15191B";
const LINE = "#242B2D";
const TEXT = "#F2F3F0";

/** Final onboarding screen — brand mark plus the two account actions. */
export default function AccountScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.center}>
        <Image source={EMBLEM} style={styles.emblem} />
        <Text style={styles.wordmark}>Repora</Text>
        <Text style={styles.tagline}>TRACK. IMPROVE. EVOLVE.</Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Account"
          onPress={() => router.replace("/sign-in" as never)}
          style={({ pressed }) => [styles.cta, pressed ? styles.pressed : null]}
        >
          <Text style={styles.ctaLabel}>Create Account</Text>
          <Ionicons name="arrow-forward" size={18} color={ON_MINT} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="I Already Have an Account"
          onPress={() => router.replace("/sign-in" as never)}
          style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : null]}
        >
          <Text style={styles.secondaryLabel}>I Already Have an Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: INK, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  emblem: { width: 150, height: 150, borderRadius: 75 },
  wordmark: { color: TEXT, fontSize: 46, fontWeight: "700", letterSpacing: 0.5, marginTop: spacing.md },
  tagline: { color: MINT, fontSize: 12, fontWeight: "700", letterSpacing: 3 },

  actions: { gap: spacing.sm },
  pressed: { opacity: 0.9 },
  cta: {
    height: 56,
    borderRadius: 28,
    backgroundColor: MINT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  ctaLabel: { color: ON_MINT, fontSize: 16, fontWeight: "700" },
  secondary: {
    height: 56,
    borderRadius: 28,
    backgroundColor: SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  secondaryLabel: { color: TEXT, fontSize: 16, fontWeight: "600" },
});
