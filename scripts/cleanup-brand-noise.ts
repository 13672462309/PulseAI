// One-off cleanup: remove topics that are official-site homepages / official
// mall / retailer pages which slipped through because their stored URL was a
// search-engine wrapper (bing.com/ck/a, baidu/sogou /link?url=).
// Usage: tsx scripts/cleanup-brand-noise.ts [--apply]
import prisma from '../src/server/db.js';
import { isLowValueContent } from '../src/server/crawlers/content-filter.js';

async function main(): Promise<void> {
  const dryRun = !process.argv.includes('--apply');
  const topics = await prisma.topic.findMany({ select: { id: true, title: true, url: true } });
  const targets = topics.filter((t) => isLowValueContent(t.title, t.url || ''));

  console.log(`scanned=${topics.length} candidates=${targets.length} dryRun=${dryRun}`);
  for (const t of targets.slice(0, 60)) {
    console.log(`  #${t.id} ${t.title.slice(0, 70)} | ${t.url ?? ''}`);
  }
  if (targets.length > 60) console.log(`  ... and ${targets.length - 60} more`);

  if (!dryRun && targets.length) {
    const del = await prisma.topic.deleteMany({ where: { id: { in: targets.map((t) => t.id) } } });
    console.log(`deleted=${del.count}`);
  }
}

main().finally(() => prisma.$disconnect());
