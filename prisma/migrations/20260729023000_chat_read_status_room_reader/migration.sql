-- AlterTable: room 단위 마지막 읽음 위치로 전환
ALTER TABLE "chat_read_statuses" ADD COLUMN "room_id" INTEGER;
ALTER TABLE "chat_read_statuses" ADD COLUMN "last_read_message_id" INTEGER;

-- Backfill: 기존 message_id 기준으로 room_id / last_read_message_id 채움
UPDATE "chat_read_statuses" AS crs
SET
  "room_id" = cm."room_id",
  "last_read_message_id" = cm."id"
FROM "chat_messages" AS cm
WHERE crs."message_id" = cm."id";

-- 대응 메시지가 없는 고아 읽음 상태 정리 (NOT NULL 설정 전 필수)
DELETE FROM "chat_read_statuses"
WHERE "room_id" IS NULL OR "last_read_message_id" IS NULL;

-- 방-참여자별 최대 messageId만 남기고 중복 제거
DELETE FROM "chat_read_statuses" AS older
USING "chat_read_statuses" AS newer
WHERE older."room_id" = newer."room_id"
  AND older."reader_id" = newer."reader_id"
  AND older."last_read_message_id" < newer."last_read_message_id";

DELETE FROM "chat_read_statuses" AS older
USING "chat_read_statuses" AS newer
WHERE older."room_id" = newer."room_id"
  AND older."reader_id" = newer."reader_id"
  AND older."id" > newer."id";

-- DropIndex / DropForeignKey (이전 messageId+readerId 모델)
DROP INDEX IF EXISTS "chat_read_statuses_message_id_reader_id_key";
ALTER TABLE "chat_read_statuses" DROP CONSTRAINT IF EXISTS "chat_read_statuses_message_id_fkey";

-- DropColumn
ALTER TABLE "chat_read_statuses" DROP COLUMN "message_id";

-- SetNotNull
ALTER TABLE "chat_read_statuses" ALTER COLUMN "room_id" SET NOT NULL;
ALTER TABLE "chat_read_statuses" ALTER COLUMN "last_read_message_id" SET NOT NULL;

-- CreateIndex / AddForeignKey
CREATE UNIQUE INDEX "chat_read_statuses_room_id_reader_id_key" ON "chat_read_statuses"("room_id", "reader_id");

ALTER TABLE "chat_read_statuses" ADD CONSTRAINT "chat_read_statuses_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_read_statuses" ADD CONSTRAINT "chat_read_statuses_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
