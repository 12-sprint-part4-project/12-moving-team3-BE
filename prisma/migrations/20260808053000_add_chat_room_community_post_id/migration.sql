-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN "community_post_id" INTEGER;

-- CreateIndex
CREATE INDEX "chat_rooms_community_post_id_idx" ON "chat_rooms"("community_post_id");

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_community_post_id_fkey" FOREIGN KEY ("community_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
