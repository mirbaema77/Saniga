-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "absenceGroupId" TEXT;

-- CreateIndex
CREATE INDEX "TimeEntry_absenceGroupId_idx" ON "TimeEntry"("absenceGroupId");
