import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../theme/ThemeContext";
import { radii, spacing } from "../theme/spacing";
import { useMealsApi } from "../api/meals";
import { isUpgradeRequired } from "../api/client";
import { pickPhoto, preparePhoto, type PhotoSource, type UploadPhoto } from "../utils/image";
import { filePart } from "../utils/upload";
import { successTick } from "../hooks/useHaptics";
import { Banner, Button, Card, IconBadge, LoadingState } from "./ui/primitives";
import { Sheet, TextField } from "./ui/controls";
import type { EatingOutAnalysis, EatingOutOption } from "../api/types";

/**
 * Pro eating-out helper: snap the menu (or describe the restaurant) and get two
 * orders that fit what is left of today's macros. The menu photo is sent to the
 * vision model transiently and never stored, same as a meal photo.
 */
export function EatingOutSheet({
  visible,
  date,
  onClose,
  onLogged,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onLogged: () => void | Promise<void>;
}) {
  const api = useMealsApi();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<UploadPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EatingOutAnalysis | null>(null);

  const attachMenu = async (source: PhotoSource) => {
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      if ("error" in picked) {
        setError(picked.error);
        return;
      }
      const prepared = await preparePhoto({
        uri: picked.asset.uri,
        width: picked.asset.width,
        height: picked.asset.height,
        name: picked.asset.fileName ?? null,
        mimeType: picked.asset.mimeType ?? null,
      });
      setPhoto(prepared);
      setResult(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that photo.");
    }
  };

  const pickMenu = () =>
    Alert.alert("Add the menu", "Snap the menu, or choose a photo you already have.", [
      { text: "Take photo", onPress: () => void attachMenu("camera") },
      { text: "Choose photo", onPress: () => void attachMenu("library") },
      { text: "Cancel", style: "cancel" },
    ]);

  const analyze = async () => {
    const note = description.trim();
    if (!photo && note.length < 2) {
      setError("Add a menu photo or describe the restaurant and what you fancy.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (photo) form.append("file", filePart(photo.uri, photo.name, photo.type));
      if (note) form.append("description", note);
      form.append("date", date);
      const analysis = await api.analyzeEatingOut(form);
      setResult(analysis);
    } catch (err) {
      if (isUpgradeRequired(err)) {
        onClose();
        router.navigate("/paywall" as never);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't find an order. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const logOption = async (option: EatingOutOption) => {
    setLogging(option.title);
    setError(null);
    try {
      await api.createMeal({
        id: Crypto.randomUUID(),
        date,
        title: `${result?.restaurant ? `${result.restaurant} — ` : ""}${option.title}`.slice(0, 120),
        items: option.items,
        calories: option.calories,
        protein_g: option.protein_g,
        source: photo ? "photo" : "ai",
      });
      successTick();
      await onLogged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log that order.");
    } finally {
      setLogging(null);
    }
  };

  const remainingCalories =
    result?.day?.calorie_target != null
      ? Math.max(0, result.day.calorie_target - (result.day.calories ?? 0))
      : null;
  const remainingProtein =
    result?.day?.protein_target_g != null
      ? Math.max(0, result.day.protein_target_g - (result.day.protein_g ?? 0))
      : null;

  return (
    <Sheet visible={visible} onClose={onClose} title="Eating out">
      <PostHogMaskView style={styles.body}>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <IconBadge name="restaurant" bg={colors.primarySoft} color={colors.primary} size={38} />
            <Text style={[typography.small, styles.introText]}>
              Snap the menu or name the place. You&apos;ll get two orders that fit what&apos;s left
              today.
            </Text>
          </View>

          {photo ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
              <Pressable
                onPress={() => {
                  setPhoto(null);
                  setResult(null);
                }}
                style={styles.photoRemove}
                accessibilityRole="button"
                accessibilityLabel="Remove menu photo"
              >
                <Ionicons name="close" size={16} color={colors.text} />
              </Pressable>
            </View>
          ) : null}

          <Button
            label={photo ? "Replace menu photo" : "Add menu photo"}
            icon="camera-outline"
            variant="outline"
            onPress={pickMenu}
            disabled={busy}
          />

          <TextField
            label="Or describe it"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Chipotle, chicken bowl, trying to keep it light"
            autoCapitalize="sentences"
          />

          {error ? <Banner tone="danger" message={error} /> : null}

          <Button
            label="Find options"
            icon="search"
            loading={busy}
            disabled={busy || (!photo && description.trim().length < 2)}
            onPress={() => void analyze()}
          />

          {busy ? <LoadingState label="Reading the menu…" /> : null}

          {result ? (
            <View style={styles.results}>
              <View style={styles.resultHeader}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {result.restaurant}
                </Text>
                {remainingCalories != null || remainingProtein != null ? (
                  <Text style={[typography.caption, styles.remaining]}>
                    {remainingCalories != null ? `${remainingCalories} kcal left` : ""}
                    {remainingCalories != null && remainingProtein != null ? " · " : ""}
                    {remainingProtein != null ? `${remainingProtein} g protein left` : ""}
                  </Text>
                ) : null}
              </View>

              {result.note ? (
                <Text style={[typography.small, styles.note]}>{result.note}</Text>
              ) : null}

              {remainingCalories == null && remainingProtein == null ? (
                <Text style={[typography.small, styles.remaining]}>
                  No targets set — these are high-protein, moderate-calorie picks. Add targets in
                  Settings to fit your exact budget.
                </Text>
              ) : null}

              {result.options.map((option) => (
                <Card key={`${option.title}-${option.calories}`} style={styles.option}>
                  <View style={styles.optionTop}>
                    <Text style={[typography.bodyStrong, styles.optionTitle]} numberOfLines={2}>
                      {option.title}
                    </Text>
                    <Text style={[typography.caption, styles.optionMacros]}>
                      {option.calories} kcal · {option.protein_g} g
                    </Text>
                  </View>
                  <Text style={[typography.small, styles.order]}>{option.order}</Text>
                  <Text style={[typography.caption, styles.items]} numberOfLines={3}>
                    {option.items
                      .map((item) => `${item.name}${item.quantity ? ` (${item.quantity})` : ""}`)
                      .join(" · ")}
                  </Text>
                  <Button
                    label="Log this order"
                    icon="add"
                    size="sm"
                    loading={logging === option.title}
                    disabled={logging != null && logging !== option.title}
                    onPress={() => void logOption(option)}
                  />
                </Card>
              ))}

              <Text style={[typography.caption, styles.footnote]}>
                Estimates only — the numbers are added to today when you log the order.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </PostHogMaskView>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    body: { paddingTop: spacing.sm },
    scroll: { maxHeight: 520 },
    intro: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
    introText: { flex: 1, color: t.colors.textDim },
    photoWrap: { marginBottom: spacing.md, borderRadius: radii.md, overflow: "hidden" },
    photo: { width: "100%", height: 140, backgroundColor: t.colors.surfaceAlt },
    photoRemove: {
      position: "absolute",
      top: spacing.sm,
      right: spacing.sm,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.surface,
    },
    results: { gap: spacing.sm, marginTop: spacing.md },
    resultHeader: { gap: 2 },
    remaining: { color: t.colors.success },
    note: { color: t.colors.textDim },
    option: { gap: spacing.sm },
    optionTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    optionTitle: { flex: 1 },
    optionMacros: { color: t.colors.textDim },
    order: { color: t.colors.text },
    items: { color: t.colors.textMuted },
    footnote: { color: t.colors.textMuted, textAlign: "center", lineHeight: 17 },
  }),
);
