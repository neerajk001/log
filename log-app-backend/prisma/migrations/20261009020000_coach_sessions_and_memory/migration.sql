-- CreateTable
CREATE TABLE "coach_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_sessions_user_id_updated_at_idx" ON "coach_sessions"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "coach_memories" (
    "user_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_memories_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "coach_memories" ADD CONSTRAINT "coach_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "coach_messages" ADD COLUMN "session_id" UUID;

-- Backfill: give each user who already has messages a single "Earlier chat" session.
WITH owned AS (
    SELECT "user_id", MIN("created_at") AS first_at, MAX("created_at") AS last_at
    FROM "coach_messages"
    GROUP BY "user_id"
), created AS (
    INSERT INTO "coach_sessions" ("id", "user_id", "title", "created_at", "updated_at")
    SELECT gen_random_uuid(), "user_id", 'Earlier chat', first_at, last_at FROM owned
    RETURNING "id", "user_id"
)
UPDATE "coach_messages" m
SET "session_id" = c."id"
FROM created c
WHERE c."user_id" = m."user_id";

-- CreateIndex
CREATE INDEX "coach_messages_session_id_created_at_idx" ON "coach_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "coach_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
