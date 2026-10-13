import { useRef, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing } from "../../src/theme/spacing";
import { Sparkline } from "../../src/components/ui/charts";
import type { IoniconName } from "../../src/components/ui/primitives";

const EMBLEM = require("../../assets/images/Glossy Mint Wave Sunset Emblem.png");

// This intro is its own mint-on-black surface, straight from the mockup — it
// deliberately does not use the app theme.
const MINT = "#BEE3B6";
const ON_MINT = "#0C150C";
const INK = "#0A0B0B";
const SURFACE = "#15191B";
const LINE = "#242B2D";
const TEXT = "#F2F3F0";
const MUTED = "#8C9494";
const TINT = "rgba(190,227,182,0.10)";
const TINT_BORDER = "rgba(190,227,182,0.55)";

/* ------------------------------------------------------------------ shared */

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.h1}>{title}</Text>
      <Text style={styles.lead}>{body}</Text>
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      {children}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ slides */

const FEATURES: { icon: IoniconName; tint: string; title: string; body: string; accent?: boolean }[] = [
  { icon: "barbell", tint: MINT, title: "Workouts", body: "Log your gym and track progress.", accent: true },
  { icon: "restaurant", tint: "#F0954A", title: "Nutrition", body: "Track calories and protein." },
  { icon: "moon", tint: "#9B86F5", title: "Sleep", body: "Understand your recovery." },
  { icon: "scale-outline", tint: "#5B9BF5", title: "Weight", body: "See the bigger picture." },
];

