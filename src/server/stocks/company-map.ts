// ── Seed company map: keyword → likely A-share companies ──
// Curated starting point for topic→stock linkage. Companies not covered here
// are resolved via the Eastmoney suggest API at runtime (with "疑似" flagging).
// Scope: A股 only (per user decision).

export interface SeedCompany {
  name: string;
  code: string;
  aliases?: string[];
}

const SEMI: SeedCompany[] = [
  { name: '中芯国际', code: '688981', aliases: ['SMIC'] },
  { name: '北方华创', code: '002371' },
  { name: '中微公司', code: '688012' },
  { name: '韦尔股份', code: '603501' },
  { name: '兆易创新', code: '603986' },
  { name: '长电科技', code: '600584' },
  { name: '澜起科技', code: '688008' },
];

const HUAWEI_CHAIN: SeedCompany[] = [
  { name: '立讯精密', code: '002475' },
  { name: '京东方A', code: '000725', aliases: ['京东方'] },
  { name: '汇顶科技', code: '603160' },
  { name: '卓胜微', code: '300782' },
  { name: '沪电股份', code: '002463' },
];

const XIAOMI_CHAIN: SeedCompany[] = [
  { name: '蓝思科技', code: '300433' },
  { name: '欣旺达', code: '300207' },
  { name: '顺络电子', code: '002138' },
  { name: '三环集团', code: '300408' },
];

const APPLE_CHAIN: SeedCompany[] = [
  { name: '立讯精密', code: '002475' },
  { name: '蓝思科技', code: '300433' },
  { name: '歌尔股份', code: '002241' },
  { name: '东山精密', code: '002384' },
  { name: '鹏鼎控股', code: '002938' },
];

const TESLA_CHAIN: SeedCompany[] = [
  { name: '拓普集团', code: '601689' },
  { name: '三花智控', code: '002050' },
  { name: '旭升集团', code: '603305' },
  { name: '均胜电子', code: '600699' },
];

const NEW_ENERGY: SeedCompany[] = [
  { name: '宁德时代', code: '300750' },
  { name: '比亚迪', code: '002594' },
  { name: '隆基绿能', code: '601012' },
  { name: '阳光电源', code: '300274' },
  { name: '亿纬锂能', code: '300014' },
  { name: '赣锋锂业', code: '002460' },
  { name: '天齐锂业', code: '002466' },
];

const AI_CHAIN: SeedCompany[] = [
  { name: '寒武纪', code: '688256' },
  { name: '海光信息', code: '688041' },
  { name: '浪潮信息', code: '000977' },
  { name: '中科曙光', code: '603019' },
  { name: '科大讯飞', code: '002230' },
  { name: '昆仑万维', code: '300418' },
];

const OPTICAL: SeedCompany[] = [
  { name: '中际旭创', code: '300308' },
  { name: '新易盛', code: '300502' },
  { name: '天孚通信', code: '300394' },
  { name: '光迅科技', code: '002281' },
];

const MOVIE: SeedCompany[] = [
  { name: '光线传媒', code: '300251' },
  { name: '万达电影', code: '002739' },
  { name: '中国电影', code: '600977' },
  { name: '博纳影业', code: '001330' },
];

const KEYWORD_COMPANIES: Record<string, SeedCompany[]> = {
  '半导体': SEMI,
  '芯片': SEMI,
  '华为': HUAWEI_CHAIN,
  '小米': XIAOMI_CHAIN,
  '苹果': APPLE_CHAIN,
  'iphone': APPLE_CHAIN,
  '特斯拉': TESLA_CHAIN,
  '新能源': NEW_ENERGY,
  '电动车': NEW_ENERGY,
  '新能源汽车': NEW_ENERGY,
  'ai大模型': AI_CHAIN,
  '大模型': AI_CHAIN,
  'ai': AI_CHAIN,
  'llm': AI_CHAIN,
  'deepseek': AI_CHAIN,
  'claude': AI_CHAIN,
  'gpt': AI_CHAIN,
  '光模块': OPTICAL,
  '电影': MOVIE,
  'film': MOVIE,
};

export function seedCompaniesForKeyword(keyword: string): SeedCompany[] {
  const key = (keyword || '').trim();
  if (KEYWORD_COMPANIES[key]) return KEYWORD_COMPANIES[key];
  const lower = key.toLowerCase();
  const found = Object.entries(KEYWORD_COMPANIES).find(([k]) => k.toLowerCase() === lower);
  return found ? found[1] : [];
}

export function findSeedCompany(keyword: string, name: string): SeedCompany | null {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  return seedCompaniesForKeyword(keyword).find(
    (c) => c.name.toLowerCase() === n || (c.aliases || []).some((a) => a.toLowerCase() === n),
  ) ?? null;
}
