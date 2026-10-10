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
import { useMe } from "../src/hooks/useMe";
import { isDevPreview } from "../src/state/onboarding";

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

// Hold the splash screen until the persisted theme preference has loaded,
// so the app never flashes the wrong theme on cold start.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const { profile, loading: meLoading } = useMe();

  useEffect(() => {
    if (!isLoaded) return;

    // Copy into a plain array: `useSegments()`'s tuple type depends on Expo's
    // generated route types (.expo/types/router.d.ts), which a fresh checkout
    // does not have — indexing it directly fails to typecheck in CI.
    const path: string[] = [...segments];
    const first = path[0] ?? "";
    const step = path[1] ?? "";
    const inSignIn = first === "sign-in";
    const isCallback = first === "sso-callback";
    const inOnboarding = first === "onboarding";

    if (isCallback) return;

    if (!isSignedIn) {
      // Welcome is the signed-out entry point.
      if (!inSignIn && step !== "welcome") router.replace("/onboarding/welcome" as never);
      return;
    }

    // Signed in — wait for /me before deciding where to send them.
    if (meLoading && !profile) return;

    if (profile?.onboarded_at == null) {
      // `welcome` is allowed so the dev shortcuts in Settings can preview it.
      if (!inOnboarding || step === "") {
        router.replace("/onboarding/basics" as never);
      }
      return;
    }

    // Dev-only preview: don't bounce out of the onboarding screens.
    if (__DEV__ && isDevPreview() && inOnboarding) return;

    if (inSignIn || inOnboarding) router.replace("/(tabs)/today" as never);
  }, [isSignedIn, isLoaded, segments, router, profile, meLoading]);

  const waiting = !isLoaded || (isSignedIn && meLoading && !profile);
  if (waiting) {
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
