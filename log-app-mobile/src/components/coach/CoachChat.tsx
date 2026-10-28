import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { ScreenHeader } from "../ScreenHeader";
import { Banner, IconBadge } from "../ui/primitives";
import { Chip, ChipRow, IconButton } from "../ui/controls";
import { ProposalCard } from "./ProposalCard";
import { CoachLanding } from "./CoachLanding";
import { CoachChatLanding } from "./CoachChatLanding";
import { CoachMenuSheet } from "./CoachMenuSheet";
import { useCoachChat, type ChatMessage } from "../../hooks/useCoachChat";
import { useEntitlement } from "../../hooks/useEntitlement";
import { useMealsApi } from "../../api/meals";
import { pickPhoto, preparePhoto, type PhotoSource, type UploadPhoto } from "../../utils/image";
import { filePart } from "../../utils/upload";
import { captureTiming } from "../../utils/perf";
import { todayLocal } from "../../utils/date";
import type { AgentId, CoachProposal } from "../../api/types";

const AGENT_LABELS: Record<AgentId, string> = {
  general: "General",
  meal: "Meals",
  training: "Training",
};
const AGENT_ORDER: AgentId[] = ["general", "meal", "training"];

const STARTERS = [
  "Give me this week's check-in",
  "Is my training volume enough?",
  "How's my protein intake?",
  "Should I change my calories?",
];

/**
 * Coach chat, used for both a fresh chat (`sessionId` omitted — created on the
 * first message) and an existing one.
 */
