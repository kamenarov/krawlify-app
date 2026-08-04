-- AlterTable
ALTER TABLE "Crawl" ADD COLUMN     "webhookDelivered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Link" ADD COLUMN     "isBlank" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rel" TEXT,
ADD COLUMN     "target" TEXT;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "Link_crawlId_nofollow_idx" ON "Link"("crawlId", "nofollow");

-- CreateIndex
CREATE INDEX "Link_crawlId_isBlank_idx" ON "Link"("crawlId", "isBlank");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
