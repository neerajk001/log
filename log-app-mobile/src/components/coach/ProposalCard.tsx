import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { Button } from "../ui/primitives";
import { usePlansApi } from "../../api/plans";
import { useLiftLogsApi } from "../../api/liftLogs";
import { useMealsApi } from "../../api/meals";
import { setPendingPlan } from "../../state/parsedPlan";
import { formatMediumDate } from "../../utils/date";
import type { IoniconName } from "../ui/primitives";
import type { ChatProposal } from "../../hooks/useCoachChat";

const TITLES: Record<ChatProposal["proposal"]["kind"], string> = {
  plan_update: "Plan update",
  plan_activate: "Switch active plan",
  plan_delete: "Delete plan",
  set_update: "Fix a logged set",
  set_delete: "Delete a logged set",
  meal_log: "Log meal",
  meal_update: "Fix a meal",
  meal_delete: "Delete a meal",
};

const ICONS: Record<ChatProposal["proposal"]["kind"], IoniconName> = {
  plan_update: "create-outline",
  plan_activate: "swap-horizontal-outline",
  plan_delete: "trash-outline",
  set_update: "create-outline",
  set_delete: "trash-outline",
  meal_log: "restaurant-outline",
  meal_update: "create-outline",
  meal_delete: "trash-outline",
};

