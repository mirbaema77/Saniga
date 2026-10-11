-- AlterTable Customer: structured address
ALTER TABLE "Customer" ADD COLUMN "street" TEXT;
ALTER TABLE "Customer" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "Customer" ADD COLUMN "paymentTermDays" INTEGER NOT NULL DEFAULT 14;

UPDATE "Customer" SET "street" = "address" WHERE "address" IS NOT NULL;

ALTER TABLE "Customer" DROP COLUMN "address";

-- CreateTable Company (single-row settings)
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "uid" TEXT,
    "vatRate" DECIMAL(4,2) NOT NULL DEFAULT 8.10,
    "invoiceStartNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Company" ("id", "name", "street", "postalCode", "city", "uid", "vatRate", "invoiceStartNumber", "updatedAt")
VALUES (
  'default',
  'Saniga AG',
  'Wässeristrasse 25',
  '8340',
  'Hinwil',
  'CHE-298.414.455',
  8.10,
  1,
  CURRENT_TIMESTAMP
);
