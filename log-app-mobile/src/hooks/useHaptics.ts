import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const HAPTICS_KEY = "log.haptics-enabled";

// Module-level mirror so fire-and-forget ticks don't need async reads.
let enabled = true;

async function readPref(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HAPTICS_KEY);
    if (stored !== null) enabled = stored === "1";
  } catch {
    // Storage failure: keep the default.
  }
  return enabled;
}

/** Call once at startup (fire-and-forget) so ticks respect the saved pref. */
export function loadHapticsPref(): void {
  void readPref();
}

export async function setHapticsEnabled(next: boolean): Promise<void> {
  enabled = next;
  try {
    await AsyncStorage.setItem(HAPTICS_KEY, next ? "1" : "0");
  } catch {
    // Best-effort; in-memory pref still applies.
  }
}

/** Reactive toggle state for the Settings screen. */
export function useHapticsPref(): { enabled: boolean; setEnabled: (next: boolean) => void } {
  const [value, setValue] = useState(true);
  useEffect(() => {
    let cancelled = false;
    readPref().then((pref) => {
      if (!cancelled) setValue(pref);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const setEnabled = useCallback((next: boolean) => {
    setValue(next);
    void setHapticsEnabled(next);
  }, []);
  return { enabled: value, setEnabled };
}

/** Short success tick after a save lands. Never throws, never blocks. */
export function successTick(): void {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Lighter tick for toggles and selections. */
export function lightTick(): void {
  if (!enabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
