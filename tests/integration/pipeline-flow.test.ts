import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLowValueContent } from '../../src/server/crawlers/content-filter.js';
import { selectQueriesForChannel } from '../../src/server/crawlers/keyword-queries.js';
import { buildRelevancePrompt, normalizeMatchedKeyword, type RelevanceInput } from '../../src/server/ai/pipeline.js';

test('zh channels get original keyword + rotated variant (builtin, offline)', async () => {
  const q0 = await selectQueriesForChannel('半导体', 'zh', 0, 2);
  assert.deepEqual(q0, ['半导体', '半导体 产业链']);
  const q1 = await selectQueriesForChannel('半导体', 'zh', 1, 2);
  assert.deepEqual(q1, ['半导体', '芯片 出口管制']);
});

test('hn channel gets one English translated query', async () => {
  const q = await selectQueriesForChannel('deepseek', 'hn', 5, 1);
  assert.ok(q.length === 1 && q[0].length > 0);
});

test('relevance prompt embeds intent, snippet and source', () => {
  const items: RelevanceInput[] = [
    { title: '台积电3nm量产', snippet: '产能爬坡带动设备订单增长', source: 'Bing 搜索' },
    { title: '半导体照明新品发布', snippet: '智能灯具', source: 'B站' },
  ];
  const prompt = buildRelevancePrompt(
    items,
    ['半导体'],
    new Map([['半导体', '关注芯片设计/制造/设备/材料']]),
  );
  assert.ok(prompt.includes('关注芯片设计/制造/设备/材料'));
  assert.ok(prompt.includes('摘要：产能爬坡带动设备订单增长'));
  assert.ok(prompt.includes('来源：Bing 搜索'));
});

test('matchedKeyword is normalized and validated against the keyword list', () => {
  // case/whitespace variants map back to the canonical keyword text
  assert.equal(normalizeMatchedKeyword('DeepSeek', ['deepseek']), 'deepseek');
  assert.equal(normalizeMatchedKeyword('AI 大模型', ['AI大模型']), 'AI大模型');
  assert.equal(normalizeMatchedKeyword(' 华为公司 ', ['华为']), '华为');
  // containment fallbacks
  assert.equal(normalizeMatchedKeyword('ai', ['AI大模型']), 'AI大模型');
  assert.equal(normalizeMatchedKeyword('华为公司', ['华为', '华为公司']), '华为公司');
  // unmappable aliases/translations → null (never store a mismatched label)
  assert.equal(normalizeMatchedKeyword('semiconductor', ['半导体']), null);
  assert.equal(normalizeMatchedKeyword('苹果', ['iphone']), null);
  assert.equal(normalizeMatchedKeyword('', ['半导体']), null);
  assert.equal(normalizeMatchedKeyword(null, ['半导体']), null);
  assert.equal(normalizeMatchedKeyword('半导体', []), null);
});

test('simulated search → filter → judgement flow keeps relevant and drops noise', () => {
  const fixtures = [
    { title: '台积电3nm量产 产能爬坡', url: 'https://example.com/1', keyword: '半导体' },
    { title: '什么是半导体 百度百科', url: 'https://baike.baidu.com/item/x', keyword: '半导体' },
    { title: 'DeepSeek 发布新模型', url: 'https://example.com/2', keyword: 'deepseek' },
  ];

  // 1) rule-based content filter
  const filtered = fixtures.filter((f) => !isLowValueContent(f.title, f.url));

  // 2) simulated semantic judgement (deterministic stand-in for the AI gate)
  const relevantTerms = ['台积电', 'DeepSeek'];
  const kept = filtered.filter((f) => relevantTerms.some((term) => f.title.includes(term)));
  const discarded = fixtures.length - kept.length;

  assert.equal(kept.length, 2);
  assert.equal(discarded, 1);
});
