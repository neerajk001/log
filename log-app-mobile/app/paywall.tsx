import { router } from "expo-router";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { Button, Card, IconBadge, Tag, type IoniconName } from "../src/components/ui/primitives";
import { useEntitlement } from "../src/hooks/useEntitlement";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import { spacing } from "../src/theme/spacing";

const BENEFITS: { icon: IoniconName; title: string; body: string }[] = [
  {
    icon: "chatbubbles-outline",
    title: "A coach that knows your logs",
    body: "Ask about your week, your lifts or your plan — it reads your real history and remembers what it advised.",
  },
  {
    icon: "camera-outline",
    title: "Log a meal from a photo",
    body: "Snap it or describe it in a sentence. Calories and protein land in your day, ready to edit.",
  },
  {
    icon: "sparkles-outline",
    title: "A plan built for you",
    body: "Generate a training plan from your goal and equipment, or import one you already follow.",
  },
  {
    icon: "analytics-outline",
    title: "The full picture",
    body: "3-month and 1-year trends, per-exercise progress, personal records and consistency.",
  },
  {
    icon: "stats-chart-outline",
    title: "Body & nutrition deep dive",
    body: "Weight rate, calorie and protein hit rates, weekend patterns and an estimated maintenance calorie level.",
  },
  {
    icon: "body-outline",
    title: "Weekly physique check-ins",
    body: "One encrypted photo a week. The coach compares it with your previous check-in and tells you what to change in training or food.",
  },
];

/**
 * Repora Pro. Phase 1 is an honest, server-managed trial: there is no purchase
 * button until store products exist, and nothing here ever pretends a charge
 * happened.
 */
export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { isPro, isTrial, trialDaysLeft, status } = useEntitlement();

  const purchaseEnabled = status?.purchase_enabled ?? false;
  const monthly = process.env.EXPO_PUBLIC_PRO_MONTHLY_PRICE;
  const yearly = process.env.EXPO_PUBLIC_PRO_YEARLY_PRICE;

  const headline = isPro
    ? isTrial
      ? `Pro trial · ${trialDaysLeft ?? 0} ${trialDaysLeft === 1 ? "day" : "days"} left`
      : "Pro is active"
    : "Get the full coach";

  const subtitle = isPro
    ? "Everything below is unlocked. When the trial ends, logging, your history and the weekly verdict stay free."
    : "Logging, your history and the weekly verdict stay free forever. Pro adds the AI coach and the deeper analytics.";

  const trialEnded =
    !isPro && status?.trial_ends_at
      ? `Your trial ended on ${new Date(status.trial_ends_at).toLocaleDateString()}.`
      : null;

  const onUpgrade = () => {
    // Phase 2 hook: RevenueCat purchase, then POST /api/billing/sync. Until the
    // store products exist, saying so is better than a dead tap.
    Alert.alert(
      "Purchases open shortly",
      "Subscriptions will be available in the App Store and Play Store. Nothing has been charged.",
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader variant="detail" title="Repora Pro" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <IconBadge name="diamond-outline" bg={colors.primarySoft} color={colors.primary} size={44} />
            {isPro ? <Tag label={isTrial ? "TRIAL" : "ACTIVE"} bg={colors.successSoft} text={colors.success} /> : null}
          </View>
          <Text style={typography.h2}>{headline}</Text>
          <Text style={typography.small}>{subtitle}</Text>
          {trialEnded ? <Text style={typography.small}>{trialEnded}</Text> : null}
        </Card>

        <Text style={typography.caption}>WHAT YOU GET</Text>
        <Card style={styles.list}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.row}>
              <IconBadge name={b.icon} bg={colors.surfaceAlt} color={colors.text} size={34} rounded={false} />
              <View style={styles.rowText}>
                <Text style={typography.bodyStrong}>{b.title}</Text>
                <Text style={typography.small}>{b.body}</Text>
              </View>
            </View>
          ))}
        </Card>

        {monthly || yearly ? (
          <Card style={styles.priceCard}>
            <Text style={typography.metric}>{yearly ?? monthly}</Text>
            <Text style={typography.metricUnit}>{yearly ? "per year" : "per month"}</Text>
          </Card>
        ) : (
          <Card>
            <Text style={typography.small}>
              Pricing is still being finalised — nothing is charged today.
            </Text>
          </Card>
        )}

        <Button
          label={
            purchaseEnabled
              ? isPro
                ? "Manage subscription"
                : "Upgrade to Pro"
              : "Purchases opening soon"
          }
          icon={purchaseEnabled ? "arrow-forward" : "time-outline"}
          iconPosition="trailing"
          disabled={!purchaseEnabled}
          onPress={onUpgrade}
        />

        <Text style={[typography.small, styles.footnote]}>
          {isPro
            ? "No charge today. Your account returns to the free plan automatically when the trial ends."
            : "While you're not on Pro you still get 3 coach messages a week, 3 meal scans a month, 1 AI plan a month and 2 plan imports a month."}
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, gap: spacing.md },
    hero: { gap: spacing.sm },
    heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    list: { gap: spacing.lg },
    row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    rowText: { flex: 1, gap: 2 },
    priceCard: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: spacing.sm },
    footnote: { textAlign: "center", lineHeight: 19 },
  }),
);
