import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse, ApiError } from '@/lib/error';
import { upsertDailyLog, getDailyLog, deleteDailyLog } from '@/lib/services/dailyLogs';
import { serializeDailyLog } from '@/lib/serialize';
import { dailyLogSchema } from '@/lib/validation/schemas';
import { z } from 'zod';

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { date } = await params;
    if (!dateParam.safeParse(date).success) {
      throw new ApiError('VALIDATION_ERROR', 'date must be YYYY-MM-DD', 400);
    }

    const log = await getDailyLog(userId, date);
    if (!log) return NextResponse.json(null);
    return NextResponse.json(serializeDailyLog(log));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { date } = await params;
    if (!dateParam.safeParse(date).success) {
      throw new ApiError('VALIDATION_ERROR', 'date must be YYYY-MM-DD', 400);
    }

    const body = await req.json().catch(() => null);
    const parsed = dailyLogSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const log = await upsertDailyLog(userId, date, parsed.data);
    return NextResponse.json(serializeDailyLog(log));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { date } = await params;
    if (!dateParam.safeParse(date).success) {
      throw new ApiError('VALIDATION_ERROR', 'date must be YYYY-MM-DD', 400);
    }

    await deleteDailyLog(userId, date);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
