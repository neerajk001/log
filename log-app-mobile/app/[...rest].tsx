import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";

/**
 * Catch-all for unknown / deep-link paths (including the OAuth SSO callback).
 * Sends the user to Today when authenticated, otherwise to sign-in.
 */
export default function CatchAllScreen() {
  const params = useLocalSearchParams<{ rest?: string[] }>();
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const segments = Array.isArray(params.rest) ? params.rest : params.rest ? [params.rest] : [];
  const path = segments.join("/");
  const isSsoCallback = path.includes("sso-callback");

  useEffect(() => {
    if (!isLoaded) return;
    if (isSsoCallback && !isSignedIn) return;
    router.replace((isSignedIn ? "/(tabs)/today" : "/sign-in") as never);
  }, [isLoaded, isSignedIn, isSsoCallback, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={typography.small}>{isSsoCallback ? "Completing sign in…" : "Loading…"}</Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: t.colors.bg,
      gap: 16,
    },
  }),
);
