'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { VerdictResult } from '@/src/api/types';
import { VerdictStamp } from '@/src/components/VerdictStamp';

function trendLabel(v: string): string {
  if (v === 'up') return 'Up';
  if (v === 'down') return 'Down';
  return 'Flat';
}

export default function VerdictPage() {
  const [data, setData] = useState<VerdictResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getWeeklyVerdict()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load verdict'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">Verdict</h1>

      {loading && <p className="mt-4 font-mono text-sm text-steel">Computing…</p>}
      {error && <p className="mt-4 font-mono text-sm text-rustSoft">{error}</p>}

      {data && (
        <div className="mt-6 flex flex-col items-center">
          <VerdictStamp verdict={data.verdict} />
          <p className="mt-3 font-mono text-xs text-chalkDim">Week of {data.week_start_date}</p>

          <div className="mt-6 w-full space-y-3">
            <SignalRow label="Weight trend" value={`${data.weight_trend_kg_per_week.toFixed(2)} kg/wk`} />
            <SignalRow label="Strength trend" value={trendLabel(data.strength_trend)} />
            <SignalRow label="Protein adherence" value={`${data.adherence_pct}%`} />
          </div>

          <div className="mt-6 w-full rounded-card border border-hairline bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Why</div>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {data.reasoning.map((r, i) => (
                <li key={i} className="font-body text-sm text-chalk">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-card border border-hairline bg-surface px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">{label}</span>
      <span className="font-mono text-sm text-chalk">{value}</span>
    </div>
  );
}
