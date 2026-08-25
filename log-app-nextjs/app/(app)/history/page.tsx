'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/src/api/client';
import type { DailyLog, LiftLog } from '@/src/api/types';

const RANGES = [7, 30, 90];

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtWeekday(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

function Metric({ label, value }: { label: string; value: string }) {
  const empty = value === '—';
  return (
    <div className="rounded-card bg-graphite px-2 py-2 text-center">
      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-chalkDim">{label}</div>
      <div className={`mt-1 font-mono text-sm ${empty ? 'text-steel' : 'text-chalk'}`}>{value}</div>
    </div>
  );
}

export default function HistoryPage() {
  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState<DailyLog[]>([]);
  const [lifts, setLifts] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDaily, setOpenDaily] = useState<Record<string, boolean>>({});
  const [openLifts, setOpenLifts] = useState<Record<string, boolean>>({});

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
          sets: byEx[name]
            .slice()
            .sort((a, b) => a.created_at.localeCompare(b.created_at)),
        }));
        return { date, exercises };
      });
  }, [lifts]);

  async function handleDeleteDaily(date: string) {
    if (!window.confirm('Delete this day’s daily log?')) return;
    try {
      await api.deleteDailyLog(date);
      setDaily((prev) => prev.filter((d) => d.date !== date));
    } catch {
      window.alert('Could not delete that log.');
    }
  }

  async function handleDeleteLift(id: string) {
    if (!window.confirm('Delete this set?')) return;
    try {
      await api.deleteLiftLog(id);
      setLifts((prev) => prev.filter((l) => l.id !== id));
    } catch {
      window.alert('Could not delete that set.');
    }
  }

  async function handleDeleteLiftDay(date: string) {
    const group = liftGroups.find((g) => g.date === date);
    if (!group) return;
    const ids = group.exercises.flatMap((ex) => ex.sets.map((s) => s.id));
    if (ids.length === 0) return;
    if (!window.confirm('Delete all lifts for this day?')) return;
    try {
      await Promise.all(ids.map((id) => api.deleteLiftLog(id)));
      setLifts((prev) => prev.filter((l) => l.date !== date));
    } catch {
      window.alert('Could not delete those lifts.');
    }
  }

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
          <div className="mt-4 flex gap-2">
            <div className="flex-1 rounded-card border border-hairline bg-surface px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-chalkDim">Days logged</div>
              <div className="mt-0.5 font-mono text-lg text-chalk">{dailyRows.length}</div>
            </div>
            <div className="flex-1 rounded-card border border-hairline bg-surface px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-chalkDim">Workouts</div>
              <div className="mt-0.5 font-mono text-lg text-chalk">{liftGroups.length}</div>
            </div>
          </div>

          <section className="mt-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Daily logs
            </div>
            {dailyRows.length === 0 ? (
              <p className="mt-2 font-mono text-sm text-steel">No daily logs in this range.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {dailyRows.map((d) => {
                  const open = !!openDaily[d.date];
                  const parts = [
                    d.weight_kg != null ? `${d.weight_kg}kg` : null,
                    d.calories != null ? `${d.calories}` : null,
                    d.protein_g != null ? `${d.protein_g}g` : null,
                    d.sleep_hours != null ? `${d.sleep_hours}h` : null,
                  ].filter(Boolean) as string[];
                  return (
                    <div key={d.id} className="rounded-card border border-hairline bg-surface">
                      <button
                        type="button"
                        onClick={() => setOpenDaily((p) => ({ ...p, [d.date]: !p[d.date] }))}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm text-chalk">{fmtDate(d.date)}</span>
                          <span className="font-mono text-xs text-chalkDim">{fmtWeekday(d.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-chalkDim">
                            {parts.length ? parts.join(' · ') : 'empty'}
                          </span>
                          {open ? (
                            <ChevronDown size={16} className="text-steel" />
                          ) : (
                            <ChevronRight size={16} className="text-steel" />
                          )}
                        </div>
                      </button>
                      {open && (
                        <div className="border-t border-hairline px-4 pb-4 pt-3">
                          <div className="grid grid-cols-4 gap-2">
                            <Metric label="Weight" value={d.weight_kg != null ? `${d.weight_kg}kg` : '—'} />
                            <Metric label="Kcal" value={d.calories != null ? `${d.calories}` : '—'} />
                            <Metric label="Protein" value={d.protein_g != null ? `${d.protein_g}g` : '—'} />
                            <Metric label="Sleep" value={d.sleep_hours != null ? `${d.sleep_hours}h` : '—'} />
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleDeleteDaily(d.date)}
                              className="flex items-center gap-1 font-mono text-[11px] text-steel hover:text-rustSoft"
                            >
                              <Trash2 size={13} /> delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                {liftGroups.map((g) => {
                  const open = !!openLifts[g.date];
                  const totalSets = g.exercises.reduce((n, ex) => n + ex.sets.length, 0);
                  return (
                    <div key={g.date} className="rounded-card border border-hairline bg-surface">
                      <button
                        type="button"
                        onClick={() => setOpenLifts((p) => ({ ...p, [g.date]: !p[g.date] }))}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm text-chalk">{fmtDate(g.date)}</span>
                          <span className="font-mono text-xs text-chalkDim">{fmtWeekday(g.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-chalkDim">
                            {g.exercises.length} {g.exercises.length === 1 ? 'exercise' : 'exercises'} ·{' '}
                            {totalSets} {totalSets === 1 ? 'set' : 'sets'}
                          </span>
                          {open ? (
                            <ChevronDown size={16} className="text-steel" />
                          ) : (
                            <ChevronRight size={16} className="text-steel" />
                          )}
                        </div>
                      </button>
                        {open && (
                          <div className="border-t border-hairline px-4 pb-4 pt-3">
                            <div className="space-y-3">
                              {g.exercises.map((ex) => (
                                <div key={ex.name}>
                                  <div className="font-body text-sm text-chalk">{ex.name}</div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {ex.sets.map((s) => (
                                      <span
                                        key={s.id}
                                        className="flex items-center gap-1 rounded-full border border-hairline bg-graphite px-2 py-0.5 font-mono text-xs text-chalk"
                                      >
                                        {s.weight_kg} × {s.reps}
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteLift(s.id)}
                                          title="Delete set"
                                          className="text-steel hover:text-rustSoft"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleDeleteLiftDay(g.date)}
                                className="flex items-center gap-1 font-mono text-[11px] text-steel hover:text-rustSoft"
                              >
                                <Trash2 size={13} /> delete
                              </button>
                            </div>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
