-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "workTypeId" TEXT,
    "userId" TEXT,
    "hours" DECIMAL(8,2) NOT NULL,
    "chfPerHour" DECIMAL(8,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "workTypeId" TEXT,
    "userId" TEXT,
    "chfPerHour" DECIMAL(8,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Rate_customerId_workTypeId_userId_idx" ON "Rate"("customerId", "workTypeId", "userId");

-- CreateIndex
CREATE INDEX "Rate_validFrom_validTo_idx" ON "Rate"("validFrom", "validTo");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "WorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "WorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed global fallback rate (selling price)
INSERT INTO "Rate" ("id", "customerId", "workTypeId", "userId", "chfPerHour", "validFrom", "validTo", "createdAt")
VALUES (
  'seed_global_rate_70',
  NULL,
  NULL,
  NULL,
  70.00,
  TIMESTAMPTZ '2020-01-01 00:00:00+00',
  NULL,
  CURRENT_TIMESTAMP
);

-- Backfill InvoiceLine at CHF 70.00 from existing linked entries (grouped by invoice/workType/user)
INSERT INTO "InvoiceLine" ("id", "invoiceId", "workTypeId", "userId", "hours", "chfPerHour", "total")
SELECT
  gen_random_uuid()::text,
  te."invoiceId",
  te."workTypeId",
  te."userId",
  ROUND(SUM(
    CASE
      WHEN te."hours" IS NOT NULL THEN te."hours"::numeric
      ELSE ((te."toMinutes" - te."fromMinutes" - te."breakMinutes")::numeric / 60)
    END
  ), 2),
  70.00,
  ROUND(SUM(
    CASE
      WHEN te."hours" IS NOT NULL THEN te."hours"::numeric
      ELSE ((te."toMinutes" - te."fromMinutes" - te."breakMinutes")::numeric / 60)
    END
  ) * 70.00, 2)
FROM "TimeEntry" te
WHERE te."invoiceId" IS NOT NULL
GROUP BY te."invoiceId", te."workTypeId", te."userId";
