import * as WebBrowser from "expo-web-browser";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";
import { loadHapticsPref } from "../src/hooks/useHaptics";

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

// Hold the splash screen until the persisted theme preference has loaded,
// so the app never flashes the wrong theme on cold start.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const first = (segments[0] as string) ?? "";
    const inSignIn = first === "sign-in";
    const isCallback = first === "sso-callback";

    if (isCallback) return;

    if (!isSignedIn && !inSignIn) {
      router.replace("/sign-in" as never);
    } else if (isSignedIn && inSignIn) {
      router.replace("/(tabs)/today" as never);
    }
  }, [isSignedIn, isLoaded, segments, router]);

  if (!isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

function ThemedRoot() {
  const { colors, isDark, ready } = useTheme();

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    // Safety net: never hold the splash longer than 10s. If the theme
    // preference can't load (e.g. broken storage), the app still boots
    // with the default theme instead of hanging forever.
    const fallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 10000);
    return () => clearTimeout(fallback);
  }, [ready]);

  if (!CLERK_KEY) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthGate />
    </ClerkProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    loadHapticsPref();
  }, []);

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
