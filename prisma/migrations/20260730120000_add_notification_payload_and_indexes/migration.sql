-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "payload" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "notifications_receiver_id_created_at_idx" ON "notifications"("receiver_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_receiver_id_is_read_idx" ON "notifications"("receiver_id", "is_read");
