'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { TrendsResult, TrendWeightPoint } from '@/src/api/types';

function Sparkline({ points }: { points: TrendWeightPoint[] }) {
  if (points.length < 2) {
    return <p className="font-mono text-xs text-steel">Not enough data yet.</p>;
  }
  const vals = points.map((p) => p.avg_kg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = 80;
  const pad = 10;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = H - pad - ((p.avg_kg - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight trend">
      <polyline points={coords.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#e0603a" strokeWidth={2} />
      <path d={path} fill="none" stroke="#c1440e" strokeWidth={2} />
      <circle cx={last[0]} cy={last[1]} r={3} fill="#ece8e0" />
    </svg>
  );
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTrends()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load trends'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">Trends</h1>

      {loading && <p className="mt-4 font-mono text-sm text-steel">Loading…</p>}
      {error && <p className="mt-4 font-mono text-sm text-rustSoft">{error}</p>}

      {data && (
        <div className="mt-4 space-y-5">
          <section className="rounded-card border border-hairline bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Weight · 7-day avg, last 4 weeks
            </div>
            <div className="mt-3">
              <Sparkline points={data.weight} />
            </div>
          </section>

          <section className="rounded-card border border-hairline bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Lifts · this week vs last
            </div>
            <div className="mt-3 space-y-2">
              {data.lifts.length === 0 && (
                <p className="font-mono text-xs text-steel">No lift data yet.</p>
              )}
              {data.lifts.map((row) => (
                <div key={row.exercise} className="flex items-center justify-between gap-3">
                  <span className="font-body text-sm text-chalk">{row.exercise}</span>
                  <span className="flex items-center gap-2 font-mono text-sm">
                    <span className="text-chalk">{row.this_week_kg}kg</span>
                    <span className="text-chalkDim">/ {row.last_week_kg != null ? `${row.last_week_kg}kg` : '—'}</span>
                    <span
                      className={
                        row.delta === 'up'
                          ? 'text-moss'
                          : row.delta === 'down'
                            ? 'text-rustSoft'
                            : 'text-steel'
                      }
                    >
                      {row.delta === 'up' ? '▲' : row.delta === 'down' ? '▼' : '–'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
                Protein adherence
              </span>
              <span className="font-mono text-sm text-chalk">{data.adherence_pct}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-graphite">
              <div className="h-full bg-moss" style={{ width: `${data.adherence_pct}%` }} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
