import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";

export default function SsoCallbackScreen() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const { colors, typography } = useTheme();
  const styles = useStyles();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/(tabs)/today" as never);
    }
  }, [isSignedIn, isLoaded, router]);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 30000);
    return () => clearTimeout(t);
  }, []);

  if (timedOut && !isSignedIn) {
    return (
      <View style={styles.container}>
        <Text style={typography.small}>Sign in timed out or was cancelled.</Text>
        <Pressable onPress={() => router.replace("/sign-in" as never)}>
          <Text style={typography.small}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={typography.small}>Completing sign in…</Text>
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
