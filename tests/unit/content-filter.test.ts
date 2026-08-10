import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLowValueContent } from '../../src/server/crawlers/content-filter.js';

test('blocks encyclopedia/dictionary/tutorial/official noise', () => {
  assert.equal(isLowValueContent('什么是半导体', ''), true);
  assert.equal(isLowValueContent('半导体 百度百科', 'https://baike.baidu.com/item/半导体'), true);
  assert.equal(isLowValueContent('Download Claude', 'https://claude.com/download'), true);
  assert.equal(isLowValueContent('半导体 新手教程', ''), true);
  assert.equal(isLowValueContent('DeepSeek | 深度求索', 'https://deepseek.com'), true);
  assert.equal(isLowValueContent('华为技术有限公司', 'https://www.huawei.com/cn/'), true);
  assert.equal(isLowValueContent('小米科技有限责任公司', ''), true);
  assert.equal(isLowValueContent('华为-构建万物互联的世界', 'https://www.huawei.com/'), true);
  assert.equal(isLowValueContent('DeepSeek', 'https://deepseek.com/en/index.html'), true);
  assert.equal(isLowValueContent('DeepSeek | 下一代 AI 基础设施', 'https://aa-deepseek.com.cn/'), true);
  assert.equal(isLowValueContent('小米科技有限责任公司-小米商城-Xiaomi', ''), true);
  assert.equal(isLowValueContent('小米科技有限责任公司-小米商城-Xiaomi', 'https://www.mi.com/'), true);
  assert.equal(isLowValueContent('DeepSeek planning to significantly raise prices', 'https://platform.deepseek.com/usage'), true);
  // search-engine wrapper URLs must resolve before brand detection
  assert.equal(isLowValueContent('华为商城VMALL', 'https://www.bing.com/ck/a?!&&u=a1aHR0cHM6Ly93d3cudm1hbGwuY29tLw&ntb=1'), true);
  assert.equal(isLowValueContent('华为 - 构建万物互联的智能世界 - HUAWEI', 'https://www.bing.com/ck/a?!&&u=a1aHR0cHM6Ly93d3cuaHVhd2VpLmNvbS9jbi8&ntb=1'), true);
  assert.equal(isLowValueContent('iPhone - Apple', 'https://www.bing.com/ck/a?!&&u=a1aHR0cHM6Ly93d3cuYXBwbGUuY29tL2lwaG9uZS8&ntb=1'), true);
  assert.equal(isLowValueContent('小米官方。', 'http://www.bilibili.com/video/av123'), true);
  assert.equal(isLowValueContent('iPhone 17 ราคาเริ่มต้น 22,900 บาท ที่ Studio 7', 'https://www.studio7online.com/iphone-17'), true);
  assert.equal(isLowValueContent('Claude (AI) - Wikipedia', 'https://www.bing.com/ck/a?!&&u=a1aHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ2xhdWRlXyhBSSk&ntb=1'), true);
  assert.equal(isLowValueContent('DeepSeek AI Guide: Chat, Models, API & Official Links', 'https://chat-deep.ai/'), true);
  assert.equal(isLowValueContent('Claude by Anthropic - Apps on Google Play', 'https://play.google.com/store/apps/details?id=com.anthropic.claude'), true);
  assert.equal(isLowValueContent('Introducing Claude - Anthropic', 'https://www.anthropic.com/news/introducing-claude'), true);
  assert.equal(isLowValueContent('Huawei - Building a Fully Connected, Intelligent World', 'https://www.sogou.com/link?url=hedJjaC291OPspy1NwM8FLbLk3QnDTcT'), true);
});

test('keeps real news / Q&A / download-count content', () => {
  assert.equal(isLowValueContent('台积电3nm量产 产能爬坡 带动设备订单', ''), false);
  assert.equal(isLowValueContent('知乎：半导体行业深度分析', 'https://www.zhihu.com/question/123'), false);
  assert.equal(isLowValueContent('某公司AI应用下载量突破1000万', ''), false);
  assert.equal(isLowValueContent('英伟达发布新一代GPU 股价大涨', ''), false);
  assert.equal(isLowValueContent('小米科技有限责任公司发布新品', ''), false);
  assert.equal(isLowValueContent('华为发布新旗舰手机 供应链受益', ''), false);
  assert.equal(isLowValueContent('小米官方回应汽车降价传闻', ''), false);
  assert.equal(isLowValueContent('华为商城上线新品 供应链订单增加', ''), false);
  assert.equal(isLowValueContent('Huawei unveils supernode clusters', 'https://www.huawei.com/en/news/2026/3/mwc-superpod-computing'), false);
  // other official news paths stay (by design)
  assert.equal(isLowValueContent('Anthropic releases Claude 5', 'https://www.anthropic.com/news/claude-5'), false);
});
