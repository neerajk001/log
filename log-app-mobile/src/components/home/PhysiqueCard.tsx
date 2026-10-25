import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/spacing";
import { Card, IconBadge, Tag } from "../ui/primitives";
import { useEntitlement } from "../../hooks/useEntitlement";
import { usePhysiqueCheckins } from "../../hooks/usePhysiqueCheckins";
import { useCurrentDate } from "../../hooks/useCurrentDate";
import { startOfWeek } from "../../utils/date";
import type { PhysiqueCheckin } from "../../api/types";

/**
 * Today's weekly physique entry point. Pro sees this week's status; Free sees
 * the honest locked card. Past check-ins stay viewable either way.
 */
export function PhysiqueCard({
  isPro,
  checkin,
  onOpen,
  onAdd,
}: {
  isPro: boolean;
  checkin: PhysiqueCheckin | null;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  if (!isPro) {
    // Data access is never gated: this opens the screen (where past check-ins
    // are still visible), not straight to the paywall. Adding a new week is the
    // Pro action and is gated inside.
    return (
      <PostHogMaskView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open physique check-ins"
          onPress={onOpen}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card style={styles.card}>
            <IconBadge name="lock-closed-outline" bg={colors.surfaceAlt} color={colors.textMuted} size={38} rounded={false} />
            <View style={styles.text}>
              <View style={styles.titleRow}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  Weekly physique check-ins
                </Text>
                <Tag label="PRO" bg={colors.primarySoft} text={colors.primary} />
              </View>
              <Text style={typography.small} numberOfLines={2}>
                Pro compares your photos week to week. Past check-ins stay available.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        </Pressable>
      </PostHogMaskView>
    );
  }

  return (
    <PostHogMaskView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          checkin ? "View this week's physique check-in" : "Add this week's physique check-in"
        }
        onPress={checkin ? onOpen : onAdd}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Card style={styles.card}>
          <IconBadge name="body-outline" bg={colors.purpleSoft} color={colors.purple} size={38} rounded={false} />
          <View style={styles.text}>
            <View style={styles.titleRow}>
              <Text style={typography.bodyStrong} numberOfLines={1}>
                {checkin ? "This week's check-in" : "Weekly physique check-in"}
              </Text>
              {checkin ? <Tag label="DONE" bg={colors.successSoft} text={colors.success} /> : null}
            </View>
            <Text style={typography.small} numberOfLines={2}>
              {checkin
                ? checkin.headline
                : "One photo a week. The coach compares it with your previous check-in and says what to change."}
            </Text>
          </View>
          {checkin ? (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          ) : (
            <View style={[styles.add, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="add" size={18} color={colors.primary} />
            </View>
          )}
        </Card>
      </Pressable>
    </PostHogMaskView>
  );
}

/**
 * Today's self-contained entry point: the Pro card owns the status read, the
 * Free card is just the paywall prompt (so Free never fetches the photo list).
 */
export function PhysiqueEntryCard() {
  const { isPro } = useEntitlement();
  if (!isPro) {
    return (
      <PhysiqueCard
        isPro={false}
        checkin={null}
        onOpen={() => router.navigate("/physique" as never)}
        onAdd={() => router.navigate("/physique" as never)}
      />
    );
  }
  return <ProPhysiqueCard />;
}

function ProPhysiqueCard() {
  const today = useCurrentDate();
  const { checkins } = usePhysiqueCheckins();
  const current = checkins.find((row) => row.week_start_date === startOfWeek(today)) ?? null;

  return (
    <PhysiqueCard
      isPro
      checkin={current}
      onOpen={() => router.navigate("/physique" as never)}
      onAdd={() =>
        router.navigate({ pathname: "/physique", params: { add: "1" } } as never)
      }
    />
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    text: { flex: 1, gap: 2, minWidth: 0 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pressed: { opacity: 0.85 },
    add: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
