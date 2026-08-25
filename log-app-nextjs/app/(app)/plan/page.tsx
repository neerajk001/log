'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/src/api/client';
import type { Plan, PlanDay, PlanExercise } from '@/src/api/types';

const EMPTY_DAY = { day_name: '', exercises: [{ name: '', sets: 1, reps: '' }] };

const MUSCLE_GROUP_HINTS: Array<{ pattern: RegExp; groups: string[] }> = [
  { pattern: /\bpush\b/i, groups: ['Chest', 'Shoulders', 'Triceps'] },
  { pattern: /\bpull\b/i, groups: ['Back', 'Biceps'] },
  { pattern: /\blegs?\b/i, groups: ['Quads', 'Hamstrings', 'Glutes', 'Calves'] },
  { pattern: /\bupper\b/i, groups: ['Chest', 'Back', 'Shoulders', 'Arms'] },
  { pattern: /\blower\b/i, groups: ['Quads', 'Hamstrings', 'Glutes', 'Calves'] },
  { pattern: /chest|bench/i, groups: ['Chest', 'Triceps'] },
  { pattern: /back|row|pulldown/i, groups: ['Back', 'Biceps'] },
  { pattern: /shoulder|press|delt/i, groups: ['Shoulders', 'Triceps'] },
  { pattern: /arm|bicep|tricep|curl/i, groups: ['Arms'] },
  { pattern: /core|ab/i, groups: ['Core'] },
];

function inferMuscleGroups(dayName: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { pattern, groups } of MUSCLE_GROUP_HINTS) {
    if (pattern.test(dayName)) {
      for (const g of groups) {
        if (!seen.has(g)) {
          seen.add(g);
          out.push(g);
        }
      }
    }
  }
  return out;
}

