import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { computeAndStoreVerdict } from '@/lib/services/trends';

export async function GET() {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const verdict = await computeAndStoreVerdict(userId);
    return NextResponse.json(verdict);
  } catch (err) {
    return toErrorResponse(err);
  }
}
