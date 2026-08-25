import * as WebBrowser from "expo-web-browser";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../src/theme/colors";

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const first = (segments[0] as string) ?? "";
    const inSignIn = first === "sign-in";
    const isCallback = first === "sso-callback" || first === "[...rest]";

    if (isCallback) return;

    if (!isSignedIn && !inSignIn) {
      router.replace("/sign-in" as any);
    } else if (isSignedIn && inSignIn) {
      router.replace("/(tabs)/today" as any);
    }
  }, [isSignedIn, isLoaded, segments]);

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <AuthGate />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.graphite,
  },
});
