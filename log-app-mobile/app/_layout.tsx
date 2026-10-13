import * as WebBrowser from "expo-web-browser";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { useEffect } from "react";
import { ActivityIndicator, BackHandler, Platform, StyleSheet, View } from "react-native";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";
import { loadHapticsPref } from "../src/hooks/useHaptics";
import { useMe } from "../src/hooks/useMe";
import { isDevPreview } from "../src/state/onboarding";

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;

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
      // Signed-out entry points: the welcome hero, the intro carousel and the
      // account screen all sit ahead of sign-in.
      const inSignedOutOnboarding =
        first === "onboarding" && ["welcome", "intro", "account"].includes(step);
      if (!inSignIn && !inSignedOutOnboarding) router.replace("/onboarding/welcome" as never);
      return;
    }

    // Signed in — wait for /me before deciding where to send them.
    if (meLoading && !profile) return;

    if (profile?.onboarded_at == null) {
      // Dev-only preview: the Settings shortcuts may walk the whole flow.
      if (__DEV__ && isDevPreview() && inOnboarding) return;
      // The setup steps are basics → appearance → plan. The pre-auth hero and
      // carousel (welcome / intro / account) hand over here once signed in.
      const setupSteps = ["basics", "appearance", "plan"];
      if (!inOnboarding || !setupSteps.includes(step)) {
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
      <AndroidBackToExit />
      <AuthGate />
    </ClerkProvider>
  );
}

function PostHogScreenTracker() {
  const posthog = usePostHog();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) posthog.screen(pathname);
  }, [posthog, pathname]);

  return null;
}

function AndroidBackToExit() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) return false;
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    loadHapticsPref();
  }, []);

  return (
    <ThemeProvider>
      <PostHogProvider
        apiKey={POSTHOG_KEY}
        autocapture={{ captureScreens: false }}
        options={{
          host: POSTHOG_HOST,
          enableSessionReplay: true,
          errorTracking: {
            autocapture: { uncaughtExceptions: true, unhandledRejections: true },
          },
        }}
      >
        <PostHogScreenTracker />
        <ThemedRoot />
      </PostHogProvider>
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
