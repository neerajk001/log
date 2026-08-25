import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId, toErrorResponse, ApiError } from '@/lib/error';
import { updatePlan } from '@/lib/services/plans';
import { serializePlan } from '@/lib/serialize';
import { planCreateSchema } from '@/lib/validation/schemas';

const idParam = z.string().uuid();

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      throw new ApiError('VALIDATION_ERROR', 'id must be a uuid', 400);
    }

    const body = await req.json().catch(() => null);
    const parsed = planCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const plan = await updatePlan(userId, id, parsed.data);
    return NextResponse.json(serializePlan(plan));
  } catch (err) {
    return toErrorResponse(err);
  }
}
