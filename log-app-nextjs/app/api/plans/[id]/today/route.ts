import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { getPlanToday } from '@/lib/services/plans';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { id } = await params;
    const result = await getPlanToday(userId, id, new Date());
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Plan not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
