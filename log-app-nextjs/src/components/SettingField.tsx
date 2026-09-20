'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';

type Props = {
  label: string;
  unit: string;
  value: number | null;
  hint?: string;
  onSave: (value: number | null) => Promise<void>;
};

export function SettingField({ label, unit, value, hint, onSave }: Props) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  // keep input in sync with the server value unless the user is editing
  useEffect(() => {
    if (!focused.current) setDraft(value != null ? String(value) : '');
  }, [value]);

  async function commit() {
    focused.current = false;
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : parseFloat(trimmed);

    if (trimmed !== '' && Number.isNaN(next)) {
      setError('Enter a number.');
      return;
    }
    if (next != null && next <= 0) {
      setError('Must be greater than 0.');
      return;
    }
    if (next === value) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setDraft(value != null ? String(value) : '');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">{label}</div>
        {saving && <span className="font-mono text-[10px] text-steel">saving…</span>}
        {!saving && saved && (
          <span className="flex items-center gap-1 font-mono text-[10px] text-moss">
            <CircleCheck size={12} /> saved
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <input
          inputMode="numeric"
          className="w-full bg-transparent font-mono text-2xl text-chalk outline-none placeholder:text-steel"
          value={draft}
          placeholder="—"
          onFocus={() => (focused.current = true)}
          onBlur={commit}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
            setError(null);
          }}
        />
        <span className="font-mono text-xs text-chalkDim">{unit}</span>
      </div>
      {error ? (
        <div className="mt-2 font-mono text-[11px] text-rustSoft">{error}</div>
      ) : (
        hint && <div className="mt-1 font-mono text-[10px] text-steel">{hint}</div>
      )}
    </div>
  );
}
