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

function StepKicker({
  index,
  total,
  label,
}: {
  index: number;
  total: number;
  /** Optional section name; the Coach reference shows the counter alone. */
  label?: string;
}) {
  return (
    <Text style={styles.kicker}>
      {`STEP ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
      {label ? <Text style={styles.kickerLabel}>{` · ${label.toUpperCase()}`}</Text> : null}
    </Text>
  );
}

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

const FEATURES: {
  icon: IoniconName;
  tint: string;
  title: string;
  body: string;
  value: string;
  caption: string;
  accent?: boolean;
}[] = [
  {
    icon: "barbell",
    tint: MINT,
    title: "Workouts",
    body: "Strength & conditioning",
    value: "42 min",
    caption: "daily avg",
    accent: true,
  },
  {
    icon: "restaurant",
    tint: "#F0954A",
    title: "Nutrition",
    body: "Macros & hydration",
    value: "2,150",
    caption: "kcal target",
  },
  {
    icon: "moon",
    tint: "#9B86F5",
    title: "Sleep",
    body: "Deep & REM cycles",
    value: "7h 48m",
    caption: "restful",
  },
  {
    icon: "scale-outline",
    tint: "#5B9BF5",
    title: "Weight",
    body: "Steady trend",
    value: "64.2 kg",
    caption: "on course",
  },
];

function TrackSlide() {
  return (
    <>
      <Heading
        title="Track Everything That Matters"
        body="Bring all aspects of your health together in one simple app."
      />
      <View style={styles.list}>
        {FEATURES.map((f) => (
          <View
            key={f.title}
            style={[styles.featureRow, f.accent ? styles.featureRowAccent : null]}
          >
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={20} color={f.tint} />
            </View>
            <View style={styles.featureText}>
              <View style={styles.featureTitleRow}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                {f.accent ? (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.featureBody} numberOfLines={1}>
                {f.body}
              </Text>
            </View>
            <View style={styles.featureValueCol}>
              <Text style={styles.featureValue}>{f.value}</Text>
              <Text style={styles.featureCaption}>{f.caption}</Text>
            </View>
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
      <Card style={styles.coachCard}>
        <View style={styles.coachHead}>
          <Image source={EMBLEM} style={styles.coachMark} />
          <View style={styles.coachHeadText}>
            <Text style={styles.coachName}>Repora Coach</Text>
            <Text style={styles.coachSub}>Daily Check-in</Text>
          </View>
          <Text style={styles.coachTime}>Just now</Text>
        </View>

        <Text style={styles.coachQuote}>
          {"\u201CYou\u2019ve been consistent this week! Your protein intake is low today. Want some high-protein meal ideas?\u201D"}
        </Text>

        <View style={styles.coachStats}>
          <View style={styles.coachStat}>
            <View style={[styles.statDot, { backgroundColor: MINT }]} />
            <Text style={styles.coachStatText}>Protein: 62g / 140g</Text>
          </View>
          <View style={styles.coachStat}>
            <View style={[styles.statDot, { backgroundColor: "#7EA6F0" }]} />
            <Text style={styles.coachStatText}>Workouts: 4/4</Text>
          </View>
        </View>
      </Card>

      <Text style={styles.promptsLabel}>SUGGESTED PROMPTS</Text>
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
/** Friday is the day the card calls out. */
const BAR_ACTIVE = 4;

const METRICS: {
  icon: IoniconName;
  tint: string;
  trend?: "up" | "down";
  tag: string;
  value: string;
  label: string;
}[] = [
  {
    icon: "flame",
    tint: "#F0954A",
    trend: "down",
    tag: "-250 DEFICIT",
    value: "1,650",
    label: "AVG DAILY KCAL",
  },
  {
    icon: "barbell",
    tint: MINT,
    trend: "up",
    tag: "GOAL MET",
    value: "4 Days",
    label: "WORKOUTS COMPLETED",
  },
  { icon: "moon", tint: "#9B86F5", tag: "91% QUALITY", value: "7.5 hrs", label: "AVERAGE SLEEP" },
  {
    icon: "scale-outline",
    tint: "#5B9BF5",
    trend: "down",
    tag: "-1.8 KG",
    value: "64.2 kg",
    label: "STEADY WEIGHT",
  },
];

function ProgressSlide() {
  return (
    <>
      <Heading
        title="See Real Progress"
        body="Beautiful insights to help you stay consistent and make better decisions."
      />
      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <View style={styles.progressHeadText}>
            <Text style={styles.progressKicker}>CALORIC VELOCITY</Text>
            <View style={styles.progressTitleRow}>
              <Text style={styles.progressTitle}>This Week</Text>
              <Text style={styles.progressDelta}>+14% vs avg</Text>
            </View>
          </View>
          <View style={styles.rangePill}>
            <Text style={styles.rangePillTop}>Optimal</Text>
            <Text style={styles.rangePillBottom}>Range</Text>
          </View>
        </View>

        <View>
          <View style={styles.barsRow}>
            <View style={styles.targetLine}>
              <Text style={styles.targetLabel}>1,800 kcal target</Text>
            </View>
            {BAR_HEIGHTS.map((h, i) => {
              // Normalised so Friday (the tallest) fills the 140px plot.
              const height = 14 + Math.round((h / 0.72) * 82);
              return (
                <View key={i} style={styles.barCol}>
                  {i === BAR_ACTIVE ? (
                    <View style={[styles.tooltip, { bottom: height + 18 }]}>
                      <Text style={styles.tooltipText}>1,650 kcal</Text>
                    </View>
                  ) : null}
                  <View style={[styles.bar, { height }, i === BAR_ACTIVE ? styles.barActive : null]} />
                </View>
              );
            })}
          </View>
          <View style={styles.barLabelsRow}>
            {BAR_LABELS.map((label, i) => (
              <Text key={i} style={styles.barLabel}>
                {label}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.progressFoot}>
          <View style={styles.footLeft}>
            <View style={styles.footDot} />
            <Text style={styles.footText}>6 of 7 days logged</Text>
          </View>
          <Text style={styles.footMuted}>Top 5% adherence</Text>
        </View>
      </Card>

      <View style={styles.grid}>
        {METRICS.map((m) => (
          <View key={m.label} style={styles.metric}>
            <View style={styles.metricTop}>
              <Ionicons name={m.icon} size={18} color={m.tint} />
              <View style={styles.metricTagRow}>
                {m.trend ? (
                  <Ionicons
                    name={m.trend === "up" ? "arrow-up" : "arrow-down"}
                    size={10}
                    color={m.trend === "up" ? MINT : MUTED}
                  />
                ) : null}
                <Text style={styles.metricTag}>{m.tag}</Text>
              </View>
            </View>
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const HABITS: {
  icon: IoniconName;
  title: string;
  body: string;
  status: string;
  done: boolean;
}[] = [
  {
    icon: "barbell",
    title: "Workout done",
    body: "Full body strength session logged",
    status: "07:30 AM",
    done: true,
  },
  {
    icon: "restaurant",
    title: "Hit protein goal",
    body: "110 g · Great job!",
    status: "Completed",
    done: true,
  },
  {
    icon: "moon",
    title: "Get 7–8h sleep",
    body: "Improves recovery & autonomic readiness",
    status: "Target 10:30 PM",
    done: false,
  },
  {
    icon: "repeat",
    title: "Stay consistent",
    body: "Progress compounds into long-term vitality",
    status: "Ongoing",
    done: false,
  },
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
                {h.done ? (
                  <Ionicons name="checkmark" size={16} color={ON_MINT} />
                ) : (
                  <Ionicons name={h.icon} size={14} color={MUTED} />
                )}
              </View>
              {i < HABITS.length - 1 ? <View style={styles.habitLine} /> : null}
            </View>
            <View style={styles.habitCard}>
              <View style={styles.habitHead}>
                <Text style={styles.habitTitle} numberOfLines={1}>
                  {h.title}
                </Text>
                <Text style={styles.habitStatus}>{h.status}</Text>
              </View>
              <Text style={styles.habitSub}>{h.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Card style={styles.scoreCard}>
        <View style={styles.scoreText}>
          <Text style={styles.scoreLabel}>CONSISTENCY SCORE</Text>
          <Text style={styles.scoreValue}>94%</Text>
          <View style={styles.scoreDeltaRow}>
            <Ionicons name="arrow-up" size={12} color={MINT} />
            <Text style={styles.scoreDelta}>+6% vs last week</Text>
          </View>
        </View>
        <View style={styles.scoreBadge}>
          <Ionicons name="trending-up" size={20} color={MINT} />
        </View>
      </Card>
    </>
  );
}

/**
 * The name shown after the step counter, one per slide. The Coach reference
 * shows the counter alone, so that slide has no label.
 */
const SLIDE_LABELS: (string | undefined)[] = [
  "Foundation",
  undefined,
  "Progress",
  "Habits",
  "Journey",
  "Data",
];

const GOALS: { icon: IoniconName; label: string; body: string }[] = [
  { icon: "flame", label: "Lose Fat", body: "Calorie deficit & fat burn optimization" },
  { icon: "barbell", label: "Build Muscle", body: "Hypertrophy & progressive overload" },
  {
    icon: "leaf",
    label: "Stay Healthy",
    body: "Longevity, balanced nutrition & mobility",
  },
  { icon: "sunny", label: "Feel Better", body: "Energy levels, sleep & stress reduction" },
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
      <View style={styles.journeyList} accessibilityRole="radiogroup">
        {GOALS.map((g, i) => {
          const active = i === selected;
          return (
            <Pressable
              key={g.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${g.label}. ${g.body}`}
              onPress={() => onSelect(i)}
              // A slightly larger touch target, and the pressed state makes it
              // obvious the row responds even when it is already selected.
              hitSlop={4}
              style={({ pressed }) => [
                styles.goalRow,
                active ? styles.goalRowActive : null,
                pressed ? styles.goalRowPressed : null,
              ]}
            >
              {/* Decorations never capture the tap — the row must receive it. */}
              <View pointerEvents="none" style={styles.goalIcon}>
                <Ionicons name={g.icon} size={18} color={active ? MINT : MUTED} />
              </View>
              <View pointerEvents="none" style={styles.goalText}>
                <Text style={styles.goalTitle}>{g.label}</Text>
                <Text style={styles.goalBody}>{g.body}</Text>
              </View>
              <View pointerEvents="none" style={styles.goalIndicator}>
                {active ? (
                  <View style={styles.goalRadioOn}>
                    <View style={styles.goalRadioDot} />
                  </View>
                ) : (
                  <View style={styles.goalRadioOff} />
                )}
              </View>
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
    <TrackSlide key="track" />,
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
        <View style={styles.brand}>
          <Image source={EMBLEM} style={styles.brandMark} />
          <Text style={styles.brandName}>Repora</Text>
        </View>
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
            {/* Vertically scrollable so a short screen never clips the content
                under the fixed footer. Orthogonal to the horizontal pager. */}
            <ScrollView
              style={styles.slideScroll}
              contentContainerStyle={styles.slideInner}
              showsVerticalScrollIndicator={false}
            >
              <StepKicker index={i} total={slides.length} label={SLIDE_LABELS[i]} />
              {slide}
            </ScrollView>
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
          accessibilityLabel={index === last ? "Get started" : "Next"}
          onPress={next}
          style={({ pressed }) => [styles.nextButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.nextLabel}>{index === last ? "Get started" : "Next"}</Text>
          <Ionicons name="arrow-forward" size={20} color={ON_MINT} style={styles.nextArrow} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: INK },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: { width: 24, height: 24, borderRadius: 7 },
  brandName: { color: TEXT, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  skip: { color: TEXT, fontSize: 16, fontWeight: "600" },

  pager: { flex: 1 },
  slide: { flex: 1 },
  slideScroll: { flex: 1 },
  slideInner: {
    flexGrow: 1,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },

  kicker: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: -spacing.sm,
  },
  kickerLabel: { color: MINT },

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
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  featureRowAccent: { backgroundColor: TINT, borderColor: TINT_BORDER },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B2022",
  },
  featureText: { flex: 1, gap: 2, minWidth: 0 },
  featureTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  primaryBadge: {
    backgroundColor: "rgba(190,227,182,0.16)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  primaryBadgeText: { color: MINT, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  featureBody: { color: MUTED, fontSize: 12 },
  featureValueCol: { alignItems: "flex-end", gap: 1 },
  featureValue: { color: TEXT, fontSize: 16, fontWeight: "700" },
  featureCaption: { color: MUTED, fontSize: 11 },

  coachCard: { gap: spacing.md },
  coachHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  coachMark: { width: 28, height: 28, borderRadius: 8 },
  coachHeadText: { flex: 1, gap: 1 },
  coachName: { color: TEXT, fontSize: 14, fontWeight: "700" },
  coachSub: { color: MUTED, fontSize: 11 },
  coachTime: { color: MUTED, fontSize: 11 },
  coachQuote: { color: TEXT, fontSize: 15, lineHeight: 22, fontWeight: "500" },
  coachStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  coachStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statDot: { width: 5, height: 5, borderRadius: 2.5 },
  coachStatText: { color: MUTED, fontSize: 11 },
  promptsLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: -spacing.sm,
  },
  list: { gap: spacing.sm },

  progressCard: { gap: spacing.lg },
  progressHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  progressHeadText: { flex: 1, gap: 4 },
  progressKicker: { color: MUTED, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  progressTitleRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  progressTitle: { color: TEXT, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  progressDelta: { color: MINT, fontSize: 12, fontWeight: "600" },
  rangePill: {
    alignItems: "center",
    backgroundColor: "#232A2D",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2E3538",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  rangePillTop: { color: TEXT, fontSize: 12, fontWeight: "600" },
  rangePillBottom: { color: MUTED, fontSize: 11 },

  barsRow: { height: 140, flexDirection: "row", alignItems: "flex-end" },
  barCol: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "28%", maxWidth: 20, borderRadius: 4, backgroundColor: "#2B3134" },
  barActive: { backgroundColor: MINT },
  barLabelsRow: { flexDirection: "row", marginTop: spacing.sm },
  barLabel: { flex: 1, textAlign: "center", color: MUTED, fontSize: 11 },
  targetLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 100,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#454D50",
  },
  targetLabel: { position: "absolute", right: 0, top: -16, color: MUTED, fontSize: 10 },
  tooltip: {
    position: "absolute",
    backgroundColor: MINT,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tooltipText: { color: ON_MINT, fontSize: 10, fontWeight: "700" },

  progressFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LINE,
    paddingTop: spacing.md,
  },
  footLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  footDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MINT },
  footText: { color: TEXT, fontSize: 13, fontWeight: "600" },
  footMuted: { color: MUTED, fontSize: 12 },

  metric: {
    width: "48%",
    flexGrow: 0,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  metricTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metricTagRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  metricTag: { color: MUTED, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  metricValue: { color: TEXT, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  metricLabel: { color: MUTED, fontSize: 10, fontWeight: "600", letterSpacing: 0.8 },

  timeline: { gap: 0 },
  habitRow: { flexDirection: "row", gap: spacing.md },
  habitRail: { alignItems: "center", width: 32 },
  habitDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  habitDotDone: { backgroundColor: MINT },
  habitDotIdle: {
    backgroundColor: "#1C2123",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2E3538",
  },
  habitLine: { flex: 1, width: 0, borderLeftWidth: 1, borderColor: "#2E3538", marginVertical: 4 },
  habitCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    padding: spacing.lg,
    gap: 6,
    marginBottom: spacing.md,
  },
  habitHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  habitTitle: { color: TEXT, fontSize: 16, fontWeight: "700", flexShrink: 1 },
  habitStatus: { color: MUTED, fontSize: 12 },
  habitSub: { color: MUTED, fontSize: 14, lineHeight: 19 },

  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xl,
  },
  scoreText: { gap: 2 },
  scoreLabel: { color: MUTED, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  scoreValue: { color: TEXT, fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  scoreDeltaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scoreDelta: { color: MINT, fontSize: 12, fontWeight: "600" },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(190,227,182,0.16)",
  },

  journeyList: { flexGrow: 1, gap: spacing.sm },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: SURFACE,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    paddingLeft: spacing.lg,
    // Reserve the radio's column so the text can never run under it.
    paddingRight: spacing.lg + 22 + spacing.md,
    paddingVertical: spacing.md,
    // Grow into the leftover height so the four options fill the screen
    // instead of leaving a dead gap above the footer; never collapse below
    // a comfortable tap target on a short display.
    flexGrow: 1,
    minHeight: 64,
  },
  goalRowActive: { backgroundColor: TINT, borderColor: TINT_BORDER },
  goalRowPressed: { opacity: 0.86 },
  /**
   * Pinned to the card's right edge instead of sitting in the flex flow: text
   * measurement on Android pushed a flow child past the border. Both states
   * share this slot, so they are always on the same center line.
   */
  goalIndicator: {
    position: "absolute",
    right: spacing.lg,
    top: 0,
    bottom: 0,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B2022",
  },
  goalText: { flex: 1, gap: 2, minWidth: 0 },
  goalTitle: { color: TEXT, fontSize: 16, fontWeight: "700" },
  goalBody: { color: MUTED, fontSize: 13, lineHeight: 18 },
  goalRadioOn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  goalRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ON_MINT },
  goalRadioOff: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#3E4749",
  },

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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: "#2C3335" },
  dotOn: { backgroundColor: MINT },
  nextButton: {
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  nextLabel: { color: ON_MINT, fontSize: 16, fontWeight: "700" },
  nextArrow: { position: "absolute", right: spacing.lg },
});
