-- pgvector (Prisma 6.16+ 권장: schema extensions 대신 migration에서 설치)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "banned_words" (
    "id" SERIAL NOT NULL,
    "word" VARCHAR(100) NOT NULL,
    "normalized_word" VARCHAR(100),
    "category" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banned_words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_words_word_key" ON "banned_words"("word");

-- CreateIndex
CREATE INDEX "banned_words_normalized_word_idx" ON "banned_words"("normalized_word");

-- CreateIndex
CREATE INDEX "banned_words_is_active_idx" ON "banned_words"("is_active");