function TrackSlide({ tileWidth }: { tileWidth: number }) {
  return (
    <>
      <Heading
        title="Track Everything That Matters"
        body="Bring all aspects of your health together in one simple app."
      />
      <View style={styles.grid}>
        {FEATURES.map((f) => (
          <View
            key={f.title}
            style={[styles.tile, { width: tileWidth }, f.accent ? styles.tileAccent : null]}
          >
            <Ionicons name={f.icon} size={26} color={f.tint} />
            <Text style={styles.tileTitle}>{f.title}</Text>
            <Text style={styles.tileBody}>{f.body}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const SUGGESTIONS = [
  "Suggest meals for today",
  "Adjust my workout plan",
  "How can I sleep better?",
];

function CoachSlide() {
  return (
    <>
      <Heading
        title="Your AI Coach Always With You"
        body="Get personalized insights, recommendations and support based on your real data."
      />
      <View style={styles.bubbleRow}>
        <Image source={EMBLEM} style={styles.avatar} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            You&apos;ve been consistent this week! Your protein intake is low today. Want some
            high-protein meal ideas?
          </Text>
        </View>
      </View>
      <View style={styles.list}>
        {SUGGESTIONS.map((s) => (
          <Row key={s}>
            <Text style={styles.rowLabel}>{s}</Text>
            <Ionicons name="arrow-forward" size={16} color={MUTED} />
          </Row>
        ))}
      </View>
    </>
  );
}

const BAR_HEIGHTS = [0.35, 0.28, 0.52, 0.32, 0.72, 0.4, 0.62];
const BAR_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const METRICS: { icon: IoniconName; tint: string; value: string; label: string }[] = [
  { icon: "flame", tint: "#F0954A", value: "1,650", label: "Calories\navg/day" },
  { icon: "barbell", tint: MINT, value: "4", label: "Workouts\nthis week" },
  { icon: "moon", tint: "#9B86F5", value: "7.5h", label: "Sleep\navg/night" },
  { icon: "trending-up", tint: "#5B9BF5", value: "64.2 kg", label: "Weight\n-1.8 kg" },
];

function ProgressSlide() {
  return (
    <>
      <Heading
        title="See Real Progress"
        body="Beautiful insights to help you stay consistent and make better decisions."
      />
      <Card>
        <View style={styles.cardHead}>
          <View style={styles.cardHeadLeft}>
            <Text style={styles.cardTitle}>This Week</Text>
            <Ionicons name="chevron-down" size={15} color={MUTED} />
          </View>
          <Ionicons name="ellipsis-horizontal" size={16} color={MUTED} />
        </View>
        <View style={styles.bars}>
          {BAR_HEIGHTS.map((h, i) => (
            <View key={i} style={styles.barCol}>
              <View style={[styles.bar, { height: 8 + h * 62 }]} />
              <Text style={styles.barLabel}>{BAR_LABELS[i]}</Text>
            </View>
          ))}
        </View>
      </Card>
      <View style={styles.grid}>
        {METRICS.map((m) => (
          <View key={m.label} style={styles.metric}>
            <Ionicons name={m.icon} size={18} color={m.tint} />
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const HABITS: { icon: IoniconName; title: string; body: string; done: boolean }[] = [
  { icon: "barbell", title: "Workout done", body: "Full body strength", done: true },
  { icon: "restaurant", title: "Hit protein goal", body: "110g • Great job!", done: true },
  { icon: "moon", title: "Get 7-8h sleep", body: "Improves recovery", done: false },
  { icon: "stats-chart", title: "Stay consistent", body: "Progress compounds", done: false },
];

function HabitsSlide() {
  return (
    <>
      <Heading
        title="Build Better Habits"
        body="Small, consistent actions lead to a stronger, healthier you."
      />
      <View style={styles.timeline}>
        {HABITS.map((h, i) => (
          <View key={h.title} style={styles.habitRow}>
            <View style={styles.habitRail}>
              <View style={[styles.habitDot, h.done ? styles.habitDotDone : styles.habitDotIdle]}>
                {h.done ? <Ionicons name="checkmark" size={13} color={ON_MINT} /> : null}
              </View>
              {i < HABITS.length - 1 ? <View style={styles.habitLine} /> : null}
            </View>
            <View style={styles.habitBody}>
              <View style={styles.habitHead}>
                <Ionicons name={h.icon} size={20} color={h.done ? MINT : MUTED} />
                <Text style={styles.habitTitle}>{h.title}</Text>
              </View>
              <Text style={styles.habitSub}>{h.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

const GOALS: { icon: IoniconName; label: string }[] = [
  { icon: "flame", label: "Lose Fat" },
  { icon: "barbell", label: "Build Muscle" },
  { icon: "leaf", label: "Stay Healthy" },
  { icon: "disc", label: "Feel Better" },
];

function JourneySlide({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <>
      <Heading
        title="Designed for Your Journey"
        body="Whether you want to lose fat, build muscle or simply feel better, Repora adapts to your goals."
      />
      <View style={styles.list}>
        {GOALS.map((g, i) => {
          const active = i === selected;
          return (
            <Pressable
              key={g.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(i)}
              style={[styles.goalRow, active ? styles.goalRowActive : null]}
            >
              <Ionicons name={g.icon} size={19} color={active ? MINT : MUTED} />
              <Text style={[styles.rowLabel, active ? styles.goalLabelActive : null]}>{g.label}</Text>
              {active ? <Ionicons name="checkmark" size={18} color={MINT} /> : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function DataSlide() {
  return (
    <>
      <Heading
        title="Your Data. Your Story."
        body="Look back at your progress and see how far you've come."
      />
      <View style={styles.chartWrap}>
        <View style={styles.chartChip}>
          <Text style={styles.chartChipText}>Stronger{"\n"}Happier You</Text>
        </View>
        <Sparkline values={[6, 7.5, 9, 12, 14, 17, 21]} width={300} height={180} color={MINT} />
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ screen */

export default function IntroScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [goal, setGoal] = useState(0);

  const slideWidth = width - spacing.lg * 2;
  const tileWidth = (slideWidth - spacing.sm) / 2;
  const last = 5;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (index < last) {
      pager.current?.scrollTo({ x: (index + 1) * width, animated: true });
      setIndex(index + 1);
    } else {
      router.replace("/onboarding/account" as never);
    }
  };

  const slides = [
    <TrackSlide key="track" tileWidth={tileWidth} />,
    <CoachSlide key="coach" />,
    <ProgressSlide key="progress" />,
    <HabitsSlide key="habits" />,
    <JourneySlide key="journey" selected={goal} onSelect={setGoal} />,
    <DataSlide key="data" />,
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.topRow, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip"
          hitSlop={10}
          onPress={() => router.replace("/onboarding/account" as never)}
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {slides.map((slide, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={styles.slideInner}>{slide}</View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index ? styles.dotOn : null]} />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={index === last ? "Continue" : "Next"}
          onPress={next}
          style={({ pressed }) => [styles.fab, pressed ? styles.pressed : null]}
        >
          <Ionicons name="arrow-forward" size={22} color={ON_MINT} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: INK },
  topRow: { alignItems: "flex-end", paddingHorizontal: spacing.lg },
  skip: { color: TEXT, fontSize: 16, fontWeight: "600" },

  pager: { flex: 1 },
  slide: { paddingTop: spacing.xl },
  slideInner: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.xl },

  heading: { gap: spacing.sm },
  h1: { color: TEXT, fontSize: 28, fontWeight: "800", lineHeight: 33 },
  lead: { color: MUTED, fontSize: 15, lineHeight: 21 },

  card: {
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    padding: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.85 },
  rowLabel: { color: TEXT, fontSize: 15, fontWeight: "600", flex: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tileAccent: { backgroundColor: TINT, borderColor: TINT_BORDER },
  tileTitle: { color: TEXT, fontSize: 16, fontWeight: "700" },
  tileBody: { color: MUTED, fontSize: 13, lineHeight: 18 },

  bubbleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  bubble: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    padding: spacing.lg,
  },
  bubbleText: { color: TEXT, fontSize: 15, lineHeight: 22 },
  list: { gap: spacing.sm },

  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardHeadLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.lg },
  barCol: { flex: 1, alignItems: "center", gap: spacing.sm },
  bar: { width: "58%", borderRadius: 5, backgroundColor: MINT, opacity: 0.85 },
  barLabel: { color: MUTED, fontSize: 11 },

  metric: {
    width: "48%",
    flexGrow: 0,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    padding: spacing.md,
    gap: 6,
  },
  metricValue: { color: TEXT, fontSize: 19, fontWeight: "800" },
  metricLabel: { color: MUTED, fontSize: 12, lineHeight: 16 },

  timeline: { gap: 0 },
  habitRow: { flexDirection: "row", gap: spacing.md },
  habitRail: { alignItems: "center", width: 24 },
  habitDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  habitDotDone: { backgroundColor: MINT },
  habitDotIdle: { borderWidth: 1.5, borderColor: "#3A4245" },
  habitLine: { flex: 1, width: 0, borderLeftWidth: 1, borderStyle: "dashed", borderColor: "#3A4245", marginVertical: 2 },
  habitBody: { flex: 1, paddingBottom: spacing.xl, gap: 4 },
  habitHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  habitTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  habitSub: { color: MUTED, fontSize: 13, marginLeft: 28 },

  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  goalRowActive: { backgroundColor: TINT, borderColor: TINT_BORDER },
  goalLabelActive: { color: MINT },

  chartWrap: { flex: 1, justifyContent: "center" },
  chartChip: {
    alignSelf: "flex-end",
    backgroundColor: SURFACE,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TINT_BORDER,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: -spacing.md,
    marginRight: spacing.sm,
  },
  chartChipText: { color: TEXT, fontSize: 12, fontWeight: "700", textAlign: "center" },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: "#2C3335" },
  dotOn: { backgroundColor: MINT },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
});
