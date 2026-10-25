import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconBadge,
  LoadingState,
  SectionHeader,
  Tag,
} from "../../src/components/ui/primitives";
import { LockedCard } from "../../src/components/billing/ProGate";
import { CheckinImage } from "../../src/components/physique/CheckinImage";
import { PhysiqueCheckinSheet } from "../../src/components/physique/PhysiqueCheckinSheet";
import { usePhysiqueCheckins } from "../../src/hooks/usePhysiqueCheckins";
import { useEntitlement } from "../../src/hooks/useEntitlement";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { formatMediumDate, startOfWeek } from "../../src/utils/date";
import type { PhysiqueCheckin } from "../../src/api/types";

function weekLabel(iso: string): string {
  return `Week of ${formatMediumDate(iso)}`;
}

export default function PhysiqueScreen() {
  const today = useCurrentDate();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { isLocked } = useEntitlement();
  const { checkins, loading, error, refetch, removeAll } = usePhysiqueCheckins();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const currentWeek = startOfWeek(today);
  const current = checkins.find((row) => row.week_start_date === currentWeek) ?? null;
  const history = checkins.filter((row) => row.week_start_date !== currentWeek);
  const locked = isLocked("physique");

  // Today's "add" tap carries ?add=1. Open once, after the list settles, and
  // never over an existing week's check-in (that one opens for viewing).
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || add !== "1" || loading || locked || current) return;
    autoOpened.current = true;
    setSheetOpen(true);
  }, [add, current, loading, locked]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch(true);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const confirmDeleteAll = () => {
    if (checkins.length === 0) return;
    Alert.alert(
      "Delete all check-ins?",
      "Every stored physique photo and read will be removed. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            setDeleteError(null);
            try {
              await removeAll();
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : "Couldn't delete check-ins.");
            }
          },
        },
      ],
    );
  };

  const onSaved = async (created: PhysiqueCheckin) => {
    await refetch();
    router.push({ pathname: "/physique/[id]", params: { id: created.id } } as never);
  };

  return (
    <PostHogMaskView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <ScreenHeader
          variant="detail"
          title="Physique"
          subtitle="Weekly check-ins"
          onBack={() => router.back()}
        />

        <View style={styles.privacyRow}>
          <IconBadge name="lock-closed-outline" bg={colors.primarySoft} color={colors.primary} size={32} />
          <Text style={[typography.small, styles.privacyText]}>
            Photos are encrypted at rest. Only you can open them; the coach reads this week and the
            previous check-in to compare.
          </Text>
        </View>

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {deleteError ? <Banner tone="danger" message={deleteError} /> : null}

        {loading && checkins.length === 0 ? (
          <LoadingState label="Loading your check-ins…" />
        ) : current ? (
          <View style={styles.currentBlock}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open this week's physique check-in"
              onPress={() => router.push({ pathname: "/physique/[id]", params: { id: current.id } } as never)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Card style={styles.currentCard}>
                <CheckinImage
                  id={current.id}
                  version={current.updated_at}
                  style={styles.currentImage}
                />
                <View style={styles.currentText}>
                  <View style={styles.currentTitleRow}>
                    <Text style={typography.bodyStrong}>This week</Text>
                    <Tag label="DONE" bg={colors.successSoft} text={colors.success} />
                  </View>
                  <Text style={typography.small} numberOfLines={2}>
                    {current.headline}
                  </Text>
                  <Text style={[typography.caption, styles.date]}>
                    {formatMediumDate(current.date)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Card>
            </Pressable>
            {!locked ? (
              <Button
                label="Update this week's photo"
                icon="camera-outline"
                variant="outline"
                size="sm"
                onPress={() => setSheetOpen(true)}
              />
            ) : null}
          </View>
        ) : locked ? (
          <LockedCard
            title="This week's check-in"
            subtitle="Pro adds a weekly photo comparison and concrete training/nutrition changes."
            icon="body-outline"
          />
        ) : (
          <Card style={styles.dueCard}>
            <View style={styles.dueHeader}>
              <IconBadge name="body-outline" bg={colors.purpleSoft} color={colors.purple} size={40} />
              <View style={styles.dueText}>
                <Text style={typography.bodyStrong}>This week&apos;s check-in is due</Text>
                <Text style={typography.small}>
                  Same light, same pose, roughly the same time of day.
                </Text>
              </View>
            </View>
            <Button
              label="Add this week's photo"
              icon="camera-outline"
              onPress={() => setSheetOpen(true)}
            />
          </Card>
        )}

        <View style={styles.historySection}>
          <SectionHeader
            title={history.length > 0 ? `History · ${history.length} ${history.length === 1 ? "week" : "weeks"}` : "History"}
          />

          {history.length === 0 ? (
            <EmptyState
              icon="body-outline"
              title="No past check-ins yet"
              subtitle="Your weekly photos and reads will build up here."
              compact
            />
          ) : (
            <View style={styles.historyList}>
              {history.map((row) => (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open check-in for ${weekLabel(row.week_start_date)}`}
                  onPress={() =>
                    router.push({ pathname: "/physique/[id]", params: { id: row.id } } as never)
                  }
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Card style={styles.historyRow}>
                    <CheckinImage
                      id={row.id}
                      version={row.updated_at}
                      style={styles.historyImage}
                    />
                    <View style={styles.historyText}>
                      <Text style={[typography.caption, styles.date]}>
                        {weekLabel(row.week_start_date)}
                      </Text>
                      <Text style={typography.bodyStrong} numberOfLines={2}>
                        {row.headline}
                      </Text>
                      <Text style={[typography.caption, styles.date]} numberOfLines={1}>
                        {row.recommendations.length} action
                        {row.recommendations.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {!locked && checkins.length > 0 ? (
          <Button
            label="Delete all check-ins"
            icon="trash-outline"
            variant="ghost"
            onPress={confirmDeleteAll}
          />
        ) : null}

        {locked && checkins.length > 0 ? (
          <Text style={[typography.caption, styles.gateNote]}>
            Past check-ins stay yours — you can still view and delete them without Pro.
          </Text>
        ) : null}
      </ScrollView>

      {sheetOpen ? (
        <PhysiqueCheckinSheet
          visible
          date={today}
          hasThisWeek={!!current}
          onClose={() => setSheetOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </PostHogMaskView>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    pressed: { opacity: 0.85 },
    privacyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    privacyText: { flex: 1, color: t.colors.textDim, lineHeight: 18 },
    currentBlock: { gap: spacing.sm },
    currentCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    currentImage: { width: 74, height: 96, borderRadius: radii.md },
    currentText: { flex: 1, gap: 3, minWidth: 0 },
    currentTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    date: { color: t.colors.textMuted },
    dueCard: { gap: spacing.md },
    dueHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    dueText: { flex: 1, gap: 2 },
    historySection: { gap: spacing.sm },
    historyList: { gap: spacing.sm },
    historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    historyImage: { width: 58, height: 76, borderRadius: radii.sm },
    historyText: { flex: 1, gap: 2, minWidth: 0 },
    gateNote: { color: t.colors.textDim, textAlign: "center", lineHeight: 18 },
  }),
);
