import { Stack } from "expo-router";
import { BrandThemeProvider } from "../../src/theme/ThemeContext";
import { brandPalette } from "../../src/theme/brand";

/** First-run onboarding renders on the mint-on-black brand surface. */
export default function OnboardingLayout() {
  return (
    <BrandThemeProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: brandPalette.bg },
        }}
      />
    </BrandThemeProvider>
  );
}
