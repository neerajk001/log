import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { ScreenHeader } from "../ScreenHeader";
import { Banner, IconBadge } from "../ui/primitives";
import { Chip, ChipRow, IconButton, OverflowMenu } from "../ui/controls";
import { ProposalCard } from "./ProposalCard";
import { useCoachChat, type ChatMessage } from "../../hooks/useCoachChat";
import { useMealsApi } from "../../api/meals";
import { pickPhoto, preparePhoto, type PhotoSource, type UploadPhoto } from "../../utils/image";
import { filePart } from "../../utils/upload";
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
}: {
  sessionId?: string;
  title?: string;
  initialAgent?: AgentId;
  initialMessage?: string;
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
    retry,
    resolveProposal,
    dismissMealProposal,
    injectAssistant,
    injectUser,
    agent,
    setAgent,
  } = useCoachChat(sessionId, initialAgent);
  const mealsApi = useMealsApi();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState(initialMessage ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** Attached but not sent yet — the composer's text is its caption. */
  const [pendingPhoto, setPendingPhoto] = useState<UploadPhoto | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const submit = (text: string) => {
    const caption = text.trim();
    const photo = pendingPhoto;
    if (streaming || photoBusy) return;
    if (!caption && !photo) return;
    setInput("");
    setPendingPhoto(null);
    if (!photo) {
      send(text);
      return;
    }
    // Show what they said about the photo, then estimate from it plus the image.
    if (caption) injectUser(caption);
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

  const sendPhoto = async (photo: UploadPhoto, caption: string) => {
    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.append("file", filePart(photo.uri, photo.name, photo.type));
      // What the athlete says about the photo beats what can be eyeballed from it.
      if (caption) form.append("description", caption);
      // The athlete's local date, so the estimate knows what's logged today.
      form.append("date", todayLocal());
      const analysis = await mealsApi.analyzeMeal(form);
      const proposal: CoachProposal = {
        kind: "meal_log",
        date: todayLocal(),
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
      injectAssistant(err instanceof Error ? err.message : "Couldn't analyze that photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

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
        onBack={() => router.back()}
        right={
          <>
            <IconButton
              name="time-outline"
              accessibilityLabel="Chat history"
              onPress={() => router.navigate("/coach/sessions" as never)}
            />
            <IconButton
              name="ellipsis-horizontal"
              accessibilityLabel="More options"
              onPress={() => setMenuOpen(true)}
            />
          </>
        }
      />

      <ChipRow style={styles.agentChips}>
        {AGENT_ORDER.map((id) => (
          <Chip key={id} label={AGENT_LABELS[id]} active={agent === id} onPress={() => setAgent(id)} />
        ))}
      </ChipRow>

      {error ? <Banner tone="warning" message={error} /> : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          loading ? null : (
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

        <View style={[styles.inputRow, { paddingBottom: spacing.md + insets.bottom }]}>
          <IconButton
            name={photoBusy ? "hourglass-outline" : "camera-outline"}
            accessibilityLabel="Log a meal from a photo"
            size={26}
            color={photoBusy ? colors.textMuted : colors.text}
            onPress={photoBusy ? undefined : pickMealPhoto}
          />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={pendingPhoto ? "What's in it? e.g. 2 rotis, 1 cup dal" : "Ask your coach…"}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          {streaming ? (
            <IconButton name="stop-circle" accessibilityLabel="Stop generating" size={30} color={colors.danger} onPress={stop} />
          ) : photoBusy ? (
            <View style={styles.sendBusy}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : (
            <IconButton
              name="arrow-up-circle"
              accessibilityLabel="Send message"
              size={30}
              color={input.trim() || pendingPhoto ? colors.primary : colors.textMuted}
              onPress={() => submit(input)}
            />
          )}
        </View>
      </View>

      <OverflowMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: "New chat",
            icon: "add",
            // `fresh` bypasses the Meals chat's one-thread-per-day reuse, and the
            // agent keeps you in the section you were in.
            onPress: () =>
              router.replace({ pathname: "/coach/new", params: { agent, fresh: "1" } } as never),
          },
          {
            label: "Chat history",
            icon: "time-outline",
            onPress: () => router.navigate("/coach/sessions" as never),
          },
          {
            label: "What the coach remembers",
            icon: "bulb-outline",
            onPress: () => router.navigate("/coach/memory" as never),
          },
          {
            label: "Your goals",
            icon: "options-outline",
            onPress: () => router.navigate("/coach/onboarding" as never),
          },
        ]}
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
    agentChips: { paddingHorizontal: spacing.screen },
    list: { padding: spacing.screen, gap: spacing.sm, flexGrow: 1 },

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
      backgroundColor: t.colors.surface,
    },
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
    sendBusy: { width: 30, alignItems: "center", justifyContent: "center" },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
      paddingHorizontal: spacing.screen,
      paddingTop: spacing.sm,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: t.colors.text,
    },
  }),
);
