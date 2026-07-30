-- Soft-delete 후 재작성 허용: 활성 리뷰(deleted_at IS NULL)만 user_id+quote_id 유일
DROP INDEX IF EXISTS "reviews_user_id_quote_id_key";

CREATE UNIQUE INDEX "reviews_user_id_quote_id_active_unique"
ON "reviews"("user_id", "quote_id")
WHERE "deleted_at" IS NULL;
