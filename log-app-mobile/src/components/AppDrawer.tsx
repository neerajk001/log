import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { AccountSummary } from "./AccountSummary";
import type { IoniconName } from "./ui/primitives";

type DrawerItem = {
  label: string;
  icon: IoniconName;
  active?: boolean;
  danger?: boolean;
};

const MAIN_ITEMS: DrawerItem[] = [
  { label: "Home", icon: "home", active: true },
  { label: "Progress", icon: "bar-chart-outline" },
  { label: "History", icon: "time-outline" },
  { label: "Analytics", icon: "trending-up" },
  { label: "AI Coach", icon: "sparkles" },
  { label: "Plans", icon: "document-text-outline" },
  { label: "Exercises", icon: "barbell-outline" },
  { label: "Meals", icon: "restaurant-outline" },
  { label: "Body metrics", icon: "body-outline" },
  { label: "Goals", icon: "locate-outline" },
];

const UTILITY_ITEMS: DrawerItem[] = [
  { label: "Export data", icon: "download-outline" },
  { label: "Help & support", icon: "help-circle-outline" },
  { label: "Feedback", icon: "chatbubble-ellipses-outline" },
];

/** Left-side navigation drawer. Rows are visual only until navigation is wired. */
export function AppDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useStyles();
  const panelWidth = Math.min(348, Math.round(width * 0.86));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <View style={styles.profile}>
            <AccountSummary />
          </View>
          <View style={styles.divider} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.nav}
          >
            {MAIN_ITEMS.map((item) => (
              <DrawerRow key={item.label} item={item} />
            ))}
            <View style={styles.groupDivider} />
            {UTILITY_ITEMS.map((item) => (
              <DrawerRow key={item.label} item={item} />
            ))}
          </ScrollView>

          <View style={styles.logoutWrap}>
            <View style={styles.logout}>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.logoutText}>Logout</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DrawerRow({ item }: { item: DrawerItem }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tint = item.active ? colors.primary : item.danger ? colors.danger : colors.textDim;

  return (
    <View style={[styles.item, item.active && styles.itemActive]}>
      <Ionicons name={item.icon} size={20} color={tint} />
      <Text style={[styles.itemText, item.active && styles.itemTextActive]}>{item.label}</Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)" },
    panel: {
      height: "100%",
      backgroundColor: t.colors.surface,
      borderTopRightRadius: 28,
      borderBottomRightRadius: 28,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingHorizontal: spacing.sm,
    },
    profile: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginHorizontal: spacing.sm,
      marginBottom: spacing.sm,
    },
    nav: { paddingHorizontal: spacing.xs, paddingBottom: spacing.md, gap: 2 },
    item: {
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
    },
    itemActive: { backgroundColor: t.colors.primarySoft },
    itemText: { fontSize: 15, fontWeight: "500", color: t.colors.text },
    itemTextActive: { fontWeight: "700", color: t.colors.primary },
    groupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginVertical: spacing.sm,
      marginHorizontal: spacing.xs,
    },
    logoutWrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    logout: {
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.md,
      backgroundColor: t.colors.dangerSoft,
      paddingHorizontal: spacing.md,
    },
    logoutText: { fontSize: 15, fontWeight: "700", color: t.colors.danger },
  }),
);
