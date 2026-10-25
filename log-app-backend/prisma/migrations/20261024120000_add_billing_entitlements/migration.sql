-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'pro');

-- AlterTable
ALTER TABLE "users"
    ADD COLUMN "plan_tier" "PlanTier" NOT NULL DEFAULT 'free',
    ADD COLUMN "trial_ends_at" TIMESTAMPTZ,
    ADD COLUMN "pro_until" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_user_id_idx" ON "ai_usage"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_user_id_feature_period_start_key" ON "ai_usage"("user_id", "feature", "period_start");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: existing onboarded athletes start their trial from the migration, so
-- shipping the paywall does not instantly downgrade the current user base.
UPDATE "users"
SET "trial_ends_at" = now() + interval '14 days'
WHERE "onboarded_at" IS NOT NULL AND "trial_ends_at" IS NULL;
