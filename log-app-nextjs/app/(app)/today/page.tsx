'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Footprints,
  Bike,
  Waves,
  Activity as ActivityIcon,
} from 'lucide-react';
import { useTodayLog } from '@/src/hooks/useTodayLog';
import { api, ApiError } from '@/src/api/client';
import type {
  ActivityLog,
  ActivityType,
  DailyDefaults,
  DailyField,
  LiftLog,
  VerdictResult,
} from '@/src/api/types';
import { LogField } from '@/src/components/LogField';

function fmtLong(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
function shift(d: string, delta: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

const VERDICT_SHORT: Record<string, string> = {
  hold: 'Hold steady',
  adjust_calories: 'Adjust calories',
  check_recovery: 'Check recovery',
};

const FIELDS: DailyField[] = ['weight_kg', 'calories', 'protein_g', 'sleep_hours'];

const ACTIVITY_TYPES: { value: ActivityType; label: string; Icon: typeof ActivityIcon }[] = [
  { value: 'run', label: 'Run', Icon: Footprints },
  { value: 'cycle', label: 'Cycle', Icon: Bike },
  { value: 'walk', label: 'Walk', Icon: Footprints },
  { value: 'swim', label: 'Swim', Icon: Waves },
  { value: 'other', label: 'Other', Icon: ActivityIcon },
];

function ActivityForm({
  date,
  onSaved,
  onCancel,
}: {
  date: string;
  onSaved: (a: ActivityLog) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ActivityType>('run');
  const [name, setName] = useState('Run');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function chooseType(t: ActivityType) {
    setType(t);
    setName(t.charAt(0).toUpperCase() + t.slice(1));
  }

  async function submit() {
    const dur = parseInt(duration, 10);
    if (!name.trim() || !dur || dur <= 0) {
      setErr('Enter a name and duration.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await api.createActivityLog({
        date,
        activity_type: type,
        name: name.trim(),
        duration_min: dur,
        distance_km: distance ? parseFloat(distance) : null,
        calories_burned: calories ? parseInt(calories, 10) : null,
      });
      onSaved(created);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-card border border-hairline bg-surface p-3">
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => chooseType(t.value)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs ${
              type === t.value ? 'border-rust bg-rust text-white' : 'border-hairline text-chalkDim'
            }`}
          >
            <t.Icon size={12} /> {t.label}
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-body text-chalk outline-none focus:border-rust"
      />
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Min</span>
          <input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="30"
            className="mt-1 w-full rounded-card border border-hairline bg-graphite px-2 py-2 font-mono text-sm text-chalk outline-none focus:border-rust"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Km</span>
          <input
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="5"
            className="mt-1 w-full rounded-card border border-hairline bg-graphite px-2 py-2 font-mono text-sm text-chalk outline-none focus:border-rust"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Kcal</span>
          <input
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="300"
            className="mt-1 w-full rounded-card border border-hairline bg-graphite px-2 py-2 font-mono text-sm text-chalk outline-none focus:border-rust"
          />
        </label>
      </div>
      {err && <p className="font-mono text-xs text-rustSoft">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-card border border-hairline py-2 font-mono text-sm text-chalkDim"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="flex-1 rounded-card bg-rust py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [activeDate, setActiveDate] = useState(todayStr);
  const { todayLog, yesterday, loading, error, retry, save, retrySave } = useTodayLog(activeDate);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictError, setVerdictError] = useState(false);
  const [defaults, setDefaults] = useState<DailyDefaults | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(true);

  const [todayLifts, setTodayLifts] = useState<LiftLog[]>([]);
  const [todayActivities, setTodayActivities] = useState<ActivityLog[]>([]);
  const [showActivityForm, setShowActivityForm] = useState(false);

  useEffect(() => {
    api
      .getWeeklyVerdict()
      .then(setVerdict)
      .catch(() => setVerdictError(true));
  }, []);

  useEffect(() => {
    api
      .getMe()
      .then((me) => setDefaults(me.daily_defaults))
      .catch(() => {})
      .finally(() => setDefaultsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getLiftLogsRange(activeDate, activeDate), api.getActivityLogs(activeDate, activeDate)])
      .then(([l, a]) => {
        if (cancelled) return;
        setTodayLifts(l);
        setTodayActivities(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeDate]);

  const groupedLifts = useMemo(() => {
    const map: Record<string, LiftLog[]> = {};
    for (const l of todayLifts) (map[l.exercise_name] ??= []).push(l);
    return Object.keys(map).map((name) => ({ name, sets: map[name] }));
  }, [todayLifts]);

  const isLocked = (f: DailyField) => defaults?.[f] != null;

  // Auto-repeat locked defaults into today for any field still empty.
  useEffect(() => {
    if (!todayLog || !defaults) return;
    FIELDS.forEach((f) => {
      if (defaults[f] != null && (todayLog[f] ?? null) == null) save(f, defaults[f] as number);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayLog, defaults]);

  function toggleLock(f: DailyField) {
    if (!defaults) return;
    const current = (defaults[f] ?? null) as number | null;
    const seed = current != null ? null : todayLog?.[f] ?? yesterday?.[f] ?? null;
    if (current == null && seed == null) return; // nothing to lock
    const next: DailyDefaults = { ...defaults, [f]: current != null ? null : (seed as number) };
    api
      .updateMe({ daily_defaults: next })
      .then((me) => setDefaults(me.daily_defaults))
      .catch(() => {});
  }

  function applyAllDefaults() {
    if (!defaults) return;
    FIELDS.forEach((f) => {
      if (defaults[f] != null && (todayLog?.[f] ?? null) == null) save(f, defaults[f] as number);
    });
  }

  async function deleteLift(id: string) {
    try {
      await api.deleteLiftLog(id);
      setTodayLifts((prev) => prev.filter((l) => l.id !== id));
    } catch {
      /* ignore */
    }
  }
  async function deleteActivity(id: string) {
    try {
      await api.deleteActivityLog(id);
      setTodayActivities((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* ignore */
    }
  }

  const hasLockedMissing =
    !!defaults && !!todayLog && FIELDS.some((f) => defaults[f] != null && (todayLog[f] ?? null) == null);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">
          {activeDate === todayStr ? 'Today' : fmtLong(activeDate)}
        </h1>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-card border border-hairline bg-surface px-2 py-2">
        <button
          type="button"
          onClick={() => setActiveDate((d) => shift(d, -1))}
          className="p-2 text-chalkDim hover:text-chalk"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className="font-mono text-sm text-chalk">{fmtLong(activeDate)}</div>
          {activeDate !== todayStr && (
            <button
              type="button"
              onClick={() => setActiveDate(todayStr)}
              className="font-mono text-[10px] text-rustSoft"
            >
              jump to today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setActiveDate((d) => shift(d, 1))}
          disabled={activeDate >= todayStr}
          className="p-2 text-chalkDim hover:text-chalk disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading && <p className="mt-4 font-mono text-sm text-steel">Loading…</p>}
      {error && <p className="mt-4 font-mono text-sm text-rustSoft">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <LogField
          label="Today's Weight"
          unit="kg"
          field="weight_kg"
          value={todayLog?.weight_kg ?? null}
          placeholder={yesterday?.weight_kg ?? (isLocked('weight_kg') ? (defaults?.weight_kg ?? null) : null)}
          onSave={save}
          showRetry={retry?.field === 'weight_kg'}
          onRetry={retrySave}
          locked={isLocked('weight_kg')}
          onToggleLock={() => toggleLock('weight_kg')}
        />
        <LogField
          label="Calories"
          unit="kcal"
          field="calories"
          value={todayLog?.calories ?? null}
          placeholder={yesterday?.calories ?? (isLocked('calories') ? (defaults?.calories ?? null) : null)}
          onSave={save}
          showRetry={retry?.field === 'calories'}
          onRetry={retrySave}
          locked={isLocked('calories')}
          onToggleLock={() => toggleLock('calories')}
        />
        <LogField
          label="Protein"
          unit="g"
          field="protein_g"
          value={todayLog?.protein_g ?? null}
          placeholder={yesterday?.protein_g ?? (isLocked('protein_g') ? (defaults?.protein_g ?? null) : null)}
          onSave={save}
          showRetry={retry?.field === 'protein_g'}
          onRetry={retrySave}
          locked={isLocked('protein_g')}
          onToggleLock={() => toggleLock('protein_g')}
        />
        <LogField
          label="Sleep"
          unit="h"
          field="sleep_hours"
          value={todayLog?.sleep_hours ?? null}
          placeholder={yesterday?.sleep_hours ?? (isLocked('sleep_hours') ? (defaults?.sleep_hours ?? null) : null)}
          onSave={save}
          showRetry={retry?.field === 'sleep_hours'}
          onRetry={retrySave}
          locked={isLocked('sleep_hours')}
          onToggleLock={() => toggleLock('sleep_hours')}
        />
      </div>

      {!defaultsLoading && (hasLockedMissing || (defaults && FIELDS.some((f) => defaults[f] != null))) && (
        <button
          type="button"
          onClick={applyAllDefaults}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-card border border-moss/40 bg-moss/10 py-2 font-mono text-xs text-moss"
        >
          <RefreshCw size={12} />
          {hasLockedMissing ? 'Repeat my daily defaults for today' : 'Daily defaults set — manage locks above'}
        </button>
      )}

      {/* Today's lifts */}
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Today&apos;s lifts</div>
          <Link href="/lift" className="font-mono text-[11px] text-rustSoft">
            + add
          </Link>
        </div>
        {groupedLifts.length === 0 ? (
          <p className="mt-2 font-mono text-sm text-steel">No lifts logged yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {groupedLifts.map((g) => (
              <div key={g.name} className="rounded-card border border-hairline bg-surface p-3">
                <div className="font-body text-sm text-chalk">{g.name}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {g.sets.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1 rounded-full border border-hairline bg-graphite px-2 py-0.5 font-mono text-xs text-chalk"
                    >
                      {s.weight_kg} × {s.reps}
                      <button
                        type="button"
                        onClick={() => deleteLift(s.id)}
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
        )}
      </section>

      {/* Activity */}
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Activity</div>
          <button
            type="button"
            onClick={() => setShowActivityForm((v) => !v)}
            className="font-mono text-[11px] text-rustSoft"
          >
            {showActivityForm ? 'close' : '+ log'}
          </button>
        </div>
        {todayActivities.length === 0 && !showActivityForm && (
          <p className="mt-2 font-mono text-sm text-steel">No activity logged yet.</p>
        )}
        <div className="mt-2 space-y-2">
          {todayActivities.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-card border border-hairline bg-surface p-3"
            >
              <div className="min-w-0">
                <div className="truncate font-body text-sm text-chalk">{a.name}</div>
                <div className="font-mono text-xs text-chalkDim">
                  {a.duration_min} min
                  {a.distance_km != null ? ` · ${a.distance_km} km` : ''}
                  {a.calories_burned != null ? ` · ${a.calories_burned} kcal` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteActivity(a.id)}
                title="Delete activity"
                className="shrink-0 p-1 text-steel hover:text-rustSoft"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {showActivityForm && (
          <ActivityForm
            date={activeDate}
            onSaved={(a) => {
              setTodayActivities((prev) => [a, ...prev]);
              setShowActivityForm(false);
            }}
            onCancel={() => setShowActivityForm(false)}
          />
        )}
      </section>

      <Link href="/verdict" className="mt-5 block rounded-cardLg border border-hairline bg-surfaceRaised p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
          Weekly Verdict
        </div>
        {verdict ? (
          <p className="mt-2 font-display text-lg uppercase tracking-wide text-rustSoft">
            {VERDICT_SHORT[verdict.verdict]}
          </p>
        ) : (
          <p className="mt-2 font-mono text-sm text-steel">
            {verdictError ? 'Tap to view your verdict' : 'Computing…'}
          </p>
        )}
      </Link>

      <Link
        href="/lift"
        className="fixed bottom-[72px] right-4 z-10 rounded-card bg-rust px-5 py-3 font-mono text-sm font-medium text-white shadow-lg"
      >
        Log Lift
      </Link>
    </div>
  );
}
