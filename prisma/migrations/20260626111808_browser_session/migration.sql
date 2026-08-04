-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "storageState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrowserSession_domain_key" ON "BrowserSession"("domain");
