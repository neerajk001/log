import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { todayLocal } from "../utils/date";

function msUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

/**
 * Today's local ISO date, kept live. Fires a re-render shortly after
 * midnight (plus a refresh whenever the app returns to the foreground,
 * covering sleep/timezone jumps where timers don't run). Returns the same
 * string across renders until the date actually changes, so downstream
 * effects and fetch hooks don't refire spuriously.
 */
export function useCurrentDate(): string {
  const [today, setToday] = useState(() => todayLocal());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // Small buffer so we land safely past midnight, then re-arm daily.
      timer = setTimeout(() => {
        setToday(todayLocal());
        schedule();
      }, msUntilMidnight() + 1000);
    };
    schedule();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setToday(todayLocal());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
