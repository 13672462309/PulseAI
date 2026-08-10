import got from 'got';

// ── Stock quote providers ──
// Primary: Eastmoney push2 (free, no key). Fallback: Sina hq API.
// Scope: A股 only.

const EM_SUGGEST_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EM_HEADERS = { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' };

export interface Quote {
  code: string;
  name: string;
  secid: string;
  price: number | null;
  pct: number | null;
}

export interface KlinePoint {
  date: string;
  close: number;
}

/** A股 secid: 沪市(6/9) → 1.xxxxxx，深市(0/3) 与北交所(4/8) → 0.xxxxxx */
export function buildSecid(code: string): string {
  const c = String(code).trim();
  if (/^[69]/.test(c)) return `1.${c}`;
  return `0.${c}`;
}

function sinaSymbol(code: string): string {
  const c = String(code).trim();
  if (/^[69]/.test(c)) return `sh${c}`;
  if (/^[48]/.test(c)) return `bj${c}`;
  return `sz${c}`;
}

/** Eastmoney fuzzy stock search; prefers A股 and exact name matches. */
export async function searchStock(query: string): Promise<Quote | null> {
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=${EM_SUGGEST_TOKEN}&count=8`;
    const res = await got(url, { headers: EM_HEADERS, timeout: { request: 8000 }, retry: { limit: 1 } }).json<any>();
    const rows: any[] = res?.QuotationCodeTable?.Data ?? [];
    const aShares = rows.filter((r) => r.Classify === 'AStock' || String(r.SecurityTypeName || '').includes('A'));
    if (!aShares.length) return null;
    const target = String(query || '').trim().toLowerCase();
    const exact = aShares.find((r) => String(r.Name || '').trim().toLowerCase() === target);
    const pick = exact ?? aShares[0];
    return {
      code: String(pick.Code || ''),
      name: String(pick.Name || query),
      secid: String(pick.QuoteID || buildSecid(String(pick.Code || ''))),
      price: null,
      pct: null,
    };
  } catch {
    return null;
  }
}

/** Eastmoney batch quotes: secids → Quote map (price + today pct). */
export async function fetchQuotes(secids: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (!secids.length) return out;
  try {
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids.join(',')}&fields=f2,f3,f12,f14&fltt=2`;
    const res = await got(url, { headers: EM_HEADERS, timeout: { request: 8000 }, retry: { limit: 1 } }).json<any>();
    for (const d of res?.data?.diff ?? []) {
      const secid = secids.find((s) => s.endsWith(`.${d.f12}`));
      if (!secid) continue;
      out.set(secid, {
        code: String(d.f12),
        name: String(d.f14),
        secid,
        price: typeof d.f2 === 'number' ? d.f2 : null,
        pct: typeof d.f3 === 'number' ? d.f3 : null,
      });
    }
  } catch {
    // fall through to sina below
  }
  return out;
}

/** Sina fallback quotes (GBK payload, needs Referer). */
export async function fetchSinaQuotes(codes: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (!codes.length) return out;
  try {
    const symbols = codes.map(sinaSymbol);
    const res = await got(`https://hq.sinajs.cn/list=${symbols.join(',')}`, {
      headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn/' },
      timeout: { request: 8000 },
      retry: { limit: 1 },
      responseType: 'buffer',
    });
    const text = new TextDecoder('gbk').decode(res.body);
    for (const code of codes) {
      const sym = sinaSymbol(code);
      const m = text.match(new RegExp(`var hq_str_${sym}="([^"]*)"`));
      if (!m || !m[1]) continue;
      const f = m[1].split(',');
      if (f.length < 4) continue;
      const prevClose = parseFloat(f[2]);
      const current = parseFloat(f[3]);
      if (!Number.isFinite(current) || !Number.isFinite(prevClose) || prevClose === 0) continue;
      out.set(buildSecid(code), {
        code,
        name: f[0] || code,
        secid: buildSecid(code),
        price: current,
        pct: ((current - prevClose) / prevClose) * 100,
      });
    }
  } catch {
    // ignore
  }
  return out;
}

/** Eastmoney daily kline (date, close). beg/end as YYYYMMDD. */
export async function fetchDailyKline(secid: string, beg: string, end: string): Promise<KlinePoint[]> {
  try {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&beg=${beg}&end=${end}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53`;
    const res = await got(url, { headers: EM_HEADERS, timeout: { request: 10000 }, retry: { limit: 1 } }).json<any>();
    const lines: string[] = res?.data?.klines ?? [];
    return lines
      .map((l) => {
        const p = l.split(',');
        const close = parseFloat(p[2]);
        return { date: p[0], close: Number.isFinite(close) ? close : NaN };
      })
      .filter((p) => Number.isFinite(p.close));
  } catch {
    return [];
  }
}

/** Quotes with automatic Eastmoney → Sina fallback. */
export async function fetchQuotesWithFallback(secids: string[]): Promise<Map<string, Quote>> {
  const em = await fetchQuotes(secids);
  if (em.size >= secids.length) return em;
  const missingCodes = secids.filter((s) => !em.has(s)).map((s) => s.split('.')[1]);
  const sina = await fetchSinaQuotes(missingCodes);
  for (const [secid, q] of sina) {
    if (!em.has(secid)) em.set(secid, q);
  }
  return em;
}
