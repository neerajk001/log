import { NextResponse } from 'next/server';
import { requireUserId, toErrorResponse, ApiError } from '@/lib/error';
import { listPlans, createPlan } from '@/lib/services/plans';
import { serializePlan } from '@/lib/serialize';
import { planCreateSchema } from '@/lib/validation/schemas';

export async function GET() {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const plans = await listPlans(userId);
    return NextResponse.json(plans.map(serializePlan));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const body = await req.json().catch(() => null);
    const parsed = planCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const plan = await createPlan(userId, parsed.data);
    return NextResponse.json(serializePlan(plan), { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
