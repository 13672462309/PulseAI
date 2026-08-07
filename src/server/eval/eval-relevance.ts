import fs from 'node:fs';
import path from 'node:path';
import { checkKeywordRelevanceBatch } from '../ai/pipeline.js';

interface GoldenCase {
  id: string;
  keyword: string;
  title: string;
  snippet?: string | null;
  source?: string | null;
  expected: boolean;
  note?: string;
}

interface Metrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  retried: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number | null;
}

const GOLDEN_PATH = new URL('../../../tests/relevance/golden-cases.json', import.meta.url);
const REPORT_DIR = path.resolve('eval-reports');

function zeroMetrics(): Metrics {
  return { tp: 0, fp: 0, fn: 0, tn: 0, retried: 0, precision: null, recall: null, f1: null, accuracy: null };
}

function calc(m: Metrics, evaluated: number): Metrics {
  m.precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : null;
  m.recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : null;
  m.f1 = m.precision != null && m.recall != null && m.precision + m.recall > 0
    ? (2 * m.precision * m.recall) / (m.precision + m.recall)
    : null;
  m.accuracy = evaluated > 0 ? (m.tp + m.tn) / evaluated : null;
  return m;
}

function fmt(n: number | null): string {
  return n == null ? '—' : (n * 100).toFixed(1) + '%';
}

async function main(): Promise<void> {
  const raw = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')) as GoldenCase[];
  if (!raw.length) {
    console.error('No golden cases found');
    process.exit(1);
  }

  const byKeyword = new Map<string, GoldenCase[]>();
  for (const c of raw) {
    const list = byKeyword.get(c.keyword) || [];
    list.push(c);
    byKeyword.set(c.keyword, list);
  }

  const overall = zeroMetrics();
  const perKeyword: Record<string, Metrics> = {};
  const errors: Array<{
    id: string;
    keyword: string;
    title: string;
    expected: boolean;
    predicted: boolean;
    confidence: number;
    reason: string | null;
  }> = [];

  let totalEvaluated = 0;

  for (const [kw, cases] of byKeyword) {
    const results = await checkKeywordRelevanceBatch(
      cases.map((c) => ({ title: c.title, snippet: c.snippet ?? null, source: c.source ?? null })),
    );
    const m = zeroMetrics();
    let evaluated = 0;

    results.forEach((r, i) => {
      const c = cases[i];
      if (r === null) {
        m.retried++;
        overall.retried++;
        return;
      }
      evaluated++;
      totalEvaluated++;
      const predicted = r.relevant;
      if (predicted && c.expected) m.tp++;
      else if (predicted && !c.expected) m.fp++;
      else if (!predicted && c.expected) m.fn++;
      else m.tn++;

      if (predicted !== c.expected) {
        errors.push({
          id: c.id,
          keyword: kw,
          title: c.title,
          expected: c.expected,
          predicted,
          confidence: r.confidence,
          reason: r.reason,
        });
      }
    });

    // Merge into overall (retried cases are excluded from the ratio denominators)
    overall.tp += m.tp;
    overall.fp += m.fp;
    overall.fn += m.fn;
    overall.tn += m.tn;
    perKeyword[kw] = calc(m, evaluated);
  }

  const overallM = calc(overall, totalEvaluated);
  const report = {
    generatedAt: new Date().toISOString(),
    total: raw.length,
    evaluated: totalEvaluated,
    retried: overall.retried,
    overall: overallM,
    perKeyword,
    errors,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(REPORT_DIR, `relevance-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));

  console.log('=== Relevance Eval ===');
  console.log(`total=${raw.length} evaluated=${totalEvaluated} retried=${overall.retried}`);
  console.log(
    `precision=${fmt(overallM.precision)} recall=${fmt(overallM.recall)} f1=${fmt(overallM.f1)} accuracy=${fmt(overallM.accuracy)}`,
  );
  console.log('per-keyword:');
  for (const [kw, m] of Object.entries(perKeyword)) {
    console.log(
      `  ${kw}: p=${fmt(m.precision)} r=${fmt(m.recall)} f1=${fmt(m.f1)} acc=${fmt(m.accuracy)} (tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn} retried=${m.retried})`,
    );
  }
  console.log(`errors=${errors.length}`);
  for (const e of errors.slice(0, 20)) {
    console.log(`  [${e.id}] expected=${e.expected ? 'related' : 'unrelated'} got=${e.predicted ? 'related' : 'unrelated'} conf=${e.confidence} "${e.title}" reason=${e.reason ?? '—'}`);
  }
  console.log(`report: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
