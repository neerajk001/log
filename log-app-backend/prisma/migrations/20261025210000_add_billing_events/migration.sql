-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL,
    "revenuecat_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "app_user_id" TEXT,
    "user_id" UUID,
    "environment" TEXT,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_revenuecat_event_id_key" ON "billing_events"("revenuecat_event_id");

-- CreateIndex
CREATE INDEX "billing_events_user_id_created_at_idx" ON "billing_events"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
