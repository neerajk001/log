import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { getDailyLogsInRange } from '@/lib/services/dailyLogs';
import { serializeDailyLog } from '@/lib/serialize';
import { rangeQuerySchema } from '@/lib/validation/schemas';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { searchParams } = new URL(req.url);
    const parsed = rangeQuerySchema.safeParse({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const logs = await getDailyLogsInRange(userId, parsed.data.from, parsed.data.to);
    return NextResponse.json(logs.map(serializeDailyLog));
  } catch (err) {
    return toErrorResponse(err);
  }
}
