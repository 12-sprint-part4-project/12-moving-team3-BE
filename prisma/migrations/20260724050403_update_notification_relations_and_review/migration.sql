/*
  Warnings:

  - Made the column `user_id` on table `reviews` required. This step will fail if there are existing NULL values in that column.
  - Made the column `quote_id` on table `reviews` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_quote_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_user_id_fkey";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "comment_id" INTEGER,
ADD COLUMN     "estimate_request_id" INTEGER,
ADD COLUMN     "quote_id" INTEGER,
ADD COLUMN     "review_id" INTEGER,
ADD COLUMN     "user_report_id" INTEGER;

-- AlterTable
ALTER TABLE "reviews" ALTER COLUMN "user_id" SET NOT NULL,
ALTER COLUMN "quote_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "estimate_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_report_id_fkey" FOREIGN KEY ("user_report_id") REFERENCES "user_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
