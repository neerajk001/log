import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { IconButton } from "../../src/components/ui/controls";
import {
  Banner,
  Card,
  ErrorState,
  IconBadge,
  LoadingState,
  SectionHeader,
} from "../../src/components/ui/primitives";
import { CheckinImage } from "../../src/components/physique/CheckinImage";
import { usePhysiqueCheckins } from "../../src/hooks/usePhysiqueCheckins";
import { formatMediumDate } from "../../src/utils/date";
import type { PhysiqueRecommendationArea } from "../../src/api/types";

const AREA_LABELS: Record<PhysiqueRecommendationArea, string> = {
  training: "Training",
  nutrition: "Nutrition",
  recovery: "Recovery",
};

const AREA_ICONS: Record<PhysiqueRecommendationArea, "barbell-outline" | "restaurant-outline" | "moon-outline"> = {
  training: "barbell-outline",
  nutrition: "restaurant-outline",
  recovery: "moon-outline",
};

export default function PhysiqueCheckinDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { checkins, loading, error, refetch, remove } = usePhysiqueCheckins();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const checkin = checkins.find((row) => row.id === id) ?? null;
  const previous =
    checkin && checkin.previous_checkin_id
      ? checkins.find((row) => row.id === checkin.previous_checkin_id) ?? null
      : null;

  const confirmDelete = () => {
    if (!checkin) return;
    Alert.alert("Delete this check-in?", "The photo and its read will be removed permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await remove(checkin.id);
            router.back();
          } catch (err) {
            Alert.alert(
              "Couldn't delete",
              err instanceof Error ? err.message : "Please try again.",
            );
          }
        },
      },
    ]);
  };

  if (!checkin) {
    return (
      <PostHogMaskView style={styles.container}>
        <View style={styles.scroll}>
          <ScreenHeader variant="detail" title="Check-in" onBack={() => router.back()} />
          {loading ? (
            <LoadingState label="Loading check-in…" />
          ) : (
            <>
              {error ? <Banner tone="danger" message={error} /> : null}
              <ErrorState message="That check-in couldn't be found." onRetry={refetch} />
            </>
          )}
        </View>
      </PostHogMaskView>
    );
  }

  const areaStyle = (area: PhysiqueRecommendationArea) =>
    area === "training"
      ? { bg: colors.blueSoft, color: colors.blue }
      : area === "nutrition"
        ? { bg: colors.greenSoft, color: colors.green }
        : { bg: colors.purpleSoft, color: colors.purple };

  return (
    <PostHogMaskView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader
          variant="detail"
          title={formatMediumDate(checkin.date)}
          subtitle={previous ? `Compared with ${formatMediumDate(previous.date)}` : "First check-in"}
          onBack={() => router.back()}
          right={
            <IconButton
              name="trash-outline"
              accessibilityLabel="Delete this check-in"
              color={colors.danger}
              onPress={confirmDelete}
            />
          }
        />

        {previous ? (
          <View style={styles.compareRow}>
            <View style={styles.compareCol}>
              <CheckinImage
                id={checkin.id}
                version={checkin.updated_at}
                style={styles.compareImage}
                accessibilityLabel="This week's physique photo"
              />
              <Text style={[typography.caption, styles.compareLabel]}>This week</Text>
            </View>
            <View style={styles.compareCol}>
              <CheckinImage
                id={previous.id}
                version={previous.updated_at}
                style={styles.compareImage}
                accessibilityLabel="Last week's physique photo"
              />
              <Text style={[typography.caption, styles.compareLabel]}>Previous</Text>
            </View>
          </View>
        ) : (
          <CheckinImage
            id={checkin.id}
            version={checkin.updated_at}
            style={styles.heroImage}
            accessibilityLabel="Physique check-in photo"
          />
        )}

        <Card style={styles.readCard}>
          <Text style={typography.h3}>{checkin.headline}</Text>
          <Text style={[typography.small, styles.assessment]}>{checkin.assessment}</Text>
        </Card>

        <View style={styles.actionsSection}>
          <SectionHeader title="What to change" />
          <View style={styles.actionList}>
            {checkin.recommendations.map((rec, index) => {
              const tone = areaStyle(rec.area);
              return (
                <Card key={`${rec.area}-${index}`} style={styles.actionCard}>
                  <IconBadge
                    name={AREA_ICONS[rec.area]}
                    bg={tone.bg}
                    color={tone.color}
                    size={38}
                    rounded={false}
                  />
                  <View style={styles.actionText}>
                    <Text style={[typography.caption, { color: tone.color }]}>
                      {AREA_LABELS[rec.area]}
                    </Text>
                    <Text style={typography.bodyStrong}>{rec.action}</Text>
                    {rec.reason ? <Text style={typography.small}>{rec.reason}</Text> : null}
                  </View>
                </Card>
              );
            })}
          </View>
        </View>

        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textDim} />
          <Text style={[typography.caption, styles.privacy]}>
            Stored encrypted. Only you can open this photo; delete it anytime.
          </Text>
        </View>
      </ScrollView>
    </PostHogMaskView>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    compareRow: { flexDirection: "row", gap: spacing.sm },
    compareCol: { flex: 1, gap: spacing.xs },
    compareImage: { width: "100%", aspectRatio: 0.75, borderRadius: radii.lg, backgroundColor: t.colors.surfaceAlt },
    compareLabel: { color: t.colors.textDim, textAlign: "center" },
    heroImage: { width: "100%", aspectRatio: 0.75, borderRadius: radii.lg, backgroundColor: t.colors.surfaceAlt },
    readCard: { gap: spacing.sm },
    assessment: { color: t.colors.textDim, lineHeight: 21 },
    actionsSection: { gap: spacing.sm },
    actionList: { gap: spacing.sm },
    actionCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    actionText: { flex: 1, gap: 2, minWidth: 0 },
    privacyRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, justifyContent: "center" },
    privacy: { color: t.colors.textDim },
  }),
);
