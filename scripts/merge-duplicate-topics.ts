// Merge duplicate topic rows created by the old 2-hour dedup window.
// Groups by (normalizedTitle, sourceId), keeps the newest row, migrates
// history/alerts to it, sums mentionCount, then deletes the duplicates.
// Usage: tsx scripts/merge-duplicate-topics.ts [--apply]
import prisma from '../src/server/db.js';

interface Row {
  id: number;
  normalizedTitle: string;
  sourceId: number;
  lastSeenAt: Date;
  heatScore: number | null;
  mentionCount: number;
  peakHeat: number;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.topic.findMany({
    select: {
      id: true,
      normalizedTitle: true,
      sourceId: true,
      lastSeenAt: true,
      heatScore: true,
      mentionCount: true,
      peakHeat: true,
    },
  });

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.normalizedTitle}::${r.sourceId}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }

  let groupCount = 0;
  let duplicateCount = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    groupCount++;
    const sorted = [...group].sort(
      (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || (b.heatScore ?? -1) - (a.heatScore ?? -1),
    );
    const keeper = sorted[0];
    const dups = sorted.slice(1);
    duplicateCount += dups.length;
    console.log(`group ${key} rows=${group.length} keeper=#${keeper.id} duplicates=${dups.map(d => `#${d.id}`).join(',')}`);
  }

  console.log(`groups=${groupCount} duplicateRows=${duplicateCount} apply=${apply}`);
  if (!apply) {
    console.log('dry-run: add --apply to merge');
    return;
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || (b.heatScore ?? -1) - (a.heatScore ?? -1),
    );
    const keeper = sorted[0];
    const dups = sorted.slice(1);
    const dupIds = dups.map(d => d.id);
    await prisma.$transaction([
      prisma.topicHistory.updateMany({ where: { topicId: { in: dupIds } }, data: { topicId: keeper.id } }),
      prisma.alert.updateMany({ where: { topicId: { in: dupIds } }, data: { topicId: keeper.id } }),
      prisma.topic.update({
        where: { id: keeper.id },
        data: {
          mentionCount: { increment: dups.reduce((s, d) => s + d.mentionCount, 0) },
          peakHeat: Math.max(keeper.peakHeat, ...dups.map(d => d.peakHeat)),
        },
      }),
      prisma.topic.deleteMany({ where: { id: { in: dupIds } } }),
    ]);
  }
  console.log('merge done');
}

main().finally(() => prisma.$disconnect());
