import type { VerdictValue } from '@/src/api/types';

const LABELS: Record<VerdictValue, string> = {
  hold: 'HOLD STEADY',
  adjust_calories: 'ADJUST CALORIES',
  check_recovery: 'CHECK RECOVERY',
};

export function VerdictStamp({ verdict }: { verdict: VerdictValue }) {
  return (
    <div className="-rotate-[6deg] inline-block rounded-[6px] border-[3px] border-rust bg-graphite px-6 py-3 shadow-lg">
      <span className="font-display text-2xl font-bold uppercase tracking-wide text-rust">
        {LABELS[verdict]}
      </span>
    </div>
  );
}
