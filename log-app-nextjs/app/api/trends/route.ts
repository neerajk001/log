import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { computeTrends } from '@/lib/services/trends';

export async function GET() {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const trends = await computeTrends(userId);
    return NextResponse.json(trends);
  } catch (err) {
    return toErrorResponse(err);
  }
}
