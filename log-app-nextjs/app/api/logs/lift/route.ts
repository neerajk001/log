import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { createLiftLog, getLiftHistory } from '@/lib/services/liftLogs';
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
    const weeks = Number(searchParams.get('weeks') ?? '4');

    if (!exercise) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'exercise query param is required' } },
        { status: 400 },
      );
    }

    const logs = await getLiftHistory(userId, exercise, weeks);
    return NextResponse.json(logs.map(serializeLiftLog));
  } catch (err) {
    return toErrorResponse(err);
  }
}
