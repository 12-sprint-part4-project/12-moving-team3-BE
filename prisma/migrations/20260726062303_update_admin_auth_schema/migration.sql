/*
  Warnings:

  - Made the column `admin_id` on table `admin_refresh_tokens` required. This step will fail if there are existing NULL values in that column.
  - Made the column `token_hash` on table `admin_refresh_tokens` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `admin_users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "admin_refresh_tokens" DROP CONSTRAINT "admin_refresh_tokens_admin_id_fkey";

-- AlterTable
ALTER TABLE "admin_refresh_tokens" ALTER COLUMN "admin_id" SET NOT NULL,
ALTER COLUMN "token_hash" SET NOT NULL;

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE INDEX "admin_refresh_tokens_admin_id_idx" ON "admin_refresh_tokens"("admin_id");

-- AddForeignKey
ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "admin_refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
