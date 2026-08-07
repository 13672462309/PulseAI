-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Topic" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sourceRank" INTEGER,
    "url" TEXT,
    "heatIndex" REAL NOT NULL DEFAULT 0,
    "heatScore" REAL,
    "prevHeatScore" REAL,
    "rawHeat" REAL,
    "growthRate" REAL,
    "velocityScore" REAL,
    "aiVerified" INTEGER NOT NULL DEFAULT 0,
    "isRumor" BOOLEAN,
    "isActionable" BOOLEAN,
    "verifyRetry" BOOLEAN NOT NULL DEFAULT false,
    "aiSummary" TEXT,
    "aiCategory" TEXT,
    "tier" TEXT,
    "matchedKeyword" TEXT,
    "matchReason" TEXT,
    "matchConfidence" REAL,
    "engagement" TEXT,
    "snippet" TEXT,
    "searchQuery" TEXT,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    "recommendScore" REAL,
    "peakHeat" REAL NOT NULL DEFAULT 0,
    "mentionCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Topic_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Topic" ("aiCategory", "aiSummary", "aiVerified", "engagement", "firstSeenAt", "growthRate", "heatIndex", "heatScore", "id", "isActionable", "isRumor", "lastSeenAt", "matchConfidence", "matchReason", "matchedKeyword", "mentionCount", "normalizedTitle", "peakHeat", "prevHeatScore", "publishedAt", "rawHeat", "recommendScore", "searchQuery", "snippet", "sourceId", "sourceRank", "tier", "title", "url", "velocityScore") SELECT "aiCategory", "aiSummary", "aiVerified", "engagement", "firstSeenAt", "growthRate", "heatIndex", "heatScore", "id", "isActionable", "isRumor", "lastSeenAt", "matchConfidence", "matchReason", "matchedKeyword", "mentionCount", "normalizedTitle", "peakHeat", "prevHeatScore", "publishedAt", "rawHeat", "recommendScore", "searchQuery", "snippet", "sourceId", "sourceRank", "tier", "title", "url", "velocityScore" FROM "Topic";
DROP TABLE "Topic";
ALTER TABLE "new_Topic" RENAME TO "Topic";
CREATE INDEX "Topic_normalizedTitle_idx" ON "Topic"("normalizedTitle");
CREATE INDEX "Topic_firstSeenAt_idx" ON "Topic"("firstSeenAt");
CREATE INDEX "Topic_lastSeenAt_idx" ON "Topic"("lastSeenAt");
CREATE INDEX "Topic_publishedAt_idx" ON "Topic"("publishedAt");
CREATE INDEX "Topic_recommendScore_idx" ON "Topic"("recommendScore");
CREATE INDEX "Topic_sourceId_idx" ON "Topic"("sourceId");
CREATE INDEX "Topic_velocityScore_idx" ON "Topic"("velocityScore");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
