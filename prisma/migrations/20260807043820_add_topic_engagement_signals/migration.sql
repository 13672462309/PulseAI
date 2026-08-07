-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "engagement" TEXT;
ALTER TABLE "Topic" ADD COLUMN "isActionable" BOOLEAN;
ALTER TABLE "Topic" ADD COLUMN "matchConfidence" REAL;
ALTER TABLE "Topic" ADD COLUMN "matchReason" TEXT;
