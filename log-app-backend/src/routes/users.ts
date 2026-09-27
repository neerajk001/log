import { Prisma } from "@prisma/client";
import { Router, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { updateMeSchema } from "../validation/schemas";
import { prisma } from "../db/client";

const router = Router();

router.get("/me", requireAuth, async (req, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, proteinTargetG: true, calorieTarget: true, dailyDefaults: true },
  });

  if (!user) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Account not found. Please sign in again." },
    });
    return;
  }

  res.json({
    id: user.id,
    protein_target_g: user.proteinTargetG,
    calorie_target: user.calorieTarget,
    daily_defaults: (user.dailyDefaults as Record<string, number> | null) ?? null,
  });
});

router.put("/me", requireAuth, validate(updateMeSchema), async (req, res: Response) => {
  const { protein_target_g, calorie_target, daily_defaults } = req.body;

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
    },
    select: { id: true, proteinTargetG: true, calorieTarget: true, dailyDefaults: true },
  });

  res.json({
    id: user.id,
    protein_target_g: user.proteinTargetG,
    calorie_target: user.calorieTarget,
    daily_defaults: (user.dailyDefaults as Record<string, number> | null) ?? null,
  });
});

export default router;
