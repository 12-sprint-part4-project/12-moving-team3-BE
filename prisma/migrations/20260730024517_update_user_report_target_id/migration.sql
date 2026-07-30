/*
  Warnings:

  - A unique constraint covering the columns `[reporter_id,target,target_id]` on the table `user_reports` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_reports" ALTER COLUMN "target_id" SET DATA TYPE VARCHAR(36);

-- CreateIndex
CREATE UNIQUE INDEX "user_reports_reporter_id_target_target_id_key" ON "user_reports"("reporter_id", "target", "target_id");
