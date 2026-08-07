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
});

test('keeps real news / Q&A / download-count content', () => {
  assert.equal(isLowValueContent('台积电3nm量产 产能爬坡 带动设备订单', ''), false);
  assert.equal(isLowValueContent('知乎：半导体行业深度分析', 'https://www.zhihu.com/question/123'), false);
  assert.equal(isLowValueContent('某公司AI应用下载量突破1000万', ''), false);
  assert.equal(isLowValueContent('英伟达发布新一代GPU 股价大涨', ''), false);
  assert.equal(isLowValueContent('小米科技有限责任公司发布新品', ''), false);
  assert.equal(isLowValueContent('华为发布新旗舰手机 供应链受益', ''), false);
  assert.equal(isLowValueContent('Huawei unveils supernode clusters', 'https://www.huawei.com/en/news/2026/3/mwc-superpod-computing'), false);
});
