import { router } from "expo-router";
import { useTheme } from "../../src/theme/ThemeContext";
import type { ThemePreference } from "../../src/theme/colors";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { OptionCard } from "../../src/components/OptionCard";
import type { IoniconName } from "../../src/components/ui/primitives";
import { lightTick } from "../../src/hooks/useHaptics";

const OPTIONS: { value: ThemePreference; label: string; subtitle: string; icon: IoniconName }[] = [
  { value: "system", label: "System", subtitle: "Match your device settings", icon: "phone-portrait-outline" },
  { value: "light", label: "Light", subtitle: "Clean and bright", icon: "sunny-outline" },
  { value: "dark", label: "Dark", subtitle: "Easy on the eyes", icon: "moon-outline" },
  { value: "trueBlack", label: "True Black", subtitle: "Deep black for AMOLED", icon: "contrast-outline" },
];

/** Step 2 — appearance. Applies (and persists) immediately. */
export default function AppearanceScreen() {
  const { preference, setPreference } = useTheme();

  return (
    <StepScaffold
      step={2}
      title="Choose your theme"
      subtitle="You can change this anytime in Settings."
      onNext={() => router.navigate("/onboarding/plan" as never)}
    >
      {OPTIONS.map((option) => (
        <OptionCard
          key={option.value}
          icon={option.icon}
          title={option.label}
          subtitle={option.subtitle}
          selected={preference === option.value}
          onPress={() => {
            setPreference(option.value);
            lightTick();
          }}
        />
      ))}
    </StepScaffold>
  );
}
