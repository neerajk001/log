import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Banner, Button, Card } from "../../src/components/ui/primitives";
import { TextField } from "../../src/components/ui/controls";
import { OptionCard } from "../../src/components/OptionCard";
import { usePlansApi } from "../../src/api/plans";
import { setPendingPlan } from "../../src/state/parsedPlan";
import { ApiError } from "../../src/api/client";
import { emptyDay, type EditableDay } from "../../src/components/PlanDaysEditor";

function toEditableDays(
  days: { day_name: string; exercises: { name: string; sets: number; reps: string; weight_kg?: number | null }[] }[],
): EditableDay[] {
  return days.map((d) => ({
    day_name: d.day_name,
    exercises: d.exercises.map((e) => ({
      name: e.name,
      sets: String(e.sets),
      reps: e.reps,
      weight: e.weight_kg != null ? String(e.weight_kg) : "",
    })),
  }));
}

/** Add a plan (design 03.04) — import, build manually, or let the coach write one. */
export default function ImportPlanScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const api = usePlansApi();
  const { typography } = useTheme();
  const styles = useStyles();

  const [open, setOpen] = useState<"ai" | null>(params.mode === "manual" ? null : "ai");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedManual = useRef(false);

  const goPreview = useCallback((days: EditableDay[], source: "manual" | "ai_parsed") => {
    setPendingPlan({ name: "My Workout Plan", source, days });
    router.navigate("/plan/preview" as never);
  }, []);

  const startManual = useCallback(() => goPreview([emptyDay()], "manual"), [goPreview]);

  // `?mode=manual` (e.g. the Plan tab's "Build manually") goes straight to the editor.
  useEffect(() => {
    if (params.mode === "manual" && !startedManual.current) {
      startedManual.current = true;
      startManual();
    }
  }, [params.mode, startManual]);

  const parseText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste some plan text first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.parsePlanText(trimmed);
      goPreview(toEditableDays(result.days), "ai_parsed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't parse that — try pasting plain text.");
    } finally {
      setLoading(false);
    }
  }, [text, api, goPreview]);

  const parsePdf = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) {
        setLoading(false);
        return;
      }
      const file = result.assets[0];
      if (file.size != null && file.size > 2 * 1024 * 1024) {
        setError("That file is too large. Maximum size is 2 MB.");
        setLoading(false);
        return;
      }
      const lower = (file.name ?? "").toLowerCase();
      const mime = file.mimeType ?? "";
      const looksPdf = mime === "application/pdf" || lower.endsWith(".pdf");
      const looksText = mime === "text/plain" || lower.endsWith(".txt") || lower.endsWith(".md");
      if (!looksPdf && !looksText) {
        setError(`Only PDF or text files are accepted (got ${file.name || "unknown file"}).`);
        setLoading(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: looksPdf ? "application/pdf" : "text/plain",
      } as unknown as Blob);
      const parsed = await api.parsePlanPdfForm(formData);
      goPreview(toEditableDays(parsed.days), "ai_parsed");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          setError("Couldn't reach the server. Check that you're on the same Wi-Fi and the backend is running.");
        } else if (err.status === 422) {
          setError("Couldn't parse that PDF — try pasting plain text, or build the plan manually.");
        } else {
          setError(err.message || "Couldn't parse that PDF.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Couldn't parse that PDF.");
      }
    } finally {
      setLoading(false);
    }
  }, [api, goPreview]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          variant="detail"
          title="Add a plan"
          subtitle="Bring your own, or let the coach write one"
          onBack={() => router.back()}
        />

        <View style={styles.group}>
          <OptionCard
            icon="cloud-upload-outline"
            title="Paste or upload"
            subtitle="Paste text, or upload a PDF or text file"
            expanded={open === "ai"}
            onPress={() => setOpen((cur) => (cur === "ai" ? null : "ai"))}
          />

          {open === "ai" ? (
            <Card style={styles.panel}>
              {error ? <Banner tone="danger" message={error} /> : null}

              <TextField
                label="Your program"
                value={text}
                onChangeText={setText}
                placeholder="Paste your training program here…"
                multiline
                autoCapitalize="sentences"
              />

              <Button
                label="Parse & preview"
                icon="sparkles-outline"
                onPress={parseText}
                loading={loading}
                disabled={loading}
              />
              <Button
                label="Upload a PDF or text file"
                icon="cloud-upload-outline"
                variant="outline"
                onPress={parsePdf}
                disabled={loading}
              />
              <Text style={[typography.caption, styles.hint]}>PDF or text, up to 2 MB.</Text>
            </Card>
          ) : null}
        </View>

        <OptionCard
          icon="create-outline"
          title="Type it in myself"
          subtitle="Start from a blank day and add exercises"
          onPress={startManual}
        />
        <OptionCard
          icon="sparkles-outline"
          title="Let the coach write one"
          subtitle="Answer a few questions from your goal and schedule"
          onPress={() => router.navigate("/coach/onboarding" as never)}
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.md },
    group: { gap: spacing.sm },
    panel: { gap: spacing.sm, backgroundColor: t.colors.surfaceAlt },
    hint: { color: t.colors.textMuted, textAlign: "center" },
  }),
);
