import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { colors } from "../src/theme/colors";

export default function SsoCallbackScreen() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      router.replace("/(tabs)/today" as any);
    }
  }, [isSignedIn, isLoaded]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.rust} />
      <Text style={styles.text}>Completing sign in...</Text>
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
