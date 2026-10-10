-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "sex" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_coach_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meal_tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onboarded_at" TIMESTAMPTZ;

-- Backfill: accounts that already exist are already using the app, so don't send
-- them through first-run onboarding. Only new sign-ups get a null onboarded_at.
UPDATE "users" SET "onboarded_at" = CURRENT_TIMESTAMP WHERE "onboarded_at" IS NULL;
