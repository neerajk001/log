'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { DailyLog, LiftLog } from '@/src/api/types';

const RANGES = [7, 30, 90];

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function HistoryPage() {
  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState<DailyLog[]>([]);
  const [lifts, setLifts] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const to = new Date().toISOString().slice(0, 10);
      const fromD = new Date();
      fromD.setDate(fromD.getDate() - (days - 1));
      const from = fromD.toISOString().slice(0, 10);
      try {
        const [d, l] = await Promise.all([
          api.getDailyLogs(from, to),
          api.getLiftLogsRange(from, to),
        ]);
        if (!cancelled) {
          setDaily(d);
          setLifts(l);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const dailyRows = useMemo(
    () =>
      daily.filter(
        (d) =>
          d.weight_kg != null ||
          d.calories != null ||
          d.protein_g != null ||
          d.sleep_hours != null,
      ),
    [daily],
  );

  const liftGroups = useMemo(() => {
    const byDate: Record<string, LiftLog[]> = {};
    for (const l of lifts) (byDate[l.date] ??= []).push(l);
    return Object.keys(byDate)
      .sort()
      .reverse()
      .map((date) => {
        const byEx: Record<string, LiftLog[]> = {};
        for (const l of byDate[date]) (byEx[l.exercise_name] ??= []).push(l);
        const exercises = Object.keys(byEx).map((name) => ({
          name,
          sets: byEx[name],
        }));
        return { date, exercises };
      });
  }, [lifts]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">History</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`rounded-card px-2 py-1 font-mono text-[11px] ${
                days === r ? 'bg-rust text-white' : 'border border-hairline text-chalkDim'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="mt-4 font-mono text-sm text-steel">Loading…</p>}
      {error && <p className="mt-4 font-mono text-sm text-rustSoft">{error}</p>}

      {!loading && !error && (
        <>
          <section className="mt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Daily logs
            </div>
            {dailyRows.length === 0 ? (
              <p className="mt-2 font-mono text-sm text-steel">No daily logs in this range.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {dailyRows.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-card border border-hairline bg-surface px-4 py-3"
                  >
                    <span className="font-mono text-xs text-chalkDim">{fmtDate(d.date)}</span>
                    <div className="flex gap-3 font-mono text-sm">
                      <span className="text-chalk">
                        {d.weight_kg != null ? `${d.weight_kg}kg` : '—'}
                      </span>
                      <span className="text-chalkDim">
                        {d.calories != null ? `${d.calories}kcal` : '—'}
                      </span>
                      <span className="text-chalkDim">
                        {d.protein_g != null ? `${d.protein_g}g` : '—'}
                      </span>
                      <span className="text-chalkDim">
                        {d.sleep_hours != null ? `${d.sleep_hours}h` : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Lift logs
            </div>
            {liftGroups.length === 0 ? (
              <p className="mt-2 font-mono text-sm text-steel">No lift logs in this range.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {liftGroups.map((g) => (
                  <div key={g.date} className="rounded-card border border-hairline bg-surface p-4">
                    <div className="font-mono text-xs text-chalkDim">{fmtDate(g.date)}</div>
                    <div className="mt-2 space-y-1">
                      {g.exercises.map((ex) => (
                        <div key={ex.name} className="flex items-center justify-between gap-3">
                          <span className="font-body text-sm text-chalk">{ex.name}</span>
                          <span className="font-mono text-xs text-chalkDim">
                            {ex.sets
                              .slice()
                              .sort((a, b) => a.created_at.localeCompare(b.created_at))
                              .map((s) => `${s.weight_kg}×${s.reps}`)
                              .join('  ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
