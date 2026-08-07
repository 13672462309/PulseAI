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

// ── Builtin keyword → intent context map ──
// Describes what the keyword means in an investment-monitoring context.
// Used to guide Chinese query expansion AND the AI relevance judgement.
const BUILTIN_INTENTS: Record<string, string> = {
  'ai大模型': '关注大语言模型的发布、能力、成本与应用落地，及对 AI 算力与相关上市公司的影响；不包含 AI 绘画/图像/音乐/视频等泛 AI 创作内容，除非与大模型能力或产业直接相关',
  'ai': '关注人工智能产业动态：大模型、算力、应用落地与相关上市公司；不包含泛娱乐化的 AI 创作内容，除非与产业或上市公司直接相关',
  'deepseek': '关注 DeepSeek 模型发布、性能、开源生态、商业应用及对 AI 产业链的影响；不包含使用教程、技巧分享等泛化内容',
  'claude': '关注 Claude/Anthropic 模型能力、产品更新、开发者生态与 AI 竞争格局',
  'gpt': '关注 OpenAI GPT 系列发布、能力升级与 AI 产业影响',
  'llm': '关注大语言模型技术、产品与产业动态',
  '大模型': '关注大语言模型的发布、能力、成本与应用落地，及对 AI 算力与相关上市公司的影响；不包含 AI 绘画/图像/音乐/视频等泛 AI 创作内容，除非与大模型能力或产业直接相关',
  '半导体': '关注芯片设计、制造、设备、材料、先进制程与出口管制，及其对产业链和上市公司的影响；不包含二手设备回收报价、维修服务等非产业信息',
  '芯片': '关注芯片产业链：设计、制造、封测、设备、材料及相关公司',
  'nvidia': '关注 NVIDIA GPU、CUDA、数据中心与 AI 算力业务及竞争对手',
  '英伟达': '关注 NVIDIA 在中国市场、AI 算力竞争与产业链影响',
  '华为': '关注华为芯片、鸿蒙、汽车与 AI 相关业务动态',
  '小米': '关注小米手机、汽车、AIoT 与供应链动态',
  '苹果': '关注苹果硬件、服务、AI 布局与供应链',
  'iphone': '关注 iPhone 新品、销量与供应链影响',
  '特斯拉': '关注特斯拉电动车、自动驾驶、储能与产业链；不包含第三方改装、粉丝 DIY 等非官方动态',
  '新能源': '关注光伏、风电、储能、电动车等新能源产业动态与上市公司影响；不包含车展/展会/娱乐营销等非产业信息',
  '电动车': '关注电动汽车销量、产业链与竞争格局',
  '电影': '关注电影票房、档期、出品方与影视产业链',
  'film': '关注电影产业动态与票房表现',
};

// ── Builtin keyword → Chinese expansion queries map ──
// Original keyword is always searched first; these are extra variants.
const BUILTIN_ZH_EXPANSIONS: Record<string, string[]> = {
  'ai大模型': ['AI大模型 发布', '大模型 应用落地', '大模型 算力'],
  'ai': ['人工智能 大模型', 'AI 产业动态', 'AI 应用落地'],
  'deepseek': ['DeepSeek 模型', 'DeepSeek 发布', 'DeepSeek 开源'],
  'claude': ['Claude 模型', 'Anthropic 动态', 'Claude Code'],
  'gpt': ['GPT 发布', 'OpenAI 动态', 'ChatGPT 更新'],
  'llm': ['大语言模型', 'LLM 应用'],
  '大模型': ['大模型 发布', '大模型 应用', '大模型 算力'],
  '半导体': ['半导体 产业链', '芯片 出口管制', '晶圆代工'],
  '芯片': ['芯片 产业链', '先进制程', '芯片 出口'],
  'nvidia': ['NVIDIA 财报', '英伟达 芯片', 'GPU 算力'],
  '英伟达': ['英伟达 财报', '英伟达 芯片', 'NVIDIA 动态'],
  '华为': ['华为 芯片', '华为 汽车', '鸿蒙 动态'],
  '小米': ['小米 汽车', '小米 手机', '小米 供应链'],
  '苹果': ['苹果 发布会', '苹果 供应链', 'iPhone 销量'],
  'iphone': ['iPhone 新品', 'iPhone 销量', '苹果 供应链'],
  '特斯拉': ['特斯拉 销量', '特斯拉 自动驾驶', '特斯拉 储能'],
  '新能源': ['新能源 产业', '光伏 动态', '储能 政策'],
  '电动车': ['电动车 销量', '新能源汽车 产业链', '电动车 政策'],
  '电影': ['电影 票房', '电影 档期', '影视 公司'],
  'film': ['电影 票房', '电影 产业'],
};