export function CoachChat({
  sessionId,
  title,
  initialAgent,
  initialMessage,
  localDate = todayLocal(),
  richLanding = false,
  chatLanding = false,
  onBack,
  tabbed = false,
}: {
  sessionId?: string;
  title?: string;
  initialAgent?: AgentId;
  initialMessage?: string;
  /** The day this chat is logging for (defaults to today). */
  localDate?: string;
  /** Coach-tab landing content instead of the plain empty state. */
  richLanding?: boolean;
  /** Full-chat welcome: greeting bubble plus prompt list. */
  chatLanding?: boolean;
  onBack?: () => void;
  /** The tab bar already accounts for the bottom safe area. */
  tabbed?: boolean;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const {
    messages,
    loading,
    streaming,
    status,
    error,
    send,
    stop,
    reset,
    retry,
    resolveProposal,
    dismissMealProposal,
    injectAssistant,
    injectUser,
    agent,
  } = useCoachChat(sessionId, initialAgent, localDate);
  const mealsApi = useMealsApi();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { isLocked } = useEntitlement();
  // Chat and meal scans have separate allowances: running out of chat must not
  // take away meal logging, which is a different endpoint.
  const chatLocked = isLocked("chat");
  const scanLocked = isLocked("meal_scan");
  const [input, setInput] = useState(initialMessage ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** Synchronous guard: `photoBusy` state only lands on the next render. */
  const photoBusyRef = useRef(false);
  /** Attached but not sent yet — the composer's text is its caption. */
  const [pendingPhoto, setPendingPhoto] = useState<UploadPhoto | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const canSend = !!(input.trim() || pendingPhoto);
  const showComposer = !richLanding;

  const openChat = (nextAgent: AgentId, prompt: string) =>
    router.navigate({
      pathname: "/coach/chat",
      params: { agent: nextAgent, q: prompt, date: "", fresh: "" },
    } as never);

  const handleQuickAction = (nextAgent: AgentId, prompt: string) => {
    openChat(nextAgent, prompt);
  };

  const selectAgent = (id: AgentId) => {
    if (id === agent) return;
    setInput("");
    setPendingPhoto(null);
    setShowAllSuggestions(false);
    reset(id);
  };


  const submit = (text: string) => {
    const caption = text.trim();
    const photo = pendingPhoto;
    if (loading || streaming || photoBusy || photoBusyRef.current) return;
    if (!caption && !photo) return;
    // Out of allowance: send them to the paywall instead of a 402 mid-stream.
    if (photo ? scanLocked : chatLocked) {
      router.navigate("/paywall" as never);
      return;
    }
    setInput("");
    setPendingPhoto(null);
    if (!photo) {
      send(text);
      return;
    }
    // Show what they said about the photo, then estimate from it plus the image.
    if (caption) injectUser(caption);
    photoBusyRef.current = true;
    void sendPhoto(photo, caption);
  };

  /** Picking only attaches the photo — the composer's text is sent as its caption. */
  const attachPhoto = async (source: PhotoSource) => {
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      if ("error" in picked) {
        injectAssistant(picked.error);
        return;
      }
      // Shrink before upload: the vision cost scales with pixels.
      const photo = await preparePhoto({
        uri: picked.asset.uri,
        width: picked.asset.width,
        height: picked.asset.height,
        name: picked.asset.fileName ?? null,
        mimeType: picked.asset.mimeType ?? null,
      });
      setPendingPhoto(photo);
    } catch (err) {
      injectAssistant(err instanceof Error ? err.message : "Couldn't use that photo.");
    }
  };

  const sendPhoto = useCallback(
    async (photo: UploadPhoto, caption: string) => {
      setPhotoBusy(true);
      const t0 = Date.now();
      let confidence: string | null = null;
      let failed = false;
      try {
        const form = new FormData();
        form.append("file", filePart(photo.uri, photo.name, photo.type));
        // What the athlete says about the photo beats what can be eyeballed from it.
        if (caption) form.append("description", caption);
        // The day being logged, so the estimate sees that day's meals.
        form.append("date", localDate);
        const analysis = await mealsApi.analyzeMeal(form);
        confidence = analysis.confidence;
        const proposal: CoachProposal = {
          kind: "meal_log",
          date: localDate,
          title: analysis.title,
          items: analysis.items,
          calories: analysis.calories,
          protein_g: analysis.protein_g,
          // Provenance + confidence travel with the card and are stored on confirm.
          source: "photo",
          confidence: analysis.confidence,
        };
        const proteinTarget = analysis.day?.protein_target_g ?? null;
        const proteinLeft =
          proteinTarget != null
            ? proteinTarget - ((analysis.day?.protein_g ?? 0) + analysis.protein_g)
            : null;
        const leftLine =
          proteinLeft != null && proteinTarget != null
            ? proteinLeft > 0
              ? ` That leaves ${proteinLeft} g of your ${proteinTarget} g protein target.`
              : ` That puts you ${Math.abs(proteinLeft)} g over your ${proteinTarget} g target.`
            : "";
        const text = analysis.question
          ? `${analysis.question} I've estimated the rest below.`
          : `Here's what I make of that: ${analysis.calories} kcal, ${analysis.protein_g} g protein.${leftLine} Confirm to log it.${
              analysis.confidence === "low"
                ? " I'm not fully sure of the portion — worth a quick check before confirming."
                : ""
            }`;
        injectAssistant(text, proposal);
      } catch (err) {
        failed = true;
        // Keep the photo (and caption) on the composer, so retrying doesn't mean
        // re-picking it from the camera roll.
        setPendingPhoto(photo);
        setInput((cur) => (cur.trim() ? cur : caption));
        injectAssistant(
          `${
            err instanceof Error ? err.message : "Couldn't analyze that photo."
          } The photo is still attached — send it again to retry.`,
        );
      } finally {
        photoBusyRef.current = false;
        setPhotoBusy(false);
        // Photo analysis latency + outcome (no image data, no identifiers).
        captureTiming(posthog, "meal_analyze", {
          total_ms: Date.now() - t0,
          confidence: confidence ?? "none",
          failed: failed ? 1 : 0,
        });
      }
    },
    [mealsApi, injectAssistant, posthog, localDate],
  );

  /** Snap it or pick one — the camera is the point, so it's offered first. */
  const pickMealPhoto = () =>
    Alert.alert("Add a meal photo", "Snap it now, or choose one you already have.", [
      { text: "Take photo", onPress: () => void attachPhoto("camera") },
      { text: "Choose photo", onPress: () => void attachPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScreenHeader
        variant="detail"
        title={title ?? "Coach"}
        subtitle={AGENT_LABELS[agent]}
        titleStyle={styles.chatTitle}
        style={styles.header}
        onBack={onBack ?? (() => router.back())}
        right={
          <>
            <IconButton
              name="time-outline"
              accessibilityLabel="Chat history"
              onPress={() => router.navigate("/coach/sessions" as never)}
            />
            <IconButton
              name="menu"
              accessibilityLabel="Coach menu"
              onPress={() => setMenuOpen(true)}
            />
          </>
        }
      />

      <ChipRow style={styles.agentChips} containerStyle={styles.agentChipsContainer}>
        {AGENT_ORDER.map((id) => (
          <Chip
            key={id}
            label={AGENT_LABELS[id]}
            active={agent === id}
            onPress={() => selectAgent(id)}
            style={styles.agentPill}
          />
        ))}
      </ChipRow>

      {error ? <Banner tone="warning" message={error} /> : null}

      {/* The chat transcript is free-text health conversation; keep it out of
          session replays by marking the list itself ph-no-capture (PostHog
          checks the accessibility label on any view). */}
      <View style={styles.chatViewport}>
      {loading ? null : messages.length === 0 ? (
        <ScrollView
          style={styles.listView}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {richLanding ? (
            <CoachLanding
              agent={agent}
              onQuickAction={handleQuickAction}
              onPrompt={(prompt) => openChat(agent, prompt)}
              onOpenContext={() => router.navigate("/coach/memory" as never)}
              showAllSuggestions={showAllSuggestions}
              onToggleSuggestions={() => setShowAllSuggestions((v) => !v)}
            />
          ) : chatLanding ? (
            <CoachChatLanding agent={agent} onPrompt={submit} />
          ) : (
            <View style={styles.empty}>
              <IconBadge name="sparkles" bg={colors.primarySoft} color={colors.primary} size={56} rounded={false} />
              <Text style={[typography.h3, styles.emptyTitle]}>Your AI coach</Text>
              <Text style={[typography.small, styles.emptyText]}>
                It can see your logs, your plan and your weekly verdict. Ask it anything, or start with one of these.
              </Text>
              <ChipRow style={styles.starters}>
                {STARTERS.map((s) => (
                  <Chip key={s} label={s} onPress={() => submit(s)} />
                ))}
              </ChipRow>
            </View>
          )}
        </ScrollView>
      ) : (
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        accessibilityLabel="ph-no-capture"
        collapsable={false}
        style={styles.listView}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
        }}
        ListEmptyComponent={
          loading ? null : richLanding ? (
            <CoachLanding
              agent={agent}
              onQuickAction={handleQuickAction}
              onPrompt={(prompt) => openChat(agent, prompt)}
              onOpenContext={() => router.navigate("/coach/memory" as never)}
              showAllSuggestions={showAllSuggestions}
              onToggleSuggestions={() => setShowAllSuggestions((v) => !v)}
            />
          ) : chatLanding ? (
            <CoachChatLanding agent={agent} onPrompt={submit} />
          ) : (
            <View style={styles.empty}>
              <IconBadge name="sparkles" bg={colors.primarySoft} color={colors.primary} size={56} rounded={false} />
              <Text style={[typography.h3, styles.emptyTitle]}>Your AI coach</Text>
              <Text style={[typography.small, styles.emptyText]}>
                It can see your logs, your plan and your weekly verdict. Ask it anything, or start with one of these.
              </Text>
              <ChipRow style={styles.starters}>
                {STARTERS.map((s) => (
                  <Chip key={s} label={s} onPress={() => submit(s)} />
                ))}
              </ChipRow>
            </View>
          )
        }
        renderItem={({ item }) => {
          const mine = item.role === "user";
          const thinking = !!item.streaming && item.content.length === 0;
          return (
            <View style={styles.itemWrap}>
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {thinking ? (
                    <View style={styles.typing}>
                      <ActivityIndicator size="small" color={colors.textDim} />
                      <Text style={typography.small}>{status ?? "Coach is thinking…"}</Text>
                    </View>
                  ) : (
                    <MessageBody
                      content={item.content}
                      streaming={!!item.streaming}
                      textStyle={[typography.body, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}
                    />
                  )}
                  {item.failed ? (
                    <Pressable onPress={retry} hitSlop={8} style={styles.retryRow}>
                      <Ionicons name="refresh" size={14} color={colors.danger} />
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {!mine && item.proposals?.length ? (
                <View style={styles.proposals}>
                  {item.proposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      messageId={item.id}
                      item={p}
                      onResolved={resolveProposal}
                      onDismissed={dismissMealProposal}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        }}
      />
      )}
      </View>

      {showComposer ? (
      <View style={styles.composer}>
        {pendingPhoto ? (
          <View style={styles.attachRow}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.attachThumb} />
            <Text style={styles.attachText} numberOfLines={2}>
              Add a note about it — what it is or how much — then send.
            </Text>
            <Pressable
              onPress={() => setPendingPhoto(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {chatLocked || scanLocked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See what Pro includes"
            onPress={() => router.navigate("/paywall" as never)}
            style={styles.lockedNotice}
          >
            <Ionicons name="lock-closed-outline" size={15} color={colors.primary} />
            <Text style={styles.lockedText} numberOfLines={2}>
              {chatLocked
                ? "You've used this week's free coach messages."
                : "You've used this month's free meal scans."}
            </Text>
            <Text style={styles.lockedAction}>See Pro</Text>
          </Pressable>
        ) : null}

        <View style={[styles.inputRow, { paddingBottom: spacing.md + (tabbed ? 0 : insets.bottom) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log a meal from a photo"
            onPress={
              photoBusy
                ? undefined
                : scanLocked
                  ? () => router.navigate("/paywall" as never)
                  : pickMealPhoto
            }
            style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]}
          >
            <Ionicons
              name={photoBusy ? "hourglass-outline" : "camera-outline"}
              size={20}
              color={photoBusy ? colors.textMuted : colors.text}
            />
          </Pressable>

          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder={
                pendingPhoto
                  ? "What's in it? e.g. 2 rotis, 1 cup dal"
                  : richLanding
                    ? "Ask your coach or describe an action…"
                    : "Ask your coach…"
              }
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
            />
          </View>

          {streaming ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop generating"
              onPress={stop}
              style={({ pressed }) => [styles.sendButton, styles.stopButton, pressed && styles.pressed]}
            >
              <Ionicons name="stop" size={15} color={colors.danger} />
            </Pressable>
          ) : photoBusy ? (
            <View style={styles.sendButton}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              onPress={() => submit(input)}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={canSend ? colors.onPrimary : colors.textMuted}
              />
            </Pressable>
          )}
        </View>
      </View>
      ) : null}

      <CoachMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        agent={agent}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * Renders the coach's prose: blank-line-separated paragraphs get breathing room,
 * and `**bold**` becomes a bold span. No other markdown, so replies stay prose.
 */
function MessageBody({
  content,
  streaming,
  textStyle,
}: {
  content: string;
  streaming: boolean;
  textStyle: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  if (paragraphs.length === 0) {
    return <Text style={textStyle}>{streaming ? "▍" : ""}</Text>;
  }

  return (
    <>
      {paragraphs.map((para, i) => (
        <Text key={i} style={[textStyle, i > 0 ? styles.paragraphGap : null]}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
              <Text key={j} style={styles.bold}>
                {part.slice(2, -2)}
              </Text>
            ) : (
              <Text key={j}>{part}</Text>
            ),
          )}
          {streaming && i === paragraphs.length - 1 ? "▍" : ""}
        </Text>
      ))}
    </>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg, gap: spacing.sm },
    header: { flexShrink: 0 },
    chatTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
    agentChips: { paddingHorizontal: spacing.screen, flexShrink: 0 },
    agentChipsContainer: { flexGrow: 0, flexShrink: 0 },
    agentPill: { height: 46, paddingHorizontal: spacing.xl },
    pressed: { opacity: 0.7 },
    chatViewport: { flex: 1, minHeight: 0 },
    listView: { flex: 1 },
    list: { padding: spacing.screen, gap: spacing.sm },

    empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.md },
    emptyTitle: { marginTop: spacing.sm },
    emptyText: { textAlign: "center", color: t.colors.textDim },
    starters: { alignSelf: "stretch", marginTop: spacing.sm },

    bubbleRow: { flexDirection: "row" },
    rowMine: { justifyContent: "flex-end" },
    rowTheirs: { justifyContent: "flex-start" },
    itemWrap: { gap: spacing.sm },
    proposals: { gap: spacing.sm, alignSelf: "stretch" },
    bubble: { maxWidth: "84%", borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
    bubbleMine: { backgroundColor: t.colors.primary },
    bubbleTheirs: { backgroundColor: t.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.cardBorder },
    bubbleTextMine: { color: t.colors.onPrimary, lineHeight: 21 },
    bubbleTextTheirs: { color: t.colors.text, lineHeight: 21 },
    paragraphGap: { marginTop: spacing.md },
    bold: { fontWeight: "700" },
    typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    retryRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
    retryText: { fontSize: 12, fontWeight: "700", color: t.colors.danger },

    composer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bg,
      flexShrink: 0,
    },
    lockedNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.screen,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      backgroundColor: t.colors.primarySoft,
    },
    lockedText: { flex: 1, fontSize: 12, color: t.colors.text },
    lockedAction: { fontSize: 12, fontWeight: "700", color: t.colors.primary },
    attachRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
      paddingTop: spacing.sm,
    },
    attachThumb: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      backgroundColor: t.colors.surfaceAlt,
    },
    attachText: { flex: 1, ...t.typography.caption, color: t.colors.textDim },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
      paddingTop: spacing.sm,
    },
    cameraButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    inputWrap: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: t.colors.surface,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingHorizontal: spacing.md,
    },
    input: {
      maxHeight: 108,
      paddingVertical: 12,
      fontSize: 15,
      color: t.colors.text,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.primary,
    },
    sendDisabled: { backgroundColor: t.colors.surfaceAlt },
    stopButton: { backgroundColor: t.colors.dangerSoft },
  }),
);


