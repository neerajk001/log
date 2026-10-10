import { Prisma } from "@prisma/client";
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { onboardingSchema, updateMeSchema, type OnboardingInput } from "../validation/schemas";
import { prisma } from "../db/client";

const router = Router();

const userSelect = {
  id: true,
  proteinTargetG: true,
  calorieTarget: true,
  dailyDefaults: true,
  restDays: true,
  mealTrackingEnabled: true,
  aiCoachEnabled: true,
  onboardedAt: true,
} satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function serializeUser(user: SelectedUser) {
  return {
    id: user.id,
    protein_target_g: user.proteinTargetG,
    calorie_target: user.calorieTarget,
    daily_defaults: (user.dailyDefaults as Record<string, number> | null) ?? null,
    rest_days: (user.restDays as number[] | null) ?? null,
    meal_tracking_enabled: user.mealTrackingEnabled,
    ai_coach_enabled: user.aiCoachEnabled,
    onboarded_at: user.onboardedAt ? user.onboardedAt.toISOString() : null,
  };
}

router.get("/me", requireAuth, async (req, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: userSelect,
  });

  if (!user) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Account not found. Please sign in again." },
    });
    return;
  }

  res.json(serializeUser(user));
});

router.put("/me", requireAuth, validate(updateMeSchema), async (req, res: Response) => {
  const {
    protein_target_g,
    calorie_target,
    daily_defaults,
    rest_days,
    meal_tracking_enabled,
    ai_coach_enabled,
    onboarded,
  } = req.body;

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      proteinTargetG: protein_target_g,
      calorieTarget: calorie_target,
      dailyDefaults:
        daily_defaults === undefined
          ? undefined
          : daily_defaults === null
            ? Prisma.JsonNull
            : daily_defaults,
      restDays:
        rest_days === undefined ? undefined : rest_days === null ? Prisma.JsonNull : rest_days,
      mealTrackingEnabled: meal_tracking_enabled,
      aiCoachEnabled: ai_coach_enabled,
      onboardedAt: onboarded === undefined ? undefined : onboarded ? new Date() : null,
    },
    select: userSelect,
  });

  res.json(serializeUser(user));
});

/**
 * Commits first-run onboarding in one transaction: the coach profile answers
 * plus the user's preferences, and marks the account onboarded. Only fields the
 * client actually sent are written, so a partial payload never clobbers data.
 */
router.post(
  "/me/onboarding",
  requireAuth,
  validate(onboardingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const d = req.body as OnboardingInput;

      const profileData: Prisma.CoachProfileUncheckedUpdateInput = {};
      if (d.goal !== undefined) profileData.goal = d.goal;
      if (d.sex !== undefined) profileData.sex = d.sex;
      if (d.age !== undefined) profileData.age = d.age;
      if (d.height_cm !== undefined) profileData.heightCm = d.height_cm;
      if (d.weight_kg !== undefined) profileData.weightKg = d.weight_kg;
      if (d.target_weight_kg !== undefined) profileData.targetWeightKg = d.target_weight_kg;
      if (d.experience !== undefined) profileData.experience = d.experience;
      if (d.days_per_week !== undefined) profileData.daysPerWeek = d.days_per_week;

      const [user] = await prisma.$transaction([
        prisma.user.update({
          where: { id: req.userId },
          data: {
            restDays:
              d.rest_days === undefined
                ? undefined
                : d.rest_days === null
                  ? Prisma.JsonNull
                  : d.rest_days,
            mealTrackingEnabled: d.meal_tracking_enabled,
            aiCoachEnabled: d.ai_coach_enabled,
            onboardedAt: new Date(),
          },
          select: userSelect,
        }),
        prisma.coachProfile.upsert({
          where: { userId: req.userId },
          create: {
            ...(profileData as Prisma.CoachProfileUncheckedCreateInput),
            userId: req.userId,
          },
          update: profileData,
        }),
      ]);

      res.json(serializeUser(user));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
