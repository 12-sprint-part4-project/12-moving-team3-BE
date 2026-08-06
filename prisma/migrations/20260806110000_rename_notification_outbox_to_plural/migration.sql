-- 팀 테이블 네이밍(복수)에 맞춤. 이미 apply된 생성 migration은 수정하지 않고 rename만 추가.
ALTER TABLE "notification_outbox" RENAME TO "notification_outboxes";

ALTER INDEX "notification_outbox_pkey" RENAME TO "notification_outboxes_pkey";
ALTER INDEX "notification_outbox_job_type_source_id_key" RENAME TO "notification_outboxes_job_type_source_id_key";
ALTER INDEX "notification_outbox_status_updated_at_idx" RENAME TO "notification_outboxes_status_updated_at_idx";
