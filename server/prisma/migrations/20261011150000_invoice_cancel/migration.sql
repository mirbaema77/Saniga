-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledReason" TEXT;
