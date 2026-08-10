-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "stockRecap" TEXT;

-- CreateTable
CREATE TABLE "TopicStockLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topicId" INTEGER NOT NULL,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'A股',
    "secid" TEXT,
    "price" REAL,
    "pctToday" REAL,
    "pct5d" REAL,
    "pctSinceDiscovery" REAL,
    "trendJson" TEXT,
    "quoteTime" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicStockLink_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TopicStockLink_stockCode_idx" ON "TopicStockLink"("stockCode");

-- CreateIndex
CREATE UNIQUE INDEX "TopicStockLink_topicId_stockCode_key" ON "TopicStockLink"("topicId", "stockCode");
