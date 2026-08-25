-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "protein_target_g" INTEGER,
    "calorie_target" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2),
    "calories" INTEGER,
    "protein_g" INTEGER,
    "sleep_hours" DECIMAL(3,1),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lift_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "exercise_name" TEXT NOT NULL,
    "weight_kg" DECIMAL(6,2) NOT NULL,
    "reps" INTEGER NOT NULL,
    "plan_day_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lift_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_days" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day_name" TEXT NOT NULL,
    "day_order" INTEGER NOT NULL,
    "exercises" JSONB NOT NULL,

    CONSTRAINT "plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_verdicts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_start_date" DATE NOT NULL,
    "verdict" TEXT NOT NULL,
    "weight_trend_kg_per_week" DECIMAL(4,2),
    "strength_trend" TEXT,
    "adherence_pct" INTEGER,
    "reasoning" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_user_id_date_key" ON "daily_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "lift_logs_user_id_exercise_name_date_idx" ON "lift_logs"("user_id", "exercise_name", "date");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_verdicts_user_id_week_start_date_key" ON "weekly_verdicts"("user_id", "week_start_date");

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_logs" ADD CONSTRAINT "lift_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_logs" ADD CONSTRAINT "lift_logs_plan_day_id_fkey" FOREIGN KEY ("plan_day_id") REFERENCES "plan_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "workout_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_verdicts" ADD CONSTRAINT "weekly_verdicts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
