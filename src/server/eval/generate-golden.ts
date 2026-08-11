import fs from 'node:fs';
import prisma from '../db.js';
import { aiChat, MODELS } from '../ai/client.js';

interface GeneratedCase {
  title: string;
  snippet: string;
  expected: boolean;
  reason: string;
}

const OUT_PATH = new URL('../../../tests/relevance/golden-cases.candidate.json', import.meta.url);

async function generateForKeyword(keyword: string): Promise<GeneratedCase[]> {
  const prompt = `你是测试用例生成器。为投资雷达监控关键词「${keyword}」生成 3 个正例和 3 个负例，用于评估 AI 相关性判定。

要求：
- 每条包含 title（真实新闻标题风格）、snippet（可选摘要）、expected（true=应判定相关）、reason（一句话说明为什么）
- 正例：与关键词语义相关，但最好不是简单包含关键词原词
- 负例：包含关键词字面但实际无关（同名不同义、泛化词、娱乐向等），或明显不相关

返回 JSON：{"cases": [{"title": "...", "snippet": "...", "expected": true, "reason": "..."}]}`;

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'GoldenCases',
        schema: {
          type: 'object',
          properties: {
            cases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  snippet: { type: 'string' },
                  expected: { type: 'boolean' },
                  reason: { type: 'string' },
                },
                required: ['title', 'snippet', 'expected', 'reason'],
              },
            },
          },
          required: ['cases'],
        },
      },
      maxTokens: 2048,
    }) as { cases?: GeneratedCase[] };

    return (result?.cases || []).filter((c) => typeof c.title === 'string' && c.title.trim());
  } catch (err) {
    console.error(`[GenerateGolden] Failed for "${keyword}":`, (err as Error).message?.slice(0, 120));
    return [];
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keywords = args.length
    ? args
    : (await prisma.keyword.findMany({ where: { isActive: true }, select: { keyword: true } })).map((k) => k.keyword);

  const out: Array<{ id: string; keyword: string; title: string; snippet: string; expected: boolean; note: string }> = [];
  let seq = 1;
  for (const kw of keywords) {
    const cases = await generateForKeyword(kw);
    for (const c of cases) {
      out.push({
        id: `gen-${String(seq++).padStart(3, '0')}`,
        keyword: kw,
        title: c.title.trim(),
        snippet: c.snippet?.trim() || '',
        expected: !!c.expected,
        note: c.reason,
      });
    }
    console.log(`[GenerateGolden] ${kw}: ${cases.length} cases`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`candidate file: ${OUT_PATH}`);
  console.log('请人工抽查后，将需要的用例合并进 golden-cases.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
