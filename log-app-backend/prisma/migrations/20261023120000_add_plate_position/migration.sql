-- Machine exercises are loaded by a numbered stack position, not free weights.
-- A plate set keeps weight_kg null and records the position plus a snapshot of the
-- plan's calibration so existing history survives later plan edits.
ALTER TABLE "lift_logs" ADD COLUMN "plate_position" INTEGER;
ALTER TABLE "lift_logs" ADD COLUMN "plate_increment" DECIMAL(6, 2);
ALTER TABLE "lift_logs" ADD COLUMN "plate_unit" TEXT;
