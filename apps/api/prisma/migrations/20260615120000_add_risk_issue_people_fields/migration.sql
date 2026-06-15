-- AlterTable
ALTER TABLE "Risk" ADD COLUMN "assigneeId" TEXT,
                   ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "assigneeId" TEXT,
                    ADD COLUMN "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
