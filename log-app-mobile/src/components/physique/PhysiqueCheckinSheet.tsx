import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { PostHogMaskView } from "posthog-react-native";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { useCoachApi } from "../../api/coach";
import { isUpgradeRequired } from "../../api/client";
import { pickPhoto, preparePhoto, type PhotoSource, type UploadPhoto } from "../../utils/image";
import { filePart } from "../../utils/upload";
import { successTick } from "../../hooks/useHaptics";
import { Banner, Button, IconBadge } from "../ui/primitives";
import { Sheet } from "../ui/controls";
import type { PhysiqueCheckin } from "../../api/types";

/**
 * Adds (or replaces) this week's body photo. The image is encrypted before it
 * is stored; the AI comparison runs before the save, so a failed read never
 * leaves an orphan photo.
 */
export function PhysiqueCheckinSheet({
  visible,
  date,
  hasThisWeek,
  onClose,
  onSaved,
}: {
  visible: boolean;
  date: string;
  hasThisWeek: boolean;
  onClose: () => void;
  onSaved: (checkin: PhysiqueCheckin) => void | Promise<void>;
}) {
  const api = useCoachApi();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [photo, setPhoto] = useState<UploadPhoto | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A closed sheet may still finish its request server-side; it must not then
  // navigate the athlete out of wherever they went next.
  const activeRef = useRef(true);
  useEffect(
    () => () => {
      activeRef.current = false;
    },
    [],
  );

  const attach = async (source: PhotoSource) => {
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that photo.");
    }
  };

  const pick = () =>
    Alert.alert("Add your check-in photo", "Snap this week's photo, or choose one you already have.", [
      { text: "Take photo", onPress: () => void attach("camera") },
      { text: "Choose photo", onPress: () => void attach("library") },
      { text: "Cancel", style: "cancel" },
    ]);

  const save = async () => {
    if (!photo || !consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", filePart(photo.uri, photo.name, photo.type));
      form.append("date", date);
      form.append("consent", "true");
      const created = await api.createPhysiqueCheckin(form);
      if (!activeRef.current) return;
      successTick();
      onClose();
      await onSaved(created);
    } catch (err) {
      if (!activeRef.current) return;
      if (isUpgradeRequired(err)) {
        onClose();
        router.navigate("/paywall" as never);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't save that check-in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={hasThisWeek ? "Update this week's check-in" : "Weekly physique check-in"}
    >
      <PostHogMaskView>
        <ScrollView
          contentContainerStyle={styles.body}
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {photo ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
            <Pressable
              onPress={() => setPhoto(null)}
              disabled={busy}
              style={styles.removePhoto}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={pick}
              disabled={busy}
              style={styles.changePhoto}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
            >
              <Ionicons name="camera-outline" size={14} color={colors.onPrimary} />
              <Text style={styles.changePhotoText}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={pick}
            disabled={busy}
            style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add a check-in photo"
          >
            <IconBadge name="camera-outline" bg={colors.primarySoft} color={colors.primary} size={40} />
            <View style={styles.pickerText}>
              <Text style={typography.bodyStrong}>Add this week&apos;s photo</Text>
              <Text style={typography.small}>Front, same light and pose as the previous check-in.</Text>
            </View>
          </Pressable>
        )}

        <Text style={[typography.small, styles.explain]}>
          The coach compares this photo with your previous check-in, plus your weight, strength and
          protein logs, then gives 2–3 things to change or hold.
        </Text>

        {hasThisWeek ? (
          <Banner tone="warning" message="This replaces this week's photo and read." />
        ) : null}

        <View style={styles.consentRow}>
          <Switch
            value={consent}
            onValueChange={setConsent}
            disabled={busy}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            accessibilityLabel="Consent to store the photo encrypted"
          />
          <Text style={[typography.small, styles.consentText]}>
            I understand this photo is stored encrypted on the server and read by the AI coach. I
            can delete it anytime.
          </Text>
        </View>

        {error ? <Banner tone="danger" message={error} /> : null}
        {busy ? (
          <Text style={[typography.small, styles.busyNote]}>
            Comparing with your previous check-in… this can take up to a minute.
          </Text>
        ) : null}

        <Button
          label="Analyse & save"
          icon="sparkles"
          loading={busy}
          disabled={!photo || !consent}
          onPress={() => void save()}
        />
        </ScrollView>
      </PostHogMaskView>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    body: { gap: spacing.lg, paddingTop: spacing.sm },
    scroll: { maxHeight: 560 },
    pressed: { opacity: 0.8 },
    picker: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surfaceAlt,
      padding: spacing.md,
    },
    pickerText: { flex: 1, gap: 2 },
    previewWrap: { borderRadius: radii.lg, overflow: "hidden" },
    preview: { width: "100%", height: 260, backgroundColor: t.colors.surfaceAlt },
    removePhoto: {
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
    changePhoto: {
      position: "absolute",
      bottom: spacing.sm,
      right: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      height: 30,
      paddingHorizontal: spacing.sm,
      borderRadius: 15,
      backgroundColor: t.colors.primary,
    },
    changePhotoText: { fontSize: 12, fontWeight: "700", color: t.colors.onPrimary },
    explain: { color: t.colors.textDim, lineHeight: 19 },
    consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    consentText: { flex: 1, color: t.colors.textDim, lineHeight: 18 },
    busyNote: { color: t.colors.textDim, textAlign: "center" },
  }),
);
