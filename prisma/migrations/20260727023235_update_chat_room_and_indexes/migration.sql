/*
  Warnings:

  - Added the required column `updated_at` to the `chat_rooms` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "chat_messages_room_id_id_idx" ON "chat_messages"("room_id", "id");

-- CreateIndex
CREATE INDEX "chat_room_participants_participant_id_left_at_idx" ON "chat_room_participants"("participant_id", "left_at");

CREATE UNIQUE INDEX "chat_room_participants_active_unique" ON "chat_room_participants" ("room_id", "participant_id") WHERE "left_at" IS NULL;