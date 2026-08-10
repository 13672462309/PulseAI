-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TopicStockLink" (
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
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "quoteTime" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicStockLink_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TopicStockLink" ("exchange", "fetchedAt", "id", "pct5d", "pctSinceDiscovery", "pctToday", "price", "quoteTime", "secid", "stockCode", "stockName", "topicId", "trendJson") SELECT "exchange", "fetchedAt", "id", "pct5d", "pctSinceDiscovery", "pctToday", "price", "quoteTime", "secid", "stockCode", "stockName", "topicId", "trendJson" FROM "TopicStockLink";
DROP TABLE "TopicStockLink";
ALTER TABLE "new_TopicStockLink" RENAME TO "TopicStockLink";
CREATE INDEX "TopicStockLink_stockCode_idx" ON "TopicStockLink"("stockCode");
CREATE UNIQUE INDEX "TopicStockLink_topicId_stockCode_key" ON "TopicStockLink"("topicId", "stockCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
