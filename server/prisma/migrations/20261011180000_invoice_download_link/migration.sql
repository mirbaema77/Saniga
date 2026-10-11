-- CreateTable
CREATE TABLE "InvoiceDownloadLink" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDownloadLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDownloadLink_key_key" ON "InvoiceDownloadLink"("key");

-- CreateIndex
CREATE INDEX "InvoiceDownloadLink_invoiceId_idx" ON "InvoiceDownloadLink"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceDownloadLink_expiresAt_idx" ON "InvoiceDownloadLink"("expiresAt");

-- AddForeignKey
ALTER TABLE "InvoiceDownloadLink" ADD CONSTRAINT "InvoiceDownloadLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
