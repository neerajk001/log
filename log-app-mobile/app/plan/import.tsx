import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Button, Banner, Card, IconBadge } from "../../src/components/ui/primitives";
import { SegmentedControl, TextField } from "../../src/components/ui/controls";
import { usePlansApi } from "../../src/api/plans";
import { setPendingPlan } from "../../src/state/parsedPlan";
import { ApiError } from "../../src/api/client";
import { emptyDay, type EditableDay } from "../../src/components/PlanDaysEditor";

function toEditableDays(days: { day_name: string; exercises: { name: string; sets: number; reps: string }[] }[]): EditableDay[] {
  return days.map((d) => ({
    day_name: d.day_name,
    exercises: d.exercises.map((e) => ({ name: e.name, sets: String(e.sets), reps: e.reps })),
  }));
}

/** Import plan (design 03.04) — AI parse or manual build. */
export default function ImportPlanScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const api = usePlansApi();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const [mode, setMode] = useState<"ai" | "manual">(params.mode === "manual" ? "manual" : "ai");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goPreview = useCallback(
    (days: EditableDay[], source: "manual" | "ai_parsed") => {
      setPendingPlan({ name: "My Workout Plan", source, days });
      router.navigate("/plan/preview" as never);
    },
    [],
  );

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
        <ScreenHeader variant="detail" title="Import Plan" onBack={() => router.back()} />

        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "ai", label: "Import (AI)" },
            { value: "manual", label: "Manual" },
          ]}
        />

        {error ? <Banner tone="danger" message={error} /> : null}

        {mode === "ai" ? (
          <>
            <Card style={styles.hero}>
              <IconBadge name="sparkles" bg={colors.primarySoft} color={colors.primary} size={56} rounded={false} />
              <Text style={typography.h3}>Import with AI</Text>
              <Text style={[typography.small, styles.heroText]}>
                {"Paste your training program or upload a PDF and we'll structure it for you."}
              </Text>
            </Card>

            <TextField
              label="Your program"
              value={text}
              onChangeText={setText}
              placeholder="Paste your training program here…"
              multiline
              autoCapitalize="sentences"
            />

            <Button label="Upload file (PDF or text)" icon="cloud-upload-outline" variant="outline" onPress={parsePdf} disabled={loading} />

            <Button label="Parse Plan" icon="sparkles-outline" onPress={parseText} loading={loading} />

            <Text style={[typography.small, styles.fallback]}>
              {"Couldn't parse? You can always build the plan manually."}
            </Text>
            <Button label="Build manually" variant="ghost" onPress={() => setMode("manual")} />
          </>
        ) : (
          <>
            <Card style={styles.hero}>
              <IconBadge name="create-outline" bg={colors.purpleSoft} color={colors.purple} size={56} rounded={false} />
              <Text style={typography.h3}>Build it yourself</Text>
              <Text style={[typography.small, styles.heroText]}>
                Add workout days and exercises, then set your sets and reps.
              </Text>
            </Card>
            <Button label="Start building" icon="add" onPress={() => goPreview([emptyDay()], "manual")} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
    heroText: { textAlign: "center", color: t.colors.textDim },
    fallback: { textAlign: "center", color: t.colors.textMuted },
  }),
);
