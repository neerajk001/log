import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { createLiftLog, getLiftHistory, getLiftHistoryRange } from '@/lib/services/liftLogs';
import { serializeLiftLog } from '@/lib/serialize';
import { liftLogSchema } from '@/lib/validation/schemas';

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const body = await req.json().catch(() => null);
    const parsed = liftLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const log = await createLiftLog(userId, parsed.data);
    return NextResponse.json(serializeLiftLog(log), { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { searchParams } = new URL(req.url);
    const exercise = searchParams.get('exercise');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const days = searchParams.get('days');

    if (exercise) {
      const weeks = Number(searchParams.get('weeks') ?? '4');
      const logs = await getLiftHistory(userId, exercise, weeks);
      return NextResponse.json(logs.map(serializeLiftLog));
    }

    let fromDate = from ?? undefined;
    let toDate = to ?? undefined;
    if (!fromDate && days) {
      const d = new Date();
      d.setDate(d.getDate() - Number(days));
      fromDate = d.toISOString().slice(0, 10);
    }
    if (!fromDate && !toDate) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Provide exercise, or a date range via from/to/days',
          },
        },
        { status: 400 },
      );
    }

    const logs = await getLiftHistoryRange(userId, fromDate, toDate);
    return NextResponse.json(logs.map(serializeLiftLog));
  } catch (err) {
    return toErrorResponse(err);
  }
}
