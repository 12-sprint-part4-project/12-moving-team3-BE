-- pgvector는 banned_words 마이그레이션에서 이미 설치됨. 재실행 안전하게 IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "mover_profiles" ADD COLUMN "embedding" vector(1536);
