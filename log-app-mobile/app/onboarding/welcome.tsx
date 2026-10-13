import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";

// Bundled assets (Metro `require`, as Expo types them).
const BG_IMAGE = require("../../assets/images/welcome.png");
const EMBLEM = require("../../assets/images/Glossy Mint Wave Sunset Emblem.png");

// Brand colours from the welcome mockup (deliberately outside the app palette).
const MINT = "#BEE3B6";
const ON_MINT = "#0C150C";
const TAGLINE_MINT = "#9BDD94";

/** Faked vertical fade so we don't pull in a gradient dependency. */
function Fade({ from, to, style }: { from: number; to: number; style?: StyleProp<ViewStyle> }) {
  const bands = 10;
  return (
    <View pointerEvents="none" style={style}>
      {Array.from({ length: bands }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: `rgba(0,0,0,${(from + ((to - from) * (i + 1)) / bands).toFixed(3)})`,
          }}
        />
      ))}
    </View>
  );
}

/** First onboarding screen — full-bleed hero with the brand mark. */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const start = () => router.navigate("/onboarding/intro" as never);
  const skip = () => router.navigate("/onboarding/account" as never);

  return (
    <ImageBackground source={BG_IMAGE} style={styles.container} resizeMode="cover">
      <StatusBar style="light" />

      <Fade from={0.55} to={0} style={styles.topFade} />
      <Fade from={0} to={0.85} style={styles.bottomFade} />

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip" hitSlop={10} onPress={skip}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.spacerTop} />

        <View style={styles.brand}>
          <Image source={EMBLEM} style={styles.emblem} />
          <Text style={styles.wordmark}>Repora</Text>
          <Text style={styles.tagline}>TRACK. IMPROVE. EVOLVE.</Text>
        </View>

        <View style={styles.spacerBottom} />

        <Text style={styles.headline}>A Healthier{"\n"}Stronger{"\n"}Happier You</Text>
        <Text style={styles.subtitle}>
          Track your workouts, nutrition, sleep, weight and more — all in one place with your
          personal AI coach.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get Started"
          onPress={start}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaLabel}>Get Started</Text>
          <Ionicons name="arrow-forward" size={18} color={ON_MINT} />
        </Pressable>
      </View>
    </ImageBackground>
  );
}

const useStyles = makeUseStyles(() =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000000" },
    topFade: { position: "absolute", left: 0, right: 0, top: 0, height: 180 },
    bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" },

    content: { flex: 1, paddingHorizontal: spacing.lg },
    topRow: { alignItems: "flex-end" },
    skip: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },

    spacerTop: { flex: 0.8 },

    brand: { alignItems: "center" },
    emblem: { width: 108, height: 108, borderRadius: 54 },
    wordmark: {
      color: "#FFFFFF",
      fontSize: 38,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginTop: spacing.md,
    },
    tagline: {
      color: TAGLINE_MINT,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 3,
      marginTop: spacing.sm,
    },

    spacerBottom: { flex: 1 },

    headline: { color: "#FFFFFF", fontSize: 34, fontWeight: "800", lineHeight: 39 },
    subtitle: { color: "#D5D5D5", fontSize: 15, lineHeight: 22, marginTop: spacing.sm },

    cta: {
      marginTop: spacing.xl,
      height: 56,
      borderRadius: 28,
      backgroundColor: MINT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    ctaPressed: { opacity: 0.9 },
    ctaLabel: { color: ON_MINT, fontSize: 16, fontWeight: "700" },
  }),
);