// Default query used when a keyword matches nothing and LLM fails
const DEFAULT_QUERY = (keyword: string) => [keyword];

export function defaultIntent(keyword: string): string {
  return `关注与「${keyword}」相关的新闻、产业链动态与投资影响`;
}

// Case-insensitive lookup against the builtin map (keywords may be entered as "AI大模型" vs "ai大模型")
function resolveBuiltin(keyword: string): string[] | undefined {
  const direct = BUILTIN_QUERIES[keyword];
  if (direct) return direct;
  const key = Object.keys(BUILTIN_QUERIES).find((k) => k.toLowerCase() === keyword.toLowerCase());
  return key ? BUILTIN_QUERIES[key] : undefined;
}

function resolveBuiltinIntent(keyword: string): string | undefined {
  const direct = BUILTIN_INTENTS[keyword];
  if (direct) return direct;
  const key = Object.keys(BUILTIN_INTENTS).find((k) => k.toLowerCase() === keyword.toLowerCase());
  return key ? BUILTIN_INTENTS[key] : undefined;
}

export function resolveBuiltinZh(keyword: string): string[] | undefined {
  const direct = BUILTIN_ZH_EXPANSIONS[keyword];
  if (direct) return direct;
  const key = Object.keys(BUILTIN_ZH_EXPANSIONS).find((k) => k.toLowerCase() === keyword.toLowerCase());
  return key ? BUILTIN_ZH_EXPANSIONS[key] : undefined;
}

// Clean/validate LLM-returned query variants: trim, strip quotes, dedupe, cap at 4.
export function sanitizeVariants(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const s = v.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (s.length < 2) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 4) break;
  }
  return out;
}

// Round-robin picker for English queries (HN): rotate across rounds.
export function pickVariants(variants: string[], round: number, count = 1): string[] {
  if (!variants.length) return [];
  const out: string[] = [];
  for (let i = 0; i < Math.min(Math.max(count, 1), variants.length); i++) {
    out.push(variants[(round + i) % variants.length]);
  }
  return out;
}

// Chinese picker: always keep the original keyword, rotate the extra variants.
export function pickZhQueries(variants: string[], round: number, count = 2): string[] {
  if (!variants.length) return [];
  const original = variants[0];
  const rest = variants.slice(1);
  const out = [original];
  for (let i = 0; i < Math.min(Math.max(count - 1, 0), rest.length); i++) {
    out.push(rest[(round + i) % rest.length]);
  }
  return out;
}

export function currentExpansionRound(): number {
  return Math.floor(Date.now() / 1800000); // 30-min crawl interval
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
 * Get the investment intent context for a keyword.
 * Priority: builtin map → DB cache (Keyword.intentContext) → LLM generate + cache → template fallback.
 */
export async function getIntentContext(keyword: string): Promise<string> {
  const builtin = resolveBuiltinIntent(keyword);
  if (builtin) return builtin;

  const row = await prisma.keyword.findUnique({ where: { keyword } });
  if (row?.intentContext) return row.intentContext;

  const generated = await generateIntentWithLLM(keyword);
  const intent = generated || defaultIntent(keyword);
  if (row) {
    await prisma.keyword.update({
      where: { id: row.id },
      data: { intentContext: intent },
    });
  }
  return intent;
}

/**
 * Get Chinese expansion queries for domestic channels (bilibili/sogou/bing/web-search).
 * Always includes the original keyword first. Cached in Keyword.zhExpansionQueries.
 */
export async function getZhExpansionQueries(keyword: string): Promise<string[]> {
  const builtin = resolveBuiltinZh(keyword);
  const base = builtin || [];
  if (base.length) return [keyword, ...base.filter((q) => q.toLowerCase() !== keyword.toLowerCase())];

  const row = await prisma.keyword.findUnique({ where: { keyword } });
  if (row?.zhExpansionQueries) {
    try {
      const parsed = JSON.parse(row.zhExpansionQueries);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const queries = sanitizeVariants(parsed);
        if (queries.length) return queries;
      }
    } catch {
      // corrupt cache — regenerate below
    }
  }

  const intent = await getIntentContext(keyword);
  const generated = await generateZhExpansionsWithLLM(keyword, intent);
  const queries = sanitizeVariants([keyword, ...generated]);
  const result = queries.length ? queries : [keyword];
  if (row) {
    await prisma.keyword.update({
      where: { id: row.id },
      data: { zhExpansionQueries: JSON.stringify(result) },
    });
  }
  return result;
}

