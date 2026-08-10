import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSecid } from '../../src/server/stocks/provider.js';
import { seedCompaniesForKeyword, findSeedCompany } from '../../src/server/stocks/company-map.js';
import { computeMetrics, retryWithBackoff } from '../../src/server/stocks/pipeline.js';

test('buildSecid maps A股 codes to eastmoney secids', () => {
  assert.equal(buildSecid('600519'), '1.600519');
  assert.equal(buildSecid('688981'), '1.688981');
  assert.equal(buildSecid('000001'), '0.000001');
  assert.equal(buildSecid('300308'), '0.300308');
  assert.equal(buildSecid('830799'), '0.830799');
});

test('seed company map covers keywords and aliases', () => {
  assert.ok(seedCompaniesForKeyword('半导体').length >= 5);
  assert.equal(seedCompaniesForKeyword('芯片').length, seedCompaniesForKeyword('半导体').length);
  assert.deepEqual(findSeedCompany('半导体', 'SMIC'), { name: '中芯国际', code: '688981', aliases: ['SMIC'] });
  assert.equal(findSeedCompany('半导体', '不存在的公司'), null);
  assert.ok(seedCompaniesForKeyword('光模块').some((c) => c.name === '中际旭创'));
});

test('computeMetrics derives pct5d, pctSinceDiscovery and trend', () => {
  const kline = [
    { date: '2026-07-31', close: 10 },
    { date: '2026-08-03', close: 10.2 },
    { date: '2026-08-04', close: 10.5 },
    { date: '2026-08-05', close: 10.3 },
    { date: '2026-08-06', close: 10.8 },
    { date: '2026-08-07', close: 11 },
  ];
  const m = computeMetrics(kline, '2026-08-05');
  assert.ok(m);
  assert.ok(Math.abs(m!.pct5d! - 10) < 1e-9);
  assert.ok(Math.abs(m!.pctSince! - ((11 - 10.3) / 10.3) * 100) < 1e-9);
  assert.deepEqual(m!.trend, [10.3, 10.8, 11]);

  assert.equal(computeMetrics([], '2026-08-05'), null);
});

test('retryWithBackoff retries transient failures and gives up bounded', async () => {
  let calls = 0;
  const eventuallyOk = async () => {
    calls++;
    if (calls < 3) throw new Error('transient boom');
    return 'ok';
  };
  assert.equal(await retryWithBackoff(eventuallyOk, 3, [0, 0]), 'ok');
  assert.equal(calls, 3);

  let nullCalls = 0;
  const alwaysNull = async () => {
    nullCalls++;
    return null;
  };
  assert.equal(await retryWithBackoff(alwaysNull, 2, [0]), null);
  assert.equal(nullCalls, 2);
});
