-- AlterTable
ALTER TABLE "Keyword" ADD COLUMN "intentContext" TEXT;
ALTER TABLE "Keyword" ADD COLUMN "zhExpansionQueries" TEXT;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "searchQuery" TEXT;
ALTER TABLE "Topic" ADD COLUMN "snippet" TEXT;
