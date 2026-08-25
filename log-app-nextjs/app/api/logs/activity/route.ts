import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId, toErrorResponse, ApiError } from '@/lib/error';
import { createActivityLog, getActivityLogs } from '@/lib/services/activityLogs';
import { serializeActivityLog } from '@/lib/serialize';
import { activityLogSchema, rangeQuerySchema } from '@/lib/validation/schemas';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { searchParams } = new URL(req.url);
    const range = rangeQuerySchema.safeParse({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });
    if (!range.success) throw new ApiError('VALIDATION_ERROR', range.error.issues[0].message, 400);

    const to = range.data.to ?? new Date().toISOString().slice(0, 10);
    const from = range.data.from ?? to;
    const logs = await getActivityLogs(userId, from, to);
    return NextResponse.json(logs.map(serializeActivityLog));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const body = await req.json().catch(() => null);
    const parsed = activityLogSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const log = await createActivityLog(userId, parsed.data);
    return NextResponse.json(serializeActivityLog(log), { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
