// ── Low-value content filter (rule-based) ──
// Removes encyclopedia/dictionary entries, official-site homepages, download/tutorial
// content etc. — noise that is keyword-relevant but worthless for stock-trading discovery.
// Rules are title substring matches + URL patterns + brand-domain homepage detection.

const TITLE_BLOCKLIST = [
  // encyclopedia / dictionary
  '百科', '词典', '英汉词典', '单词',
  // generic-knowledge questions
  '是什么', '是什么意思', '什么意思',
  // official sites / downloads
  '官网', '官方网站', '免费下载', '安全下载', '下载站',
  // app-download style titles ("下载DeepSeek App_...")
  'App_',
  // tutorials / how-to content
  '保姆级', '教程', '速通', '教学', '手把手', '从零开始', '零基础', '免费使用',
  // video-site / portal channel pages ("爱奇艺-电影频道", "豆瓣电影", "免费电影在线观看")
  '在线观看', '在线播放', '电影频道', '影视大全', '电影大全', '高清电影', '免费电影',
  '电影网', '影院热映', '热映电影', '豆瓣', '哔哩哔哩',
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
];

/**
 * Brand–domain homepage detection: e.g. "DeepSeek | 深度求索" with url deepseek.com.
 * Only fires for root/short paths (a real homepage), so article/video pages are safe.
 */
function isBrandHomepage(title: string, url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Only homepage-like paths (root or very short)
    const path = parsed.pathname;
    if (path && path !== '/' && path.length > 1) return false;
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    // Extract the primary domain word, skipping TLDs and two-part suffixes (.com.cn, .co.uk…)
    const core = host
      .replace(/\.(com|net|org|cn|gov|edu|io|co|me|info|top|xyz)(\.\w{2})?$/, '')
      .split('.')
      .pop() || '';
    if (!core || core.length < 3 || /^\d/.test(core)) return false;

    return title.toLowerCase().includes(core);
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

  // Short "A | B" brand-page titles ("DeepSeek | 深度求索")
  if (BRAND_PAGE_TITLE.test(t)) return true;

  const u = url || '';
  for (const pattern of URL_BLOCKLIST) {
    if (u.includes(pattern)) return true;
  }

  return isBrandHomepage(t, u);
}
