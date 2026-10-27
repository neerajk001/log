import * as WebBrowser from "expo-web-browser";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { useEffect, useRef } from "react";
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from "react-native";
import { ThemeProvider, useTheme } from "../src/theme/ThemeContext";
import { loadHapticsPref } from "../src/hooks/useHaptics";
import { useMe } from "../src/hooks/useMe";
import { clearAllCache } from "../src/api/cache";
import { Button } from "../src/components/ui/primitives";
import { isDevPreview } from "../src/state/onboarding";
import { captureTiming, now } from "../src/utils/perf";

/** Bundle-evaluation time — the earliest startup mark available (approximate). */
const BOOT_T0 = now();

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;

// Hold the splash screen until the persisted theme preference has loaded,
// so the app never flashes the wrong theme on cold start.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const { profile, loading: meLoading, error: meError, refetch: refetchMe } = useMe(isSignedIn === true);

  // The GET cache is module-level and keyed by path, not by account. Without
  // this, a sign-out (or an account switch) inside a cache TTL lets the next
  // account on this device read the previous one's /me, meals, plans or logs.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const current = userId ?? null;
    if (lastUserIdRef.current !== undefined && lastUserIdRef.current !== current) {
      clearAllCache();
    }
    lastUserIdRef.current = current;
  }, [isLoaded, userId]);

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
      // Signed-out entry points: the welcome hero and the account screen.
      const inSignedOutOnboarding =
        first === "onboarding" && ["welcome", "account"].includes(step);
      if (!inSignIn && !inSignedOutOnboarding) router.replace("/onboarding/welcome" as never);
      return;
    }

    // A failed /me is not "not onboarded": routing on an unknown profile would
    // bounce a fully onboarded athlete back into setup (and rewriting their
    // answers). Keep them on the retry screen below until the load succeeds.
    if (meError && !profile) return;

    // Signed in — wait for /me before deciding where to send them.
    if (meLoading && !profile) return;

    if (profile?.onboarded_at == null) {
      // Dev-only preview: the Settings shortcuts may walk the whole flow.
      if (__DEV__ && isDevPreview() && inOnboarding) return;
      // The single setup step is basics. The pre-auth hero and account screen
      // hand over here once signed in.
      const setupSteps = ["basics"];
      if (!inOnboarding || !setupSteps.includes(step)) {
        router.replace("/onboarding/basics" as never);
      }
      return;
    }

    // Dev-only preview: don't bounce out of the onboarding screens.
    if (__DEV__ && isDevPreview() && inOnboarding) return;

    if (inSignIn || inOnboarding) router.replace("/(tabs)/today" as never);
  }, [isSignedIn, isLoaded, segments, router, profile, meLoading, meError]);

  const waiting = !isLoaded || (isSignedIn && meLoading && !profile);
  if (waiting) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // The profile load failed and there is nothing cached: offer a retry instead
  // of guessing whether the athlete is onboarded.
  if (isSignedIn && meError && !profile) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn&apos;t load your profile</Text>
        <Text style={[styles.errorBody, { color: colors.textDim }]}>{meError}</Text>
        <Button label="Try again" icon="refresh" onPress={() => void refetchMe()} />
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

  // Keep the native root/window background in sync with the theme. Without
  // this, tab and stack transitions can show a white frame between screens.
  useEffect(() => {
    if (!ready) return;
    void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg, ready]);

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
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          This build is missing its Clerk key
        </Text>
        <Text style={[styles.errorBody, { color: colors.textDim }]}>
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY was not set when the app was built. Rebuild with it
          configured (see deployment.md).
        </Text>
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
  // Phase 0: cold-start duration to first screen (durations only, no PII).
  const startupSent = useRef(false);

  useEffect(() => {
    if (pathname) posthog.screen(pathname);
    if (pathname && !startupSent.current) {
      startupSent.current = true;
      captureTiming(posthog, "app_startup", { cold_start_ms: Date.now() - BOOT_T0 });
    }
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
          // Verified masking policy (see security.md "Analytics masking"):
          // everything sensitive is masked by default; the flags are explicit
          // so a SDK default change can't quietly unmask health data.
          sessionReplayConfig: {
            maskAllTextInputs: true,
            maskAllImages: true,
            maskAllSandboxedViews: true,
            // Tap coordinates can reveal a numeric keypad's digits on replay.
            captureTouches: false,
            // Console logs must never become analytics events.
            captureLog: false,
          },
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
    gap: 12,
  },
  errorTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", paddingHorizontal: 24 },
  errorBody: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