/**
 * Channel-aware query selection:
 * - 'hn': English translated queries (round-robin single pick)
 * - 'zh': Chinese expansion queries (original + rotated variants)
 */
export async function selectQueriesForChannel(
  keyword: string,
  channel: 'hn' | 'zh',
  round: number,
  max = 2,
): Promise<string[]> {
  if (channel === 'hn') return pickVariants(await getSearchQueries(keyword), round, 1);
  return pickZhQueries(await getZhExpansionQueries(keyword), round, max);
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

/**
 * Backfill intentContext + zhExpansionQueries for active keywords missing them.
 * Called at scheduler start (non-blocking) and after creating/renaming keywords.
 */
export async function ensureAllSearchContext(): Promise<void> {
  const keywords = await prisma.keyword.findMany({ where: { isActive: true } });
  let generated = 0;

  for (const kw of keywords) {
    if (!kw.intentContext) {
      const builtin = resolveBuiltinIntent(kw.keyword);
      const intent = builtin || (await generateIntentWithLLM(kw.keyword)) || defaultIntent(kw.keyword);
      await prisma.keyword.update({
        where: { id: kw.id },
        data: { intentContext: intent },
      });
      generated++;
      await sleep(150);
    }

    if (!kw.zhExpansionQueries) {
      const builtin = resolveBuiltinZh(kw.keyword);
      let variants: string[] = builtin || [];
      if (!variants.length) {
        const intent = kw.intentContext || defaultIntent(kw.keyword);
        variants = await generateZhExpansionsWithLLM(kw.keyword, intent);
      }
      const result = sanitizeVariants([kw.keyword, ...variants]);
      await prisma.keyword.update({
        where: { id: kw.id },
        data: { zhExpansionQueries: JSON.stringify(result.length ? result : [kw.keyword]) },
      });
      generated++;
      await sleep(150);
    }
  }

  if (generated > 0) console.log(`[KeywordQueries] Backfilled intent/zh expansions for ${generated} keywords`);
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

async function generateIntentWithLLM(keyword: string): Promise<string | null> {
  const prompt = `你是投资热点监控助手。为监控关键词生成一句中文“意图上下文”，说明监控这个词时真正关注的方向（产业链、公司、事件、政策等），不超过 50 字。

关键词: "${keyword}"

返回 JSON：{"intent": "..."}`;

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'KeywordIntent',
        schema: {
          type: 'object',
          properties: {
            intent: { type: 'string' },
          },
          required: ['intent'],
        },
      },
      maxTokens: 128,
    }) as { intent?: string };

    const intent = typeof result?.intent === 'string' ? result.intent.trim() : '';
    return intent || null;
  } catch (err) {
    console.error(`[KeywordQueries] Intent generation failed for "${keyword}":`, err);
    return null;
  }
}

async function generateZhExpansionsWithLLM(keyword: string, intent: string): Promise<string[]> {
  const prompt = `你是搜索查询词扩展引擎。为中文平台（B站/搜狗/Bing/通用搜索）生成 2-3 个中文搜索查询词，用于发现与该关键词相关的热点内容。

关键词: "${keyword}"
意图上下文: ${intent}

要求：
- 输出中文查询词（不含引号），每个都是独立可用的搜索字符串
- 覆盖产业链、公司、事件、政策等不同角度
- 不要输出与该关键词无关的泛化词

返回 JSON：{"queries": ["...", "..."]}`;

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'ZhExpansionQueries',
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

    return sanitizeVariants(result?.queries || []);
  } catch (err) {
    console.error(`[KeywordQueries] ZH expansion generation failed for "${keyword}":`, err);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
