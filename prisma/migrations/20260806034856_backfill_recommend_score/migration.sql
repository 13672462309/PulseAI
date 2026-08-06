-- Backfill recommendScore for existing topics so the default
-- "comprehensive recommendation" sort works before the next pipeline run.
-- Mirrors the runtime formula: tier weight + velocity + heat + freshness(0-48h).
UPDATE "Topic"
SET "recommendScore" =
  CASE "tier"
    WHEN 'burst' THEN 5000
    WHEN 'hot' THEN 3000
    WHEN 'rising' THEN 1500
    ELSE 0
  END
  + COALESCE("velocityScore", 0)
  + COALESCE("heatScore", 0)
  + MAX(0, 48 - CAST((strftime('%s','now') - strftime('%s',"lastSeenAt")) AS REAL) / 3600.0) * 10;
