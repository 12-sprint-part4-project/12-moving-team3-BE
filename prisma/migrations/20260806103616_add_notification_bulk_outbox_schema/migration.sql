-- CreateEnum
CREATE TYPE "NotificationOutboxJobType" AS ENUM (
  'NEW_QUOTE_REQUEST_FANOUT',
  'ADMIN_NOTICE_FANOUT'
);

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DONE',
  'FAILED'
);

-- AlterTable: 대량 fan-out 멱등 키 (null = 기존 단건 알림)
ALTER TABLE "notifications" ADD COLUMN "source_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "notification_outbox" (
  "id" SERIAL NOT NULL,
  "job_type" "NotificationOutboxJobType" NOT NULL,
  "source_id" VARCHAR(64) NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "cursor_user_id" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(1000),
  "snapshot_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: source_id 있는 알림만 (receiver, type, source) 유일
CREATE UNIQUE INDEX "notifications_receiver_type_source_unique"
ON "notifications"("receiver_id", "type", "source_id")
WHERE "source_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_job_type_source_id_key"
ON "notification_outbox"("job_type", "source_id");

-- CreateIndex
CREATE INDEX "notification_outbox_status_updated_at_idx"
ON "notification_outbox"("status", "updated_at");