/** A coach-proposed change, applied only when the user confirms. */
export function ProposalCard({
  messageId,
  item,
  onResolved,
}: {
  messageId: string;
  item: ChatProposal;
  onResolved: (
    messageId: string,
    proposalId: string,
    status: "applied" | "dismissed" | "error",
    note?: string,
  ) => void;
}) {
  const { proposal } = item;
  const plansApi = usePlansApi();
  const liftApi = useLiftLogsApi();
  const mealsApi = useMealsApi();
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = (status: "applied" | "dismissed", note?: string) =>
    onResolved(messageId, item.id, status, note);
  const messageOf = (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong.";

  if (item.status === "applied") {
    return (
      <View style={[styles.card, styles.done]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Text style={[typography.small, styles.doneText]}>{item.note ?? "Applied."}</Text>
      </View>
    );
  }

  const applyPlanUpdate = () => {
    setPendingPlan({
      editingPlanId: proposal.kind === "plan_update" ? proposal.plan_id : undefined,
      name: proposal.kind === "plan_update" ? proposal.name : "",
      source: proposal.kind === "plan_update" ? proposal.source : "manual",
      days:
        proposal.kind === "plan_update"
          ? proposal.days.map((d) => ({
              day_name: d.day_name,
              exercises: d.exercises.map((e) => ({
                name: e.name,
                sets: String(e.sets),
                reps: e.reps,
                weight: "",
              })),
            }))
          : [],
    });
    resolve("applied", "Review the changes, then tap Update Plan.");
    router.navigate("/plan/preview" as never);
  };

  const applyActivate = async () => {
    if (proposal.kind !== "plan_activate") return;
    setBusy(true);
    setError(null);
    try {
      await plansApi.activatePlan(proposal.plan_id);
      resolve("applied", `"${proposal.plan_name}" is now your active plan.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const applySetUpdate = async () => {
    if (proposal.kind !== "set_update") return;
    setBusy(true);
    setError(null);
    try {
      await liftApi.updateLiftLog(proposal.set_id, {
        weight_kg: proposal.to.weight_kg,
        reps: proposal.to.reps,
      });
      resolve("applied", "Set updated.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const applyDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      if (proposal.kind === "plan_delete") {
        await plansApi.deletePlan(proposal.plan_id);
        resolve("applied", `"${proposal.plan_name}" deleted.`);
      } else if (proposal.kind === "set_delete") {
        await liftApi.deleteLiftLog(proposal.set_id);
        resolve("applied", "Set deleted.");
      } else if (proposal.kind === "meal_delete") {
        await mealsApi.deleteMeal(proposal.meal_id);
        resolve("applied", `Removed "${proposal.title}".`);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const applyMealLog = async () => {
    if (proposal.kind !== "meal_log") return;
    setBusy(true);
    setError(null);
    try {
      await mealsApi.createMeal({
        date: proposal.date,
        title: proposal.title,
        items: proposal.items,
        calories: proposal.calories,
        protein_g: proposal.protein_g,
        source: "ai",
      });
      resolve("applied", `Logged "${proposal.title}" — ${proposal.calories} kcal, ${proposal.protein_g} g protein.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const applyMealUpdate = async () => {
    if (proposal.kind !== "meal_update") return;
    setBusy(true);
    setError(null);
    try {
      await mealsApi.updateMeal(proposal.meal_id, {
        title: proposal.title,
        items: proposal.items,
        calories: proposal.calories,
        protein_g: proposal.protein_g,
        source: "ai",
      });
      resolve("applied", `Updated "${proposal.title}".`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = () => {
    switch (proposal.kind) {
      case "plan_update":
        applyPlanUpdate();
        return;
      case "plan_activate":
        void applyActivate();
        return;
      case "set_update":
        void applySetUpdate();
        return;
      case "plan_delete":
        Alert.alert("Delete plan?", `"${proposal.plan_name}" and its days will be removed.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => void applyDelete() },
        ]);
        return;
      case "set_delete":
        Alert.alert(
          "Delete set?",
          `${proposal.exercise} · ${proposal.weight_kg} kg × ${proposal.reps} will be removed.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void applyDelete() },
          ],
        );
        return;
      case "meal_log":
        void applyMealLog();
        return;
      case "meal_update":
        void applyMealUpdate();
        return;
      case "meal_delete":
        Alert.alert(
          "Delete meal?",
          `"${proposal.title}" (${proposal.calories} kcal · ${proposal.protein_g} g) will be removed.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void applyDelete() },
          ],
        );
        return;
    }
  };

  const body = ((): string => {
    switch (proposal.kind) {
      case "plan_update":
        return proposal.summary || `Update "${proposal.plan_name}"`;
      case "plan_activate":
        return `Make "${proposal.plan_name}" your active plan?`;
      case "plan_delete":
        return `Delete "${proposal.plan_name}"? This can't be undone.`;
      case "set_update":
        return `${proposal.exercise} · ${formatMediumDate(proposal.date)} — ${proposal.from.weight_kg} kg × ${proposal.from.reps} → ${proposal.to.weight_kg} kg × ${proposal.to.reps}`;
      case "set_delete":
        return `${proposal.exercise} · ${formatMediumDate(proposal.date)} — remove ${proposal.weight_kg} kg × ${proposal.reps}`;
      case "meal_log":
        return `${proposal.title} · ${proposal.calories} kcal · ${proposal.protein_g} g protein\n${proposal.items
          .map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ""}`)
          .join(", ")}`;
      case "meal_update":
        return `Update "${proposal.title}" · ${proposal.calories} kcal · ${proposal.protein_g} g protein`;
      case "meal_delete":
        return `Remove "${proposal.title}" · ${proposal.calories} kcal · ${proposal.protein_g} g?`;
    }
  })();

  const destructive =
    proposal.kind === "plan_delete" ||
    proposal.kind === "set_delete" ||
    proposal.kind === "meal_delete";
  const confirmLabel =
    proposal.kind === "plan_update"
      ? "Review & apply"
      : proposal.kind === "plan_activate"
        ? "Switch"
        : proposal.kind === "meal_log"
          ? "Log it"
          : proposal.kind === "meal_update"
            ? "Update"
            : destructive
              ? "Delete"
              : "Apply";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={ICONS[proposal.kind]} size={16} color={colors.primary} />
        <Text style={[typography.bodyStrong, styles.title]}>{TITLES[proposal.kind]}</Text>
      </View>
      <Text style={[typography.small, styles.body]}>{body}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button
          label={confirmLabel}
          icon={destructive ? "trash-outline" : "checkmark"}
          variant={destructive ? "outline" : "primary"}
          size="sm"
          loading={busy}
          onPress={onConfirm}
          style={styles.flex}
        />
        <Button
          label="Dismiss"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() => resolve("dismissed")}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    card: {
      alignSelf: "stretch",
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: t.colors.primarySoft,
      padding: spacing.md,
    },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { flex: 1 },
    body: { color: t.colors.textDim },
    error: { ...t.typography.small, color: t.colors.danger },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    flex: { flex: 1 },
    done: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: t.colors.successSoft,
      borderColor: t.colors.successSoft,
    },
    doneText: { color: t.colors.success, flex: 1 },
  }),
);