export default function PlanPage() {
  const [view, setView] = useState<'library' | 'edit'>('library');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // library
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [libError, setLibError] = useState<string | null>(null);

  // edit
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<PlanDay[] | null>(null);
  const [planName, setPlanName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualDays, setManualDays] = useState<{ day_name: string; exercises: PlanExercise[] }[]>([
    { ...EMPTY_DAY },
  ]);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setLibError(null);
    try {
      const list = await api.listPlans();
      setPlans(list);
    } catch (e) {
      setLibError(e instanceof ApiError ? e.message : 'Failed to load plans');
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'library') loadPlans();
  }, [view, loadPlans]);

  const activePlan = plans.find((p) => p.is_active) ?? plans[0] ?? null;

  function startEdit() {
    setEditingPlanId(null);
    setText('');
    setFile(null);
    setDraft(null);
    setPlanName(activePlan?.name ?? '');
    setParseError(null);
    setError(null);
    setManualDays([{ ...EMPTY_DAY }]);
    setMode('ai');
    setView('edit');
  }

  function startEditExisting() {
    if (!activePlan) return;
    setEditingPlanId(activePlan.id);
    setText('');
    setFile(null);
    setDraft(null);
    setPlanName(activePlan.name);
    setParseError(null);
    setError(null);
    setManualDays(
      activePlan.days.map((d) => ({
        day_name: d.day_name,
        exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
      })),
    );
    setMode('manual');
    setView('edit');
  }

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
      if (editingPlanId) {
        await api.updatePlan(editingPlanId, {
          name: planName || 'My Plan',
          source: (activePlan?.source ?? 'manual') as 'manual' | 'ai_parsed',
          days,
        });
      } else {
        await api.createPlan({ name: planName || 'My Plan', source, days });
      }
      setEditingPlanId(null);
      setView('library');
      await loadPlans();
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

      {view === 'library' && (
        <>
          <div className="mt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
              Your training program
            </div>

            {plansLoading && plans.length === 0 ? (
              <p className="mt-2 font-mono text-sm text-steel">Loading plans…</p>
            ) : libError ? (
              <p className="mt-2 font-mono text-sm text-rustSoft">{libError}</p>
            ) : !activePlan ? (
              <div className="mt-2 rounded-card border border-hairline bg-surface p-6 text-center">
                <p className="font-body text-chalk">No plan yet</p>
                <p className="mt-1 font-mono text-xs text-steel">
                  Import or build a workout plan to see it here.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-2 rounded-card border border-hairline bg-surface p-4">
                  <div className="font-body text-chalk">{activePlan.name}</div>
                  <div className="font-mono text-xs text-chalkDim">
                    {activePlan.days.length} workout{activePlan.days.length === 1 ? ' day' : ' days'} ·{' '}
                    {activePlan.source === 'ai_parsed' ? 'AI parsed' : 'Manual'}
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  {activePlan.days.map((day) => {
                    const isOpen = openDayId === day.id;
                    const groups = inferMuscleGroups(day.day_name);
                    return (
                      <div key={day.id} className="rounded-card border border-hairline bg-surface">
                        <button
                          type="button"
                          onClick={() => setOpenDayId(isOpen ? null : day.id)}
                          className="flex w-full items-center justify-between p-4 text-left"
                        >
                          <div>
                            <div className="font-body text-chalk">{day.day_name}</div>
                            <div className="font-mono text-xs text-chalkDim">
                              {groups.length > 0
                                ? groups.join(' · ')
                                : `${day.exercises.length} exercises`}
                            </div>
                          </div>
                          <span className="font-mono text-lg text-rustSoft">{isOpen ? '−' : '+'}</span>
                        </button>
                        {isOpen && (
                          <div className="space-y-1 border-t border-hairline px-4 py-3">
                            {day.exercises.length === 0 ? (
                              <p className="font-mono text-xs text-steel">No exercises yet.</p>
                            ) : (
                              day.exercises.map((ex, i) => (
                                <div key={i} className="flex items-center justify-between">
                                  <span className="font-body text-sm text-chalk">{ex.name}</span>
                                  <span className="font-mono text-sm text-chalkDim">
                                    {ex.sets} × {ex.reps}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="mt-5 space-y-2">
            {activePlan && (
              <button
                type="button"
                onClick={startEditExisting}
                className="w-full rounded-card bg-rust py-3 font-mono text-sm font-medium text-white"
              >
                Edit plan
              </button>
            )}
            <button
              type="button"
              onClick={startEdit}
              className="w-full rounded-card border border-hairline py-3 font-mono text-sm text-chalk"
            >
              {activePlan ? 'Replace plan' : 'Add a plan'}
            </button>
            {activePlan && (
              <Link
                href="/lift"
                className="block text-center font-mono text-xs text-rustSoft underline"
              >
                Jump to today&apos;s workout →
              </Link>
            )}
          </div>
        </>
      )}

      {view === 'edit' && (
        <>
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
                              onChange={(e) =>
                                updateDraftExercise(di, ei, { name: e.target.value })
                              }
                            />
                            <input
                              inputMode="numeric"
                              className="rounded-card border border-hairline bg-graphite px-2 py-1 font-mono text-sm text-chalk outline-none"
                              value={ex.sets}
                              onChange={(e) =>
                                updateDraftExercise(di, ei, {
                                  sets: parseInt(e.target.value || '0', 10) || 0,
                                })
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
                      setManualDays((d) =>
                        d.map((x, i) => (i === di ? { ...x, day_name: e.target.value } : x)),
                      )
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
                                  ? {
                                      ...x,
                                      exercises: x.exercises.map((y, j) =>
                                        j === ei ? { ...y, name: e.target.value } : y,
                                      ),
                                    }
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
                                        j === ei
                                          ? { ...y, sets: parseInt(e.target.value || '0', 10) || 0 }
                                          : y,
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
                                      exercises: x.exercises.map((y, j) =>
                                        j === ei ? { ...y, reps: e.target.value } : y,
                                      ),
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

          <button
            type="button"
            onClick={() => {
              setEditingPlanId(null);
              setView('library');
            }}
            className="mx-auto mt-3 block font-mono text-xs text-chalkDim underline"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
