import { router } from "expo-router";
import { useTheme } from "../../src/theme/ThemeContext";
import type { ThemePreference } from "../../src/theme/colors";
import { StepScaffold } from "../../src/components/onboarding/StepScaffold";
import { SegmentedControl } from "../../src/components/ui/controls";
import { lightTick } from "../../src/hooks/useHaptics";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "trueBlack", label: "True Black" },
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
      <SegmentedControl
        value={preference}
        onChange={(v) => {
          setPreference(v);
          lightTick();
        }}
        options={OPTIONS}
      />
    </StepScaffold>
  );
}
