-- CreateTable
CREATE TABLE "Keyword" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "growthThreshold" REAL NOT NULL DEFAULT 0.15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Source" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "accessType" TEXT NOT NULL DEFAULT 'scrape',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "cooldownUntil" DATETIME,
    "lastFetchedAt" DATETIME,
    "fetchIntervalMs" INTEGER NOT NULL DEFAULT 1800000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sourceRank" INTEGER,
    "url" TEXT,
    "heatIndex" REAL NOT NULL DEFAULT 0,
    "rawHeat" REAL,
    "growthRate" REAL,
    "velocityScore" REAL,
    "aiVerified" INTEGER NOT NULL DEFAULT 0,
    "aiSummary" TEXT,
    "aiCategory" TEXT,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "peakHeat" REAL NOT NULL DEFAULT 0,
    "mentionCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Topic_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topicId" INTEGER NOT NULL,
    "heatIndex" REAL NOT NULL,
    "sourceRank" INTEGER,
    "growthRate" REAL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicHistory_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topicId" INTEGER NOT NULL,
    "keywordId" INTEGER,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alert_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CrawlLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "topicsFound" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrawlLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_keyword_key" ON "Keyword"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE INDEX "Topic_normalizedTitle_idx" ON "Topic"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Topic_firstSeenAt_idx" ON "Topic"("firstSeenAt");

-- CreateIndex
CREATE INDEX "Topic_sourceId_idx" ON "Topic"("sourceId");

-- CreateIndex
CREATE INDEX "Topic_velocityScore_idx" ON "Topic"("velocityScore");

-- CreateIndex
CREATE INDEX "TopicHistory_topicId_recordedAt_idx" ON "TopicHistory"("topicId", "recordedAt");

-- CreateIndex
CREATE INDEX "Alert_isRead_createdAt_idx" ON "Alert"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "CrawlLog_sourceId_createdAt_idx" ON "CrawlLog"("sourceId", "createdAt");
