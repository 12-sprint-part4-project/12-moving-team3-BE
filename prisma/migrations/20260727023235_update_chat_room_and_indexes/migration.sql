-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "chat_rooms" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "chat_rooms" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "chat_messages_room_id_id_idx" ON "chat_messages"("room_id", "id");

-- CreateIndex
CREATE INDEX "chat_room_participants_participant_id_left_at_idx" ON "chat_room_participants"("participant_id", "left_at");

-- Cleanup: partial unique index 생성 전 중복 활성 참여자 정리
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY room_id, participant_id
           ORDER BY joined_at DESC
         ) AS rn
  FROM chat_room_participants
  WHERE left_at IS NULL
)
UPDATE chat_room_participants
SET left_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- CreatePartialUniqueIndex (Prisma 문법으로 표현 불가하여 수동 추가)
CREATE UNIQUE INDEX "chat_room_participants_active_unique"
ON "chat_room_participants" ("room_id", "participant_id")
WHERE "left_at" IS NULL;