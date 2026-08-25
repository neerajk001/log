import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { colors } from "../src/theme/colors";

export default function CatchAllScreen() {
  const { isSignedIn, isLoaded } = useAuth();
  const params = useLocalSearchParams<{ rest: string[] }>();
  const router = useRouter();

  const path = Array.isArray(params.rest) ? params.rest.join("/") : (params.rest ?? "");
  const isSsoCallback = path === "sso-callback" || path === "--/sso-callback" || path.startsWith("sso-callback");

  useEffect(() => {
    if (!isLoaded) return;

    if (isSsoCallback && isSignedIn) {
      router.replace("/(tabs)/today" as any);
    } else if (!isSsoCallback) {
      router.replace("/sign-in" as any);
    }
  }, [isSignedIn, isLoaded, path]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.rust} />
      <Text style={styles.text}>
        {isSsoCallback ? "Completing sign in..." : "Loading..."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.graphite,
    gap: 16,
  },
  text: {
    fontFamily: "Inter",
    fontSize: 14,
    color: colors.chalkDim,
  },
});
