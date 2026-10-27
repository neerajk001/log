import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/spacing";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Signed-in identity row used by the app drawer and the Settings account card. */
export function AccountSummary({ showChevron = true }: { showChevron?: boolean }) {
  const { user } = useUser();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const name = user?.fullName?.trim() || user?.username?.trim() || "Your account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Signed in";
  const avatar = user?.imageUrl;

  return (
    <View style={styles.row}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.avatar} accessibilityLabel={name} />
      ) : (
        <View style={[styles.avatar, styles.fallback]}>
          <Text style={styles.initials}>{initials(name)}</Text>
        </View>
      )}
      <View style={styles.text}>
        <Text style={typography.bodyStrong} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[typography.small, styles.email]} numberOfLines={1}>
          {email}
        </Text>
      </View>
      {showChevron ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.colors.surfaceAlt },
    fallback: { alignItems: "center", justifyContent: "center" },
    initials: { fontSize: 16, fontWeight: "700", color: t.colors.primary },
    text: { flex: 1, minWidth: 0, gap: 2 },
    email: { color: t.colors.textDim },
  }),
);
