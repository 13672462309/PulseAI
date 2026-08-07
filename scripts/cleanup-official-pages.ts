// One-off cleanup: remove existing topics that the current content filter
// would now reject as official/company pages (brand homepages, registry titles).
// Usage: tsx scripts/cleanup-official-pages.ts [--dry-run]
import prisma from '../src/server/db.js';
import { isLowValueContent } from '../src/server/crawlers/content-filter.js';

const COMPANY_RE = /(有限责任公司|股份有限公司|有限公司)$/;
const BRAND_KEYS = [
  'huawei', 'xiaomi', 'mi', 'apple', 'tesla', 'deepseek',
  'openai', 'anthropic', 'claude', 'nvidia', 'lenovo', 'tencent', 'alibaba', 'baidu',
];

function isOfficialPage(title: string, url: string | null): boolean {
  if (COMPANY_RE.test(title.trim())) return true;
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const brandHit = BRAND_KEYS.some((k) => host.includes(k));
    return brandHit && isLowValueContent(title, url);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const topics = await prisma.topic.findMany({ select: { id: true, title: true, url: true } });
  const targets = topics.filter((t) => isOfficialPage(t.title, t.url));

  console.log(`candidates=${targets.length} dryRun=${dryRun}`);
  for (const t of targets) {
    console.log(`  #${t.id} ${t.title} | ${t.url ?? ''}`);
  }

  if (!dryRun && targets.length) {
    const del = await prisma.topic.deleteMany({ where: { id: { in: targets.map((t) => t.id) } } });
    console.log(`deleted=${del.count}`);
  }
}

main().finally(() => prisma.$disconnect());
