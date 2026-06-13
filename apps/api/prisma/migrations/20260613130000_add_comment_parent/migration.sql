-- Comment threading, Stage 1 — two-level (Slack-style) foundation. Fully additive:
-- a nullable self-referential column + its FK + an index. No backfill, no data
-- mutation; every existing comment gets parentCommentId = NULL (top-level "post"),
-- which is correct. On-delete CASCADE: deleting a top-level comment drops its
-- replies (mirrors CommentMention's cascade off Comment).

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "parentCommentId" TEXT;

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
