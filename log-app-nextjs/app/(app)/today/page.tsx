'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useTodayLog } from '@/src/hooks/useTodayLog';
import { api, ApiError } from '@/src/api/client';
import type { DailyDefaults, DailyField, VerdictResult } from '@/src/api/types';
import { LogField } from '@/src/components/LogField';

const VERDICT_SHORT: Record<string, string> = {
  hold: 'Hold steady',
  adjust_calories: 'Adjust calories',
  check_recovery: 'Check recovery',
};

const FIELDS: DailyField[] = ['weight_kg', 'calories', 'protein_g', 'sleep_hours'];

export default function TodayPage() {
  const { today, todayLog, yesterday, loading, error, retry, save, retrySave } = useTodayLog();
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictError, setVerdictError] = useState(false);
  const [defaults, setDefaults] = useState<DailyDefaults | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(true);

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

  const hasLockedMissing =
    !!defaults && !!todayLog && FIELDS.some((f) => defaults[f] != null && (todayLog[f] ?? null) == null);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">Today</h1>
        <span className="font-mono text-xs text-chalkDim">{today}</span>
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

      <Link href="/verdict" className="mt-4 block rounded-cardLg border border-hairline bg-surfaceRaised p-4">
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
