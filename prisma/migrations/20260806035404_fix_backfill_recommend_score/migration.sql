-- The first backfill treated lastSeenAt (stored as epoch MILLISECONDS in SQLite)
-- as a date string, so every row ended up with NULL. Recompute correctly:
-- freshness window is 48h, converted from seconds since epoch.
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
  + MAX(0, 48 - (strftime('%s','now') - "lastSeenAt" / 1000.0) / 3600.0) * 10;
