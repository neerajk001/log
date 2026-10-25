-- CreateTable
CREATE TABLE "physique_checkins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "week_start_date" DATE NOT NULL,
    "mime_type" TEXT NOT NULL,
    "image_ciphertext" BYTEA NOT NULL,
    "image_iv" BYTEA NOT NULL,
    "image_tag" BYTEA NOT NULL,
    "image_bytes" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "previous_checkin_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physique_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "physique_checkins_user_id_week_start_date_key" ON "physique_checkins"("user_id", "week_start_date");

-- CreateIndex
CREATE INDEX "physique_checkins_user_id_date_idx" ON "physique_checkins"("user_id", "date");

-- CreateIndex
CREATE INDEX "physique_checkins_previous_checkin_id_idx" ON "physique_checkins"("previous_checkin_id");

-- AddForeignKey
ALTER TABLE "physique_checkins" ADD CONSTRAINT "physique_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physique_checkins" ADD CONSTRAINT "physique_checkins_previous_checkin_id_fkey" FOREIGN KEY ("previous_checkin_id") REFERENCES "physique_checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
