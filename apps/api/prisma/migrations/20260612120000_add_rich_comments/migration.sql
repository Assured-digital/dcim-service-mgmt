-- Rich comments, Phase 1 Stage 1 — schema foundation. Fully additive: a nullable
-- column + a new table. No backfill, no data mutation; existing comments keep
-- `body` and get `bodyJson` = NULL.

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "bodyJson" JSONB;

-- CreateTable
CREATE TABLE "CommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentMention_commentId_idx" ON "CommentMention"("commentId");

-- CreateIndex
CREATE INDEX "CommentMention_targetType_targetId_idx" ON "CommentMention"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
