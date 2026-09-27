import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  THEME_STORAGE_KEY,
  isDarkScheme,
  isValidPreference,
  palettes,
  resolveTheme,
  type Palette,
  type Scheme,
  type ThemePreference,
} from "./colors";
import { makeTypography, type TypographyScale } from "./typography";

export interface Theme {
  scheme: Scheme;
  colors: Palette;
  typography: TypographyScale;
  /** True for `dark` and `trueBlack`. */
  isDark: boolean;
}

interface ThemeContextValue extends Theme {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** False until the persisted preference has loaded (splash is held meanwhile). */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function toSystemScheme(name: ColorSchemeName | null | undefined): "light" | "dark" | null {
  return name === "dark" ? "dark" : name === "light" ? "light" : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<"light" | "dark" | null>(() =>
    toSystemScheme(Appearance.getColorScheme()),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isValidPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {
        // Corrupt/unavailable storage: fall back to "system", don't crash.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(toSystemScheme(colorScheme));
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {
      // Persistence is best-effort; the in-memory theme still applies.
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveTheme(preference, systemScheme);
    const colors = palettes[scheme];
    return {
      scheme,
      colors,
      typography: makeTypography(colors),
      isDark: isDarkScheme(scheme),
      preference,
      setPreference,
      ready,
    };
  }, [preference, systemScheme, setPreference, ready]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/** Access the current theme. Must be used inside `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const theme = use(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside <ThemeProvider>");
  return theme;
}

/**
 * Per-file stylesheet factory bound to the theme. Usage at module scope:
 *
 *   const useStyles = makeUseStyles((t) => StyleSheet.create({
 *     container: { backgroundColor: t.colors.bg },
 *     title: { ...t.typography.h2 },
 *   }));
 *
 * …then `const styles = useStyles();` inside the component.
 */
export function makeUseStyles<S>(factory: (theme: Theme) => S) {
  return function useStyles(): S {
    const { scheme, colors, typography, isDark } = useTheme();
    return useMemo(
      () => factory({ scheme, colors, typography, isDark }),
      [scheme, colors, typography, isDark],
    );
  };
}
