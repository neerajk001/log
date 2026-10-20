-- Bodyweight exercises (hanging leg raise, plank, push-ups, pull-ups, dips) have no
-- load to record. A null weight means "bodyweight set"; weighted sets are unchanged.
ALTER TABLE "lift_logs" ALTER COLUMN "weight_kg" DROP NOT NULL;
