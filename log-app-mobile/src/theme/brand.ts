import { darkColors, type Palette } from "./colors";

/**
 * The mint-on-black brand surface used by first-run onboarding (the welcome
 * hero, the account screen and the single setup step).
 *
 * The app's `dark` scheme *is* the brand surface, so this aliases it rather
 * than duplicating values — onboarding and the signed-in app can never drift
 * apart. It exposes exactly the same token keys as every app palette, which
 * means every themed primitive — buttons, option cards, fields, the step
 * scaffold — renders in brand colours inside a `BrandThemeProvider` with no
 * component changes.
 */
export const brandPalette: Palette = darkColors;
