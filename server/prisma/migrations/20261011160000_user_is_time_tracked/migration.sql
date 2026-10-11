-- AlterTable
ALTER TABLE "User" ADD COLUMN "isTimeTracked" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "User_isTimeTracked_idx" ON "User"("isTimeTracked");
