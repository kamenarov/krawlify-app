-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('queued', 'running', 'paused', 'done', 'failed', 'stopped');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('img', 'script', 'stylesheet', 'api', 'other');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crawl" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seedUrl" TEXT NOT NULL,
    "rootHost" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'queued',
    "config" JSONB NOT NULL,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalCrawled" INTEGER NOT NULL DEFAULT 0,
    "byStatusClass" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Crawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "statusCode" INTEGER,
    "statusClass" INTEGER NOT NULL DEFAULT 0,
    "contentType" TEXT,
    "responseTimeMs" INTEGER,
    "sizeBytes" INTEGER,
    "indexability" TEXT,
    "indexabilityReason" TEXT,
    "title" TEXT,
    "titleLength" INTEGER,
    "titlePixelWidth" INTEGER,
    "titleHash" TEXT,
    "titleCount" INTEGER NOT NULL DEFAULT 0,
    "titleIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metaDescription" TEXT,
    "metaDescLength" INTEGER,
    "metaDescPixelWidth" INTEGER,
    "metaDescHash" TEXT,
    "metaDescCount" INTEGER NOT NULL DEFAULT 0,
    "metaIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h1" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h1Count" INTEGER NOT NULL DEFAULT 0,
    "h1Hash" TEXT,
    "h1Issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h2" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h2Count" INTEGER NOT NULL DEFAULT 0,
    "canonicalUrl" TEXT,
    "canonicalMismatch" BOOLEAN NOT NULL DEFAULT false,
    "metaRobots" TEXT,
    "xRobotsTag" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "foundViaSitemap" BOOLEAN NOT NULL DEFAULT false,
    "inlinkCount" INTEGER NOT NULL DEFAULT 0,
    "isOrphan" BOOLEAN NOT NULL DEFAULT false,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "sourcePageId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "anchorText" TEXT,
    "nofollow" BOOLEAN NOT NULL DEFAULT false,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "chainPosition" INTEGER NOT NULL DEFAULT 0,
    "finalUrl" TEXT,
    "finalStatus" INTEGER,
    "hops" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "pageId" TEXT,
    "referrerUrl" TEXT,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "type" "AssetType" NOT NULL DEFAULT 'other',
    "statusCode" INTEGER,
    "statusClass" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER,
    "isBroken" BOOLEAN NOT NULL DEFAULT false,
    "altText" TEXT,
    "altLength" INTEGER,
    "altIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Crawl_userId_idx" ON "Crawl"("userId");

-- CreateIndex
CREATE INDEX "Crawl_status_idx" ON "Crawl"("status");

-- CreateIndex
CREATE INDEX "Page_crawlId_statusClass_idx" ON "Page"("crawlId", "statusClass");

-- CreateIndex
CREATE INDEX "Page_crawlId_isInternal_idx" ON "Page"("crawlId", "isInternal");

-- CreateIndex
CREATE INDEX "Page_crawlId_foundViaSitemap_idx" ON "Page"("crawlId", "foundViaSitemap");

-- CreateIndex
CREATE INDEX "Page_crawlId_titleHash_idx" ON "Page"("crawlId", "titleHash");

-- CreateIndex
CREATE INDEX "Page_crawlId_metaDescHash_idx" ON "Page"("crawlId", "metaDescHash");

-- CreateIndex
CREATE INDEX "Page_crawlId_h1Hash_idx" ON "Page"("crawlId", "h1Hash");

-- CreateIndex
CREATE INDEX "Page_crawlId_isOrphan_idx" ON "Page"("crawlId", "isOrphan");

-- CreateIndex
CREATE UNIQUE INDEX "Page_crawlId_url_key" ON "Page"("crawlId", "url");

-- CreateIndex
CREATE INDEX "Link_crawlId_targetHash_idx" ON "Link"("crawlId", "targetHash");

-- CreateIndex
CREATE INDEX "Link_sourcePageId_idx" ON "Link"("sourcePageId");

-- CreateIndex
CREATE INDEX "Redirect_crawlId_idx" ON "Redirect"("crawlId");

-- CreateIndex
CREATE INDEX "Asset_crawlId_type_statusClass_idx" ON "Asset"("crawlId", "type", "statusClass");

-- CreateIndex
CREATE INDEX "Asset_crawlId_isBroken_idx" ON "Asset"("crawlId", "isBroken");

-- CreateIndex
CREATE INDEX "Asset_crawlId_urlHash_idx" ON "Asset"("crawlId", "urlHash");

-- CreateIndex
CREATE INDEX "Issue_crawlId_idx" ON "Issue"("crawlId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_crawlId_category_key" ON "Issue"("crawlId", "category");

-- AddForeignKey
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redirect" ADD CONSTRAINT "Redirect_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
