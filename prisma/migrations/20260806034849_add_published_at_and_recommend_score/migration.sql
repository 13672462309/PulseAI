-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "Topic" ADD COLUMN "recommendScore" REAL;

-- CreateIndex
CREATE INDEX "Topic_lastSeenAt_idx" ON "Topic"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Topic_publishedAt_idx" ON "Topic"("publishedAt");

-- CreateIndex
CREATE INDEX "Topic_recommendScore_idx" ON "Topic"("recommendScore");
