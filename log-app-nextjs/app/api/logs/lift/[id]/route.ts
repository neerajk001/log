import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { deleteLiftLog } from '@/lib/services/liftLogs';
import { z } from 'zod';

const idParam = z.string().uuid();

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'id must be a uuid' } }, { status: 400 });
    }

    await deleteLiftLog(userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
