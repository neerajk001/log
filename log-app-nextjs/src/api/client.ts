import type { ApiErrorInfo, UserProfile, DailyLog, LiftLog, Plan, PlanDay, PlanExercise, PlanToday, TrendsResult, VerdictResult } from './types';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(info: ApiErrorInfo, status: number) {
    super(info.message);
    this.code = info.code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = body?.error ?? { code: 'ERROR', message: res.statusText };
    throw new ApiError(err, res.status);
  }
  return body as T;
}

export const api = {
  getMe: () => request<UserProfile>('/me', { method: 'GET' }),
  updateMe: (
    patch: Partial<
      Pick<UserProfile, 'protein_target_g' | 'calorie_target' | 'daily_defaults'>
    >,
  ) => request<UserProfile>('/me', { method: 'PUT', body: JSON.stringify(patch) }),

  getDailyLog: (date: string) => request<DailyLog | null>(`/logs/daily/${date}`, { method: 'GET' }),
  getDailyLogs: (from: string, to: string) =>
    request<DailyLog[]>(`/logs/daily?from=${from}&to=${to}`, { method: 'GET' }),
  upsertDailyLog: (date: string, patch: Record<string, number>) =>
    request<DailyLog>(`/logs/daily/${date}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteDailyLog: (date: string) =>
    request<{ ok: true }>(`/logs/daily/${date}`, { method: 'DELETE' }),

  createLiftLog: (input: {
    date: string;
    exercise_name: string;
    weight_kg: number;
    reps: number;
    plan_day_id?: string | null;
  }) => request<LiftLog>('/logs/lift', { method: 'POST', body: JSON.stringify(input) }),
  getLiftHistory: (exercise: string, weeks = 4) =>
    request<LiftLog[]>(`/logs/lift?exercise=${encodeURIComponent(exercise)}&weeks=${weeks}`, { method: 'GET' }),
  getLiftLogsRange: (from: string, to: string) =>
    request<LiftLog[]>(`/logs/lift?from=${from}&to=${to}`, { method: 'GET' }),
  deleteLiftLog: (id: string) =>
    request<{ ok: true }>(`/logs/lift/${id}`, { method: 'DELETE' }),

  listPlans: () => request<Plan[]>('/plans', { method: 'GET' }),
  createPlan: (input: { name: string; source: 'manual' | 'ai_parsed'; days: { day_name: string; exercises: PlanExercise[] }[] }) =>
    request<Plan>('/plans', { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (
    id: string,
    input: { name: string; source: 'manual' | 'ai_parsed'; days: { day_name: string; exercises: PlanExercise[] }[] },
  ) => request<Plan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  parsePlan: (payload: { text?: string; file?: File }) => {
    if (payload.file) {
      const fd = new FormData();
      fd.append('file', payload.file);
      if (payload.text) fd.append('text', payload.text);
      return request<{ days: PlanDay[] }>('/plans/parse', { method: 'POST', body: fd });
    }
    return request<{ days: PlanDay[] }>('/plans/parse', {
      method: 'POST',
      body: JSON.stringify({ text: payload.text ?? '' }),
    });
  },
  getPlanToday: (planId: string) => request<PlanToday>(`/plans/${planId}/today`, { method: 'GET' }),

  getTrends: () => request<TrendsResult>('/trends', { method: 'GET' }),
  getWeeklyVerdict: () => request<VerdictResult>('/verdict/weekly', { method: 'GET' }),
};
