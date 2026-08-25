import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireUserId, toErrorResponse, ApiError } from '@/lib/error';
import { prisma } from '@/lib/db/client';
import { serializeUser } from '@/lib/serialize';
import { meUpdateSchema } from '@/lib/validation/schemas';

export async function GET() {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError('NOT_FOUND', 'User not found', 404);
    return NextResponse.json(serializeUser(user));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const body = await req.json().catch(() => null);
    const parsed = meUpdateSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        proteinTargetG: parsed.data.protein_target_g,
        calorieTarget: parsed.data.calorie_target,
        dailyDefaults:
          parsed.data.daily_defaults === undefined
            ? undefined
            : parsed.data.daily_defaults === null
              ? Prisma.JsonNull
              : parsed.data.daily_defaults,
      },
    });
    return NextResponse.json(serializeUser(user));
  } catch (err) {
    return toErrorResponse(err);
  }
}
