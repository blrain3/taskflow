-- DropIndex
DROP INDEX "Issue_workspaceId_status_idx";

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Issue_workspaceId_status_position_idx" ON "Issue"("workspaceId", "status", "position");

