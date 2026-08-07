import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBuiltinZh,
  sanitizeVariants,
  pickVariants,
  pickZhQueries,
  defaultIntent,
  currentExpansionRound,
} from '../../src/server/crawlers/keyword-queries.js';

test('resolveBuiltinZh returns variants for common keywords (case-insensitive)', () => {
  const direct = resolveBuiltinZh('半导体');
  assert.ok(direct && direct.length >= 2);
  assert.ok(direct.includes('半导体 产业链'));

  const mixedCase = resolveBuiltinZh('ai大模型');
  assert.ok(mixedCase && mixedCase.length >= 2);
});

test('sanitizeVariants trims, strips quotes, dedupes and caps at 4', () => {
  const out = sanitizeVariants([
    ' 半导体 产业链 ',
    '"芯片 出口"',
    '芯片 出口',
    '',
    123 as unknown,
    'A',
    'a',
  ]);
  assert.deepEqual(out, ['半导体 产业链', '芯片 出口']);
});

test('pickVariants rotates round-robin', () => {
  const v = ['a', 'b', 'c'];
  assert.deepEqual(pickVariants(v, 0, 1), ['a']);
  assert.deepEqual(pickVariants(v, 1, 1), ['b']);
  assert.deepEqual(pickVariants(v, 2, 1), ['c']);
  assert.deepEqual(pickVariants(v, 3, 1), ['a']);
  assert.deepEqual(pickVariants(v, 0, 2), ['a', 'b']);
});

test('pickZhQueries always keeps original keyword and rotates variants', () => {
  const v = ['半导体', '半导体 产业链', '芯片 出口管制'];
  assert.deepEqual(pickZhQueries(v, 0, 2), ['半导体', '半导体 产业链']);
  assert.deepEqual(pickZhQueries(v, 1, 2), ['半导体', '芯片 出口管制']);
  assert.deepEqual(pickZhQueries(v, 2, 2), ['半导体', '半导体 产业链']);
  assert.deepEqual(pickZhQueries(v, 0, 3), ['半导体', '半导体 产业链', '芯片 出口管制']);
});

test('defaultIntent produces a non-empty Chinese intent template', () => {
  const intent = defaultIntent('半导体');
  assert.ok(intent.includes('半导体'));
});

test('currentExpansionRound is a non-negative integer', () => {
  const round = currentExpansionRound();
  assert.ok(Number.isInteger(round) && round >= 0);
});
