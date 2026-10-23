-- Deleting a plan/day triggers the plan_day_id foreign key's ON DELETE SET NULL,
-- which otherwise scans all lift history. Index the FK for those maintenance writes.
CREATE INDEX "lift_logs_plan_day_id_idx" ON "lift_logs"("plan_day_id");
