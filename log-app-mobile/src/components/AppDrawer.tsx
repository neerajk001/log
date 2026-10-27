import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useClerk } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { AccountSummary } from "./AccountSummary";
import { useMe } from "../hooks/useMe";
import type { IoniconName } from "./ui/primitives";

type DrawerRow = {
  label: string;
  icon: IoniconName;
  active?: boolean;
  onPress: () => void;
};

function isPath(pathname: string, value: string): boolean {
  return pathname === value || pathname.endsWith(value);
}

/** Left-side navigation drawer. Every row routes to a real screen. */
export function AppDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useStyles();
  const pathname = usePathname();
  const { profile } = useMe();
  const { signOut } = useClerk();
  const panelWidth = Math.min(300, Math.round(width * 0.76));
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  const [translateX] = useState(() => new Animated.Value(-panelWidth));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      translateX.setValue(-panelWidth);
      backdropOpacity.setValue(0);
      const frame = requestAnimationFrame(() => {
        setMounted(true);
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!mountedRef.current) return;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -panelWidth,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      mountedRef.current = false;
      setMounted(false);
    });
  }, [visible, panelWidth, translateX, backdropOpacity]);


  const go = (href: Parameters<typeof router.navigate>[0]) => {
    onClose();
    router.navigate(href as never);
  };

  const allItems: DrawerRow[] = [
    {
      label: "Home",
      icon: "home",
      active: isPath(pathname, "/today") || pathname === "/",
      onPress: () => go("/(tabs)/today"),
    },
    {
      label: "Progress",
      icon: "bar-chart-outline",
      active: pathname.includes("/lift-progress"),
      onPress: () => go("/lift-progress"),
    },
    {
      label: "History",
      icon: "time-outline",
      active: isPath(pathname, "/history"),
      onPress: () => go("/(tabs)/history"),
    },
    {
      label: "Analytics",
      icon: "trending-up",
      active: isPath(pathname, "/insights"),
      onPress: () => go("/(tabs)/insights"),
    },
    {
      label: "AI Coach",
      icon: "sparkles",
      active: pathname.includes("/coach") && !pathname.includes("/coach/onboarding"),
      onPress: () => go("/(tabs)/coach"),
    },
    {
      label: "Plans",
      icon: "document-text-outline",
      active: pathname.includes("/plan"),
      onPress: () => go("/(tabs)/plan"),
    },
    {
      label: "Exercises",
      icon: "barbell-outline",
      active: isPath(pathname, "/lift"),
      onPress: () => go("/(tabs)/lift"),
    },
    {
      label: "Meals",
      icon: "restaurant-outline",
      onPress: () =>
        go({
          pathname: "/coach/chat",
          params: { agent: "meal", q: "", date: "", fresh: "" },
        } as never),
    },
    {
      label: "Body metrics",
      icon: "body-outline",
      active: pathname.includes("/insights/body"),
      onPress: () => go("/insights/body"),
    },
    {
      label: "Goals",
      icon: "locate-outline",
      active: pathname.includes("/coach/onboarding"),
      onPress: () => go("/coach/onboarding"),
    },
  ];

  const coachEnabled = profile?.ai_coach_enabled !== false;
  const mealsEnabled = profile?.meal_tracking_enabled !== false;
  const items = allItems.filter((item) => {
    if (item.label === "AI Coach" || item.label === "Goals") return coachEnabled;
    if (item.label === "Meals") return coachEnabled && mealsEnabled;
    return true;
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.sm,
              transform: [{ translateX }],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => go("/settings")}
            style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
          >
            <AccountSummary />
          </Pressable>
          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.nav}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.item,
                  item.active && styles.itemActive,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.active ? colors.primary : colors.textDim}
                />
                <Text style={[styles.itemText, item.active && styles.itemTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.logoutWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              onPress={() => {
                onClose();
                signOut().catch(() => {});
              }}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    overlay: { flex: 1 },
    backdrop: { backgroundColor: "rgba(0,0,0,0.62)" },
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
    pressed: { opacity: 0.7 },
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

