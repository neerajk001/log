'use client';

import { useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import { useLiftLog } from '@/src/hooks/useLiftLog';
import { usePlanToday } from '@/src/hooks/usePlanToday';
import type { PlanTodayExercise } from '@/src/api/types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function PlanExerciseCard({
  ex,
  planDayId,
  onLogged,
}: {
  ex: PlanTodayExercise;
  planDayId: string;
  onLogged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (Number.isNaN(w) || Number.isNaN(r)) return;
    setSaving(true);
    setErr(null);
    try {
      await api.createLiftLog({
        date: todayStr(),
        exercise_name: ex.name,
        weight_kg: w,
        reps: r,
        plan_day_id: planDayId,
      });
      setOpen(false);
      setWeight('');
      setReps('');
      onLogged();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to log');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-card border p-4 ${
        ex.logged ? 'border-moss/40 bg-moss/5' : 'border-hairline bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-body text-chalk">{ex.name}</div>
          <div className="font-mono text-xs text-chalkDim">
            {ex.sets} × {ex.reps}
          </div>
        </div>
        <div className="text-right">
          {ex.logged ? (
            <span className="font-mono text-xs text-moss">
              done{ex.last_log ? ` · ${ex.last_log.weight_kg}kg×${ex.last_log.reps}` : ''}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-card bg-rust px-3 py-1.5 font-mono text-xs font-medium text-white"
            >
              Log
            </button>
          )}
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-3">
          <input
            inputMode="decimal"
            placeholder="kg"
            className="rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <input
            inputMode="numeric"
            placeholder="reps"
            className="rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving}
            className="col-span-2 rounded-card bg-rust py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Set'}
          </button>
          {err && <p className="col-span-2 font-mono text-xs text-rustSoft">{err}</p>}
        </form>
      )}
    </div>
  );
}

export default function LiftPage() {
  const { planToday, loading, error: planError, reload } = usePlanToday();
  const { submit, submitting, error } = useLiftLog();
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [done, setDone] = useState<string | null>(null);

  async function handleManual(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (!exercise.trim() || Number.isNaN(w) || Number.isNaN(r)) return;
    const saved = await submit({ exercise_name: exercise.trim(), weight_kg: w, reps: r });
    if (saved) {
      setDone(`${saved.exercise_name} ${saved.weight_kg}kg × ${saved.reps}`);
      setExercise('');
      setWeight('');
      setReps('');
    }
  }

  const day = planToday?.day ?? null;

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">Lift</h1>

      {loading && <p className="mt-4 font-mono text-sm text-steel">Loading plan…</p>}
      {planError && <p className="mt-4 font-mono text-sm text-rustSoft">{planError}</p>}

      {day && (
        <div className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
            Today · {day.day_name}
          </div>
          <div className="mt-2 space-y-3">
            {day.exercises.map((ex) => (
              <PlanExerciseCard key={ex.name} ex={ex} planDayId={day.id} onLogged={reload} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
          {day ? 'Not on your plan? Log manually' : 'Manual entry'}
        </div>
        <form onSubmit={handleManual} className="mt-2 space-y-3 rounded-card border border-hairline bg-surface p-4">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Exercise</span>
            <input
              className="mt-1 w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-body text-chalk outline-none focus:border-rust"
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
              placeholder="e.g. Barbell Bench Press"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Weight (kg)</span>
              <input
                inputMode="decimal"
                className="mt-1 w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="62.5"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Reps</span>
              <input
                inputMode="numeric"
                className="mt-1 w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-mono text-chalk outline-none focus:border-rust"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="5"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-card bg-rust py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save Lift'}
          </button>
          {error && <p className="font-mono text-xs text-rustSoft">{error}</p>}
          {done && <p className="font-mono text-xs text-moss">Saved · {done}</p>}
        </form>
      </div>
    </div>
  );
}
