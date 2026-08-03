import prisma from '../db.js';
import { aiChat, MODELS } from '../ai/client.js';

// ── Builtin keyword → English search queries map ──
// Covers common/known keywords with zero AI cost.
// Unknown keywords fall back to LLM generation (cached in Keyword.searchQueries).
const BUILTIN_QUERIES: Record<string, string[]> = {
  // AI / LLM
  'ai大模型': ['large language model', 'LLM', 'AI model'],
  'ai': ['artificial intelligence', 'AI'],
  'deepseek': ['DeepSeek'],
  'claude': ['Claude', 'Anthropic', 'Claude AI'],
  'gpt': ['GPT', 'OpenAI'],
  'llm': ['large language model', 'LLM'],
  '大模型': ['large language model', 'LLM'],
  // Semiconductor / hardware
  '半导体': ['semiconductor', 'chip'],
  '芯片': ['chip', 'semiconductor'],
  'nvidia': ['NVIDIA'],
  '英伟达': ['NVIDIA'],
  // Consumer tech
  '华为': ['Huawei'],
  '小米': ['Xiaomi'],
  '苹果': ['Apple'],
  'iphone': ['iPhone'],
  '特斯拉': ['Tesla'],
  '新能源': ['renewable energy', 'electric vehicle', 'EV'],
  '电动车': ['electric vehicle', 'EV'],
  // Entertainment
  '电影': ['movie', 'film'],
  'film': ['film', 'movie'],
};

// Default query used when a keyword matches nothing and LLM fails
const DEFAULT_QUERY = (keyword: string) => [keyword];

// Case-insensitive lookup against the builtin map (keywords may be entered as "AI大模型" vs "ai大模型")
function resolveBuiltin(keyword: string): string[] | undefined {
  const direct = BUILTIN_QUERIES[keyword];
  if (direct) return direct;
  const key = Object.keys(BUILTIN_QUERIES).find((k) => k.toLowerCase() === keyword.toLowerCase());
  return key ? BUILTIN_QUERIES[key] : undefined;
}

/**
 * Get English search queries for a keyword.
 * Priority: builtin map → DB cache (Keyword.searchQueries) → LLM generate + cache → keyword itself.
 */
export async function getSearchQueries(keyword: string): Promise<string[]> {
  const builtin = resolveBuiltin(keyword);
  if (builtin) return builtin;

  const row = await prisma.keyword.findUnique({ where: { keyword } });
  if (row?.searchQueries) {
    try {
      const parsed = JSON.parse(row.searchQueries);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((q) => typeof q === 'string');
    } catch {
      // corrupt cache — regenerate below
    }
  }

  // LLM generation
  const generated = await generateQueriesWithLLM(keyword);
  if (generated.length > 0) {
    if (row) {
      await prisma.keyword.update({
        where: { id: row.id },
        data: { searchQueries: JSON.stringify(generated) },
      });
    }
    return generated;
  }

  return DEFAULT_QUERY(keyword);
}

/**
 * Backfill searchQueries for all active keywords missing a cached value (lazy generation).
 * Used at scheduler start so every keyword is covered without blocking the crawl.
 */
export async function ensureAllSearchQueries(): Promise<void> {
  const keywords = await prisma.keyword.findMany({ where: { isActive: true } });
  let generated = 0;

  for (const kw of keywords) {
    if (kw.searchQueries) continue;
    const builtin = resolveBuiltin(kw.keyword);
    if (builtin) {
      await prisma.keyword.update({
        where: { id: kw.id },
        data: { searchQueries: JSON.stringify(builtin) },
      });
      continue;
    }
    const queries = await generateQueriesWithLLM(kw.keyword);
    if (queries.length > 0) {
      await prisma.keyword.update({
        where: { id: kw.id },
        data: { searchQueries: JSON.stringify(queries) },
      });
      generated++;
    }
    await sleep(200); // be gentle with the LLM API
  }

  if (generated > 0) console.log(`[KeywordQueries] LLM-generated queries for ${generated} new keywords`);
}

async function generateQueriesWithLLM(keyword: string): Promise<string[]> {
  const prompt = `你是搜索查询词翻译引擎。为监控关键词生成 2-3 个英文搜索查询词，用于 Hacker News 等英文平台搜索。

关键词: "${keyword}"

要求：
- 输出英文（如果关键词本身是英文直接使用，可补充同义词/变体）
- 每个查询词是独立可用的搜索字符串，不含引号
- 覆盖该词在英文社区中最常见的说法

返回 JSON 数组，例如：["DeepSeek", "DeepSeek AI"]`;

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'SearchQueries',
        schema: {
          type: 'object',
          properties: {
            queries: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
          },
          required: ['queries'],
        },
      },
      maxTokens: 256,
    }) as { queries?: string[] };

    const queries = (result?.queries || []).filter((q: unknown) => typeof q === 'string' && q.trim());
    return queries.length > 0 ? queries.slice(0, 4) : [];
  } catch (err) {
    console.error(`[KeywordQueries] LLM generation failed for "${keyword}":`, err);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
