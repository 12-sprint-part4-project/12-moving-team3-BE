-- CreateIndex
CREATE INDEX "posts_deleted_at_category_created_at_id_idx" ON "posts"("deleted_at", "category", "created_at", "id");
