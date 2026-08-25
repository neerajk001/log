'use client';

import { useEffect, useRef, useState } from 'react';
import type { DailyField } from '@/src/api/types';

type Props = {
  label: string;
  unit: string;
  value: number | null;
  placeholder: number | null;
  field: DailyField;
  onSave: (field: DailyField, value: number) => void;
  showRetry?: boolean;
  onRetry?: () => void;
};

export function LogField({ label, unit, value, placeholder, field, onSave, showRetry, onRetry }: Props) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : '');
  const focused = useRef(false);

  // keep input in sync with server value unless the user is editing
  useEffect(() => {
    if (!focused.current && value != null) setDraft(String(value));
  }, [value]);

  const display = draft !== '' ? draft : placeholder != null ? String(placeholder) : '—';

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <input
          inputMode="decimal"
          className="w-full bg-transparent font-mono text-2xl text-chalk outline-none placeholder:text-steel"
          value={draft}
          placeholder={placeholder != null ? String(placeholder) : '—'}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            const n = parseFloat(draft);
            if (!Number.isNaN(n)) onSave(field, n);
            else if (value != null) setDraft(String(value));
          }}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span className="font-mono text-xs text-chalkDim">{unit}</span>
      </div>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-mono text-[11px] text-rustSoft underline"
        >
          retry
        </button>
      )}
      {!showRetry && placeholder != null && value == null && (
        <div className="mt-1 font-mono text-[10px] text-steel">yesterday: {placeholder}{unit}</div>
      )}
    </div>
  );
}
