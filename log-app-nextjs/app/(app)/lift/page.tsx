'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import { usePlanToday } from '@/src/hooks/usePlanToday';
import type { LiftLog, PlanTodayExercise } from '@/src/api/types';

type SetEntry = { weight: string; reps: string };

function makeSets(n: number): SetEntry[] {
  return Array.from({ length: Math.max(1, n) }, () => ({ weight: '', reps: '' }));
}
function validSet(s: SetEntry): boolean {
  const w = parseFloat(s.weight);
  const r = parseInt(s.reps, 10);
  return !Number.isNaN(w) && w > 0 && !Number.isNaN(r) && r > 0;
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function LiftPage() {
  const { planToday, loading: planLoading, error: planError, reload } = usePlanToday();
  const day = planToday?.day ?? null;

  const [openEx, setOpenEx] = useState<Record<string, boolean>>({});
  const [setsByEx, setSetsByEx] = useState<Record<string, SetEntry[]>>({});
  const [saveState, setSaveState] = useState<Record<string, { saving: boolean; err: string | null }>>({});

  const [manualName, setManualName] = useState('');
  const [manualSets, setManualSets] = useState<SetEntry[]>([{ weight: '', reps: '' }]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualErr, setManualErr] = useState<string | null>(null);

  const [todayLifts, setTodayLifts] = useState<LiftLog[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  async function refreshToday() {
    setTodayLoading(true);
    try {
      const t = todayStr();
      setTodayLifts(await api.getLiftLogsRange(t, t));
    } catch {
      /* ignore */
    } finally {
      setTodayLoading(false);
    }
  }
  useEffect(() => {
    refreshToday();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, LiftLog[]> = {};
    for (const l of todayLifts) (map[l.exercise_name] ??= []).push(l);
    const out: { name: string; sets: LiftLog[] }[] = [];
    const seen: Record<string, boolean> = {};
    for (const l of todayLifts) {
      if (seen[l.exercise_name]) continue;
      seen[l.exercise_name] = true;
      out.push({ name: l.exercise_name, sets: map[l.exercise_name] });
    }
    return out;
  }, [todayLifts]);

  function getSets(name: string, planned: number): SetEntry[] {
    return setsByEx[name] ?? makeSets(planned);
  }
  function updateSet(name: string, i: number, patch: Partial<SetEntry>) {
    setSetsByEx((p) => {
      const cur = p[name] ?? [];
      return { ...p, [name]: cur.map((s, j) => (j === i ? { ...s, ...patch } : s)) };
    });
  }
  function addSet(name: string, planned: number) {
    setSetsByEx((p) => {
      const cur = p[name] ?? makeSets(planned);
      const last = cur[cur.length - 1];
      return { ...p, [name]: [...cur, { weight: last?.weight ?? '', reps: last?.reps ?? '' }] };
    });
  }
  function removeSet(name: string, i: number) {
    setSetsByEx((p) => {
      const cur = p[name] ?? [];
      if (cur.length <= 1) return p;
      return { ...p, [name]: cur.filter((_, j) => j !== i) };
    });
  }
  function toggleOpen(name: string, planned: number) {
    setOpenEx((p) => ({ ...p, [name]: !p[name] }));
    setSetsByEx((p) => (p[name] ? p : { ...p, [name]: makeSets(planned) }));
  }

  async function saveSets(name: string, planDayId: string | null, planned: number) {
    const sets = setsByEx[name] ?? [];
    const valid = sets.filter(validSet);
    if (valid.length === 0) return;
    setSaveState((p) => ({ ...p, [name]: { saving: true, err: null } }));
    try {
      await Promise.all(
        valid.map((s) =>
          api.createLiftLog({
            date: todayStr(),
            exercise_name: name,
            weight_kg: parseFloat(s.weight),
            reps: parseInt(s.reps, 10),
            plan_day_id: planDayId,
          }),
        ),
      );
      setOpenEx((p) => ({ ...p, [name]: false }));
      setSetsByEx((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
      await refreshToday();
      reload();
    } catch (e) {
      setSaveState((p) => ({
        ...p,
        [name]: { saving: false, err: e instanceof ApiError ? e.message : 'Failed to save' },
      }));
    } finally {
      setSaveState((p) => ({ ...p, [name]: { ...(p[name] ?? { err: null }), saving: false } }));
    }
  }

  async function saveManual() {
    const valid = manualSets.filter(validSet);
    if (!manualName.trim() || valid.length === 0) return;
    setManualSaving(true);
    setManualErr(null);
    try {
      await Promise.all(
        valid.map((s) =>
          api.createLiftLog({
            date: todayStr(),
            exercise_name: manualName.trim(),
            weight_kg: parseFloat(s.weight),
            reps: parseInt(s.reps, 10),
          }),
        ),
      );
      setManualName('');
      setManualSets([{ weight: '', reps: '' }]);
      await refreshToday();
      reload();
    } catch (e) {
      setManualErr(e instanceof ApiError ? e.message : 'Failed to save');
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">Lift</h1>

      {planLoading && <p className="mt-4 font-mono text-sm text-steel">Loading plan…</p>}
      {planError && <p className="mt-4 font-mono text-sm text-rustSoft">{planError}</p>}

      {day && (
        <div className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
            {planToday?.plan_name?.toUpperCase() ?? "Today's plan"} — {day.day_name}
          </div>
          <div className="mt-2 space-y-3">
            {day.exercises.map((ex: PlanTodayExercise) => {
              const isOpen = !!openEx[ex.name];
              const completed = todayLifts.filter((l) => l.exercise_name === ex.name);
              const sets = getSets(ex.name, ex.sets);
              const st = saveState[ex.name];
              return (
                <div key={ex.name} className="rounded-card border border-hairline bg-surface p-4">
                  <button
                    type="button"
                    onClick={() => toggleOpen(ex.name, ex.sets)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="font-body text-chalk">{ex.name}</div>
                      <div className="font-mono text-xs text-chalkDim">
                        {ex.sets} sets × {ex.reps}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {completed.length > 0 && (
                        <span className="font-mono text-xs text-moss">
                          ✓ {completed.length}/{ex.sets}
                        </span>
                      )}
                      <span className="font-mono text-sm font-medium text-rustSoft">
                        {isOpen ? 'Cancel' : 'Log'}
                      </span>
                    </div>
                  </button>

                  {completed.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {completed.map((s, i) => (
                        <div key={s.id} className="font-mono text-xs text-chalkDim">
                          Set {i + 1}: {s.weight_kg}kg × {s.reps}
                        </div>
                      ))}
                    </div>
                  )}

                  {isOpen && (
                    <div className="mt-3 space-y-2">
                      {sets.map((set, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-12 font-mono text-xs text-chalkDim">Set {i + 1}</span>
                          <input
                            inputMode="decimal"
                            placeholder="kg"
                            className="w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
                            value={set.weight}
                            onChange={(e) => updateSet(ex.name, i, { weight: e.target.value })}
                          />
                          <input
                            inputMode="numeric"
                            placeholder="reps"
                            className="w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
                            value={set.reps}
                            onChange={(e) => updateSet(ex.name, i, { reps: e.target.value })}
                          />
                          {sets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSet(ex.name, i)}
                              className="px-2 font-mono text-lg text-steel"
                              aria-label="Remove set"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => addSet(ex.name, ex.sets)}
                          className="font-mono text-sm font-medium text-rustSoft"
                        >
                          + Add set
                        </button>
                        <button
                          type="button"
                          disabled={st?.saving}
                          onClick={() => saveSets(ex.name, day.id, ex.sets)}
                          className="rounded-card bg-rust px-4 py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
                        >
                          {st?.saving ? 'Saving…' : 'Save all'}
                        </button>
                      </div>
                      {st?.err && <p className="font-mono text-xs text-rustSoft">{st.err}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
          {day ? 'Not on your plan? Log manually' : 'Log a lift'}
        </div>
        <div className="mt-2 space-y-3 rounded-card border border-hairline bg-surface p-4">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Exercise
            </span>
            <input
              className="mt-1 w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-body text-chalk outline-none focus:border-rust"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Barbell Bench Press"
            />
          </label>
          {manualSets.map((set, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 font-mono text-xs text-chalkDim">Set {i + 1}</span>
              <input
                inputMode="decimal"
                placeholder="kg"
                className="w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
                value={set.weight}
                onChange={(e) =>
                  setManualSets((prev) => prev.map((s, j) => (j === i ? { ...s, weight: e.target.value } : s)))
                }
              />
              <input
                inputMode="numeric"
                placeholder="reps"
                className="w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
                value={set.reps}
                onChange={(e) =>
                  setManualSets((prev) => prev.map((s, j) => (j === i ? { ...s, reps: e.target.value } : s)))
                }
              />
              {manualSets.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setManualSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
                  }
                  className="px-2 font-mono text-lg text-steel"
                  aria-label="Remove set"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setManualSets((prev) => [...prev, { weight: '', reps: '' }])}
              className="font-mono text-sm font-medium text-rustSoft"
            >
              + Add set
            </button>
            <button
              type="button"
              disabled={manualSaving}
              onClick={saveManual}
              className="rounded-card bg-rust px-4 py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
            >
              {manualSaving ? 'Saving…' : 'Save all'}
            </button>
          </div>
          {manualErr && <p className="font-mono text-xs text-rustSoft">{manualErr}</p>}
        </div>
      </div>

      <div className="mt-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Today's lifts</div>
        {todayLoading ? (
          <p className="mt-2 font-mono text-sm text-steel">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="mt-2 font-mono text-sm text-steel">No lifts logged today</p>
        ) : (
          <div className="mt-2 space-y-2">
            {grouped.map((group) => {
              const isOpen = !!openHistory[group.name];
              return (
                <div key={group.name} className="rounded-card border border-hairline bg-surface p-4">
                  <button
                    type="button"
                    onClick={() => setOpenHistory((p) => ({ ...p, [group.name]: !p[group.name] }))}
                    className="flex w-full items-center justify-between"
                  >
                    <span className="font-body text-chalk">{group.name}</span>
                    <span className="font-mono text-sm text-rustSoft">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-2 space-y-1 border-t border-hairline pt-2">
                      {group.sets.map((s, i) => (
                        <div key={s.id} className="flex items-center justify-between font-mono text-xs">
                          <span className="text-chalkDim">Set {i + 1}</span>
                          <span className="text-chalk">
                            {s.weight_kg}kg × {s.reps}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
