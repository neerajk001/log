import { useState } from "react";
import { View } from "react-native";
import { spacing } from "../theme/spacing";
import { CalendarMonth } from "./CalendarMonth";
import { Sheet } from "./ui/controls";

/** Bottom-sheet month calendar for jumping to a past log date. */
export function CalendarSheet({
  visible,
  selected,
  max,
  marked,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: string;
  max: string;
  marked?: Set<string>;
  onClose: () => void;
  onSelect: (iso: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(
    () => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Go to date">
      <View style={{ paddingTop: spacing.sm }}>
        <CalendarMonth
          month={month}
          onPrevMonth={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
          onNextMonth={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
          selected={selected}
          max={max}
          onSelect={(iso) => {
            onSelect(iso);
            onClose();
          }}
          marked={marked ?? new Set()}
        />
      </View>
    </Sheet>
  );
}
