import { Router, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { updateMeSchema } from "../validation/schemas";
import { prisma } from "../db/client";

const router = Router();

router.get("/me", requireAuth, async (req, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId },
    select: { id: true, proteinTargetG: true, calorieTarget: true },
  });

  res.json({
    id: user.id,
    protein_target_g: user.proteinTargetG,
    calorie_target: user.calorieTarget,
  });
});

router.put("/me", requireAuth, validate(updateMeSchema), async (req, res: Response) => {
  const { protein_target_g, calorie_target } = req.body;

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      proteinTargetG: protein_target_g,
      calorieTarget: calorie_target,
    },
    select: { id: true, proteinTargetG: true, calorieTarget: true },
  });

  res.json({
    id: user.id,
    protein_target_g: user.proteinTargetG,
    calorie_target: user.calorieTarget,
  });
});

export default router;
