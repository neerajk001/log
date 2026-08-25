'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTodayLog } from '@/src/hooks/useTodayLog';
import { api, ApiError } from '@/src/api/client';
import type { VerdictResult } from '@/src/api/types';
import { LogField } from '@/src/components/LogField';

const VERDICT_SHORT: Record<string, string> = {
  hold: 'Hold steady',
  adjust_calories: 'Adjust calories',
  check_recovery: 'Check recovery',
};

export default function TodayPage() {
  const { today, todayLog, yesterday, loading, error, retry, save, retrySave } = useTodayLog();
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictError, setVerdictError] = useState(false);

  useEffect(() => {
    api
      .getWeeklyVerdict()
      .then(setVerdict)
      .catch(() => setVerdictError(true));
  }, []);

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
          placeholder={yesterday?.weight_kg ?? null}
          onSave={save}
          showRetry={retry?.field === 'weight_kg'}
          onRetry={retrySave}
        />
        <LogField
          label="Calories"
          unit="kcal"
          field="calories"
          value={todayLog?.calories ?? null}
          placeholder={yesterday?.calories ?? null}
          onSave={save}
          showRetry={retry?.field === 'calories'}
          onRetry={retrySave}
        />
        <LogField
          label="Protein"
          unit="g"
          field="protein_g"
          value={todayLog?.protein_g ?? null}
          placeholder={yesterday?.protein_g ?? null}
          onSave={save}
          showRetry={retry?.field === 'protein_g'}
          onRetry={retrySave}
        />
        <LogField
          label="Sleep"
          unit="h"
          field="sleep_hours"
          value={todayLog?.sleep_hours ?? null}
          placeholder={yesterday?.sleep_hours ?? null}
          onSave={save}
          showRetry={retry?.field === 'sleep_hours'}
          onRetry={retrySave}
        />
      </div>

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
