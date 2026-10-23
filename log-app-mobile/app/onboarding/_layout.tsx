import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BrandThemeProvider } from "../../src/theme/ThemeContext";
import { brandPalette } from "../../src/theme/brand";

/** First-run onboarding renders on the mint-on-black brand surface. */
export default function OnboardingLayout() {
  return (
    <BrandThemeProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: brandPalette.bg },
        }}
      />
    </BrandThemeProvider>
  );
}
