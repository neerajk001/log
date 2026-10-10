-- CreateIndex
CREATE INDEX "lift_logs_user_id_date_idx" ON "lift_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "workout_plans_user_id_idx" ON "workout_plans"("user_id");

-- CreateIndex
CREATE INDEX "plan_days_plan_id_idx" ON "plan_days"("plan_id");
