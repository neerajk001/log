-- CreateTable
CREATE TABLE "coach_decisions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "topic" TEXT,
    "review_on" DATE,
    "outcome" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_decisions_user_id_created_at_idx" ON "coach_decisions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "coach_decisions" ADD CONSTRAINT "coach_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
