// ── Low-value content filter (rule-based) ──
// Removes encyclopedia/dictionary entries, official-site homepages, download/tutorial
// content etc. — noise that is keyword-relevant but worthless for stock-trading discovery.
// Rules are title substring matches + URL patterns + brand-domain homepage detection.

const TITLE_BLOCKLIST = [
  // encyclopedia / dictionary
  '百科', '词典', '英汉词典', '单词',
  // generic-knowledge questions ("什么是半导体", "什么叫半导体")
  '是什么', '是什么意思', '什么意思', '什么是', '什么叫',
  // official sites / downloads
  '官网', '官方网站', '官方下载', '免费下载', '安全下载', '下载站',
  // app-download style titles ("下载DeepSeek App_...", "Download Claude | ...")
  'App_', 'Download',
  // tutorials / how-to content
  '保姆级', '教程', '技巧', '速通', '教学', '手把手', '从零开始', '零基础', '免费使用',
  // how-to guides / mirror sites ("Claude 新手指南", "国内使用指南", "镜像站")
  '指南', '镜像站',
  // video-site / portal channel pages ("爱奇艺-电影频道", "豆瓣电影", "免费电影在线观看")
  '在线观看', '在线播放', '电影频道', '影视大全', '电影大全', '高清电影', '免费电影',
  '电影网', '影院热映', '热映电影', '豆瓣', '哔哩哔哩',
  // portal homepages / channel pages ("半导体新闻资讯-全球半导体观察", "娱乐看猫眼")
  '新闻资讯', '最新资讯', '新闻快讯', '全球半导体观察', '娱乐看猫眼',
];

// Regex patterns: "下载" outside of the "下载量" context is a download-site signal
const TITLE_PATTERNS: RegExp[] = [
  /下载(?!量)/,
  // Company registry / official profile pages ("华为技术有限公司", "小米科技有限责任公司")
  /^[\u4e00-\u9fa5A-Za-z0-9·&（）()\- ]{2,24}(有限责任公司|股份有限公司|有限公司)$/,
  // Company + store/official markers ("小米科技有限责任公司-小米商城-Xiaomi")
  /(有限责任公司|股份有限公司|有限公司)[\u4e00-\u9fa5A-Za-z0-9·&（）()\- ]{0,10}(商城|官网|官方网站|首页|store|mall|home)/i,
];

// Brand-page title pattern: "DeepSeek | 深度求索", "Claude | Anthropic" —
// short "A | B" titles are overwhelmingly brand/official pages, not news.
const BRAND_PAGE_TITLE = /^[^\s|]{1,20}\s*\|\s*[^\s|]{1,20}$/;

const URL_BLOCKLIST = [
  'baike.baidu.com',
  'zhihu.com/topic',       // zhihu topic pages are encyclopedia-like; Q&A articles are kept
  'sogou.com/doc',         // sogou encyclopedia
  'baike.sogou.com',
  'dictionary.cambridge.org',
  'imdb.com',
  'dramx.com',             // semiconductor news portal (no deep content)
  '163.com/dy/media',      // netease media-account homepages
];

// Domain core word → Chinese/alternate brand aliases. Used to catch official
// homepages whose titles are Chinese ("华为-构建万物互联的世界" on huawei.com).
const BRAND_ALIASES: Record<string, string[]> = {
  huawei: ['华为'],
  xiaomi: ['小米'],
  mi: ['小米'],
  apple: ['苹果', 'iphone', 'ipad', 'macbook'],
  tesla: ['特斯拉'],
  deepseek: ['深度求索', 'deepseek'],
  openai: ['openai', 'chatgpt', 'gpt'],
  anthropic: ['anthropic', 'claude'],
  claude: ['claude', 'anthropic'],
  nvidia: ['英伟达'],
  lenovo: ['联想'],
  tencent: ['腾讯'],
  alibaba: ['阿里巴巴', '阿里'],
  baidu: ['百度'],
};

/**
 * Brand–domain homepage detection: e.g. "DeepSeek | 深度求索" with url deepseek.com.
 * Fires for homepage-like paths AND low-value official pages (download/docs/locale
 * pages) — e.g. "Download Claude | Claude by Anthropic" on claude.com/download.
 * News/blog paths (/news, /blog, /press) are kept — official news has investment value.
 */
function isBrandHomepage(title: string, url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Official news/blog/press pages are kept — everything else on a known brand
    // domain is treated as an official/low-value page.
    const path = (parsed.pathname || '').toLowerCase();
    if (/(^|\/)(news|blog|press)(\/|$)/.test(path)) return false;

    const host = parsed.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    // Extract the primary domain word, skipping TLDs and two-part suffixes (.com.cn, .co.uk…)
    const core = host
      .replace(/\.(com|net|org|cn|gov|edu|io|co|me|info|top|xyz)(\.\w{2})?$/, '')
      .split('.')
      .pop() || '';
    if (!core || core.length < 3 || /^\d/.test(core)) return false;

    const lowered = title.toLowerCase();
    // Also treat hosts containing a known brand key as the brand domain
    // (catches mirror/locale domains like aa-deepseek.com.cn).
    const brandKey = Object.keys(BRAND_ALIASES).find(k => host.includes(k)) || '';
    const aliases = BRAND_ALIASES[brandKey] || BRAND_ALIASES[core] || [];
    const titleHit = lowered.includes(core) || aliases.some(alias => lowered.includes(alias.toLowerCase()));
    if (!titleHit) return false;

    // Known brand domain (has alias map): any non-news page is low value.
    if (brandKey) return true;

    // Generic brand homepage: only homepage + explicit low-value paths
    if (path && path !== '/') {
      const lowValuePath = ['/download', '/downloads', '/docs', '/zh', '/zh-cn', '/cn', '/en', '/about', '/company', '/index', '/home', '/app', '/apps', '/profile'];
      const isLowValuePath = lowValuePath.some(x => path === x || path.startsWith(x + '/'));
      if (!isLowValuePath) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isLowValueContent(title: string, url: string): boolean {
  const t = title?.trim() || '';
  if (!t) return true; // empty titles are always noise

  for (const pattern of TITLE_BLOCKLIST) {
    if (t.includes(pattern)) return true;
  }
  for (const pattern of TITLE_PATTERNS) {
    if (pattern.test(t)) return true;
  }

  // Short "A | B" brand-page titles ("DeepSeek | 深度求索")
  if (BRAND_PAGE_TITLE.test(t)) return true;

  const u = url || '';
  for (const pattern of URL_BLOCKLIST) {
    if (u.includes(pattern)) return true;
  }

  return isBrandHomepage(t, u);
}
