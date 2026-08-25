'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/src/api/client';
import type { PlanDay, PlanExercise } from '@/src/api/types';

const EMPTY_DAY = { day_name: '', exercises: [{ name: '', sets: 1, reps: '' }] };

export default function PlanPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  // AI parse mode
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<PlanDay[] | null>(null);
  const [planName, setPlanName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual mode
  const [manualDays, setManualDays] = useState<{ day_name: string; exercises: PlanExercise[] }[]>([
    { ...EMPTY_DAY },
  ]);

  async function handleParse() {
    setBusy(true);
    setParseError(null);
    setDraft(null);
    try {
      const res = await api.parsePlan({ text: text || undefined, file: file ?? undefined });
      setDraft(res.days);
      if (!planName) setPlanName('Imported Plan');
    } catch (e) {
      setParseError(e instanceof ApiError ? e.message : 'Failed to parse plan');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(source: 'ai_parsed' | 'manual') {
    setBusy(true);
    setError(null);
    try {
      const days =
        source === 'ai_parsed'
          ? (draft ?? []).map((d) => ({ day_name: d.day_name, exercises: d.exercises }))
          : manualDays;
      await api.createPlan({ name: planName || 'My Plan', source, days });
      router.push('/lift');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save plan');
    } finally {
      setBusy(false);
    }
  }

  function updateDraftDay(idx: number, patch: Partial<PlanDay>) {
    setDraft((d) => (d ? d.map((day, i) => (i === idx ? { ...day, ...patch } : day)) : d));
  }
  function updateDraftExercise(dayIdx: number, exIdx: number, patch: Partial<PlanExercise>) {
    setDraft((d) =>
      d
        ? d.map((day, i) =>
            i === dayIdx
              ? {
                  ...day,
                  exercises: day.exercises.map((ex, j) => (j === exIdx ? { ...ex, ...patch } : ex)),
                }
              : day,
          )
        : d,
    );
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">Plan</h1>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMode('ai')}
          className={`flex-1 rounded-card py-2 font-mono text-xs uppercase ${
            mode === 'ai' ? 'bg-rust text-white' : 'border border-hairline text-chalkDim'
          }`}
        >
          Import (AI)
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 rounded-card py-2 font-mono text-xs uppercase ${
            mode === 'manual' ? 'bg-rust text-white' : 'border border-hairline text-chalkDim'
          }`}
        >
          Manual
        </button>
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">Plan name</span>
        <input
          className="mt-1 w-full rounded-card border border-hairline bg-graphite px-3 py-2 font-body text-chalk outline-none focus:border-rust"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="6-Day Strength + Fat Loss"
        />
      </label>

      {mode === 'ai' && (
        <div className="mt-4 space-y-3">
          <textarea
            className="h-40 w-full rounded-card border border-hairline bg-surface p-3 font-mono text-sm text-chalk outline-none focus:border-rust"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your training program here…"
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block font-mono text-xs text-chalkDim"
          />
          <button
            onClick={handleParse}
            disabled={busy}
            className="w-full rounded-card bg-rust py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Parsing…' : 'Parse Plan'}
          </button>

          {parseError && (
            <div className="rounded-card border border-rustSoft/50 bg-surface p-3">
              <p className="font-mono text-xs text-rustSoft">{parseError}</p>
              <button
                onClick={() => setMode('manual')}
                className="mt-2 font-mono text-xs text-rustSoft underline"
              >
                Add exercises manually instead
              </button>
            </div>
          )}

          {draft && (
            <div className="space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
                Review &amp; edit before saving
              </div>
              {draft.map((day, di) => (
                <div key={di} className="rounded-card border border-hairline bg-surface p-3">
                  <input
                    className="w-full bg-transparent font-display text-lg text-chalk outline-none"
                    value={day.day_name}
                    onChange={(e) => updateDraftDay(di, { day_name: e.target.value })}
                  />
                  <div className="mt-2 space-y-2">
                    {day.exercises.map((ex, ei) => (
                      <div key={ei} className="grid grid-cols-[1fr_56px_72px] gap-2">
                        <input
                          className="rounded-card border border-hairline bg-graphite px-2 py-1 font-body text-sm text-chalk outline-none"
                          value={ex.name}
                          onChange={(e) => updateDraftExercise(di, ei, { name: e.target.value })}
                        />
                        <input
                          inputMode="numeric"
                          className="rounded-card border border-hairline bg-graphite px-2 py-1 font-mono text-sm text-chalk outline-none"
                          value={ex.sets}
                          onChange={(e) =>
                            updateDraftExercise(di, ei, { sets: parseInt(e.target.value || '0', 10) || 0 })
                          }
                        />
                        <input
                          className="rounded-card border border-hairline bg-graphite px-2 py-1 font-mono text-sm text-chalk outline-none"
                          value={ex.reps}
                          onChange={(e) => updateDraftExercise(di, ei, { reps: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => handleConfirm('ai_parsed')}
                disabled={busy}
                className="w-full rounded-card bg-rust py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
              >
                Confirm &amp; Save Plan
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="mt-4 space-y-3">
          {manualDays.map((day, di) => (
            <div key={di} className="rounded-card border border-hairline bg-surface p-3">
              <input
                className="w-full bg-transparent font-display text-lg text-chalk outline-none"
                value={day.day_name}
                onChange={(e) =>
                  setManualDays((d) => d.map((x, i) => (i === di ? { ...x, day_name: e.target.value } : x)))
                }
                placeholder="Day name (e.g. Push)"
              />
              <div className="mt-2 space-y-2">
                {day.exercises.map((ex, ei) => (
                  <div key={ei} className="grid grid-cols-[1fr_56px_72px] gap-2">
                    <input
                      className="rounded-card border border-hairline bg-graphite px-2 py-1 font-body text-sm text-chalk outline-none"
                      value={ex.name}
                      onChange={(e) =>
                        setManualDays((d) =>
                          d.map((x, i) =>
                            i === di
                              ? { ...x, exercises: x.exercises.map((y, j) => (j === ei ? { ...y, name: e.target.value } : y)) }
                              : x,
                          ),
                        )
                      }
                      placeholder="Exercise"
                    />
                    <input
                      inputMode="numeric"
                      className="rounded-card border border-hairline bg-graphite px-2 py-1 font-mono text-sm text-chalk outline-none"
                      value={ex.sets}
                      onChange={(e) =>
                        setManualDays((d) =>
                          d.map((x, i) =>
                            i === di
                              ? {
                                  ...x,
                                  exercises: x.exercises.map((y, j) =>
                                    j === ei ? { ...y, sets: parseInt(e.target.value || '0', 10) || 0 } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <input
                      className="rounded-card border border-hairline bg-graphite px-2 py-1 font-mono text-sm text-chalk outline-none"
                      value={ex.reps}
                      onChange={(e) =>
                        setManualDays((d) =>
                          d.map((x, i) =>
                            i === di
                              ? {
                                  ...x,
                                  exercises: x.exercises.map((y, j) => (j === ei ? { ...y, reps: e.target.value } : y)),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="reps"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  setManualDays((d) =>
                    d.map((x, i) =>
                      i === di ? { ...x, exercises: [...x.exercises, { name: '', sets: 1, reps: '' }] } : x,
                    ),
                  )
                }
                className="mt-2 font-mono text-xs text-rustSoft underline"
              >
                + exercise
              </button>
            </div>
          ))}
          <button
            onClick={() => setManualDays((d) => [...d, { ...EMPTY_DAY }])}
            className="font-mono text-xs text-rustSoft underline"
          >
            + day
          </button>
          <button
            onClick={() => handleConfirm('manual')}
            disabled={busy}
            className="w-full rounded-card bg-rust py-2 font-mono text-sm font-medium text-white disabled:opacity-50"
          >
            Save Plan
          </button>
        </div>
      )}

      {error && <p className="mt-3 font-mono text-xs text-rustSoft">{error}</p>}
    </div>
  );
}
