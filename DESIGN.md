# PulseAI · 事件投资雷达 — 架构设计文档

> 版本: v3.7 | 2026-08-10 | 技术栈已按实际运行状态验证

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│       Frontend: React 18 + Vite + TypeScript             │
│       Tailwind CSS v4 (cyberpunk design tokens)          │
│       Recharts (charts) + GSAP (animations)              │
│       Service Worker (push notifications)                │
│       Socket.io Client (real-time events)                │
└──────────────┬──────────────────────────────────────────┘
               │  REST API + WebSocket (Socket.io)
               │  Vite proxy → Express :3456
┌──────────────▼──────────────────────────────────────────┐
│       Backend: Express.js 5.x + TypeScript               │
│       Socket.io Server（实时事件 + Copilot 问答）          │
│       node-cron 定时调度（2h）+ 手动触发                   │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┘
   │          │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌───▼────┐  ┌──▼───┐  ┌──▼──────────┐
│Crawler│  │  AI   │  │ Agent  │  │Stocks│  │ Storage      │
│Engine │  │Pipeline│  │ Chat   │  │行情   │  │ Prisma+SQLite│
│got    │  │OpenRtr│  │Socket  │  │东财   │  │ (WAL mode)   │
│cheerio│  │批量/并发│  │工具调用 │  │新浪降级│  │              │
│8 源   │  │       │  │        │  │      │  │              │
└───────┘  └───────┘  └────────┘  └──────┘  └──────────────┘
```

---

## 2. 技术栈（实际运行状态）

| 层 | 选型 | 说明 |
|----|------|------|
| **前端框架** | React 18.x | — |
| **构建工具** | Vite 6.x | dev 代理 /api 与 /socket.io 到 3456 |
| **CSS** | Tailwind CSS v4 | @theme 设计令牌（赛博朋克） |
| **路由** | react-router v7 | — |
| **图表/动画** | Recharts / GSAP | — |
| **后端** | Express.js 5.x | — |
| **数据库** | Prisma 5 + SQLite (WAL) | — |
| **实时通信** | Socket.io 4 | 实时事件 + Copilot 问答传输（chat_request / chat_event） |
| **爬虫** | got 15 + cheerio | 统一 HTTP 客户端（非 axios） |
| **AI** | @openrouter/sdk + deepseek-v4-flash | 统一模型分级；Copilot 工具调用走 OpenAI 兼容流式 REST |
| **行情数据源** | 东方财富（suggest/push2/push2his）+ 新浪 hq | 零 Key、零依赖；主源 + 降级 |
| **调度** | node-cron + 手动触发 | running 锁防并发 |
| **开发模式** | concurrently + `tsx watch --exclude ./dist --exclude ./data --exclude ./eval-reports < NUL` | 排除构建产物/数据库，避免生成中被重启 |

> **Copilot 超时配置**：`AI_CHAT_TIMEOUT_MS`（单轮，默认 240s）/ `AI_CHAT_DEADLINE_MS`（整体，默认 300s）/ `VITE_AI_CHAT_CLIENT_TIMEOUT_MS`（前端看门狗，默认 320s，须大于后端）；股价联动 `STOCK_DAILY_TOPIC_LIMIT`（默认 50）。

---

## 3. 数据源设计

### 3.1 数据源清单（8 个）

| 源 | 通道 | 热度值来源 | 说明 |
|----|------|-----------|------|
| 微博热搜 | 热榜 API | 热搜指数 raw_hot | 真实互动 |
| 百度热搜 | 热榜爬虫 | 搜索指数 hotScore | 真实互动 |
| B站 | 热榜 API + **关键词搜索**（buvid cookie） | 播放/弹幕/评论/收藏加权 | 双通道 |
| 36氪快讯 | API + RSS 兜底 | 代理源（热力值×15） | 无互动数据 |
| 搜狗 | 热词榜 + **关键词搜索**（验证码降级） | 热榜：代理源×15；搜索：代理源×15 | 双通道 |
| Bing 搜索 | 关键词搜索（全关键词） | 代理源（热力值×15） | — |
| 通用网页搜索 | Bing 关键词搜索（全关键词） | 代理源（热力值×15） | 与 Bing 选择器互补 |
| Hacker News | hn.algolia.com 关键词搜索 | points+评论 ×200 后 √压缩 | 国际社区 |

> 已删除：Twitter（twitterapi.io 无额度）、Google（news.google.com 国内不可达）。
> 微博搜索接口被风控（432/403），仅保留热榜通道。

> **v3.2**：各爬虫额外输出结构化互动明细（`engagement` JSON）——微博 `hot/tag`、百度 `hotScore`、B站 `views/danmaku/comments/favorites/likes`、HN `points/comments`；36氪/搜狗/Bing/通用搜索无互动数据，不写入。前端按来源展示主指标与详情分项。

> **v3.3**：国内搜索渠道启用中文扩展查询（原词 + 轮换变体），HN 继续使用英文翻译词；新增关键词意图上下文 `intentContext` 与命中搜索词 `searchQuery`；各来源摘要存入 `Topic.snippet`，相关性判定输入升级为“意图 + 标题 + 摘要 + 来源”。

### 3.2 关键词 → 搜索词映射

- `Keyword.searchQueries` 字段缓存英文搜索词（JSON 数组）
- **内置映射表**覆盖常见词（AI大模型→LLM/large language model…），大小写不敏感
- 未命中 → OpenRouter 生成 2-4 个英文词并缓存（创建关键词时自动触发 + 爬虫懒生成兜底）
- 国内平台（B站/搜狗/Bing）直接用关键词原文搜索

---

## 4. 热度体系（v3 核心）

### 4.1 双热度

| 概念 | 字段 | 公式 | 用途 |
|------|------|------|------|
| **热力值** heatIndex | 0-100 | 源内归一化（排名/互动） | 分级阈值判定（行内不再展示，详情页保留） |
| **热度值** heatScore | 0~数千无界 | 见下 | 排序、跨源对比、增速 |

**热度值公式：**
```
真实源（微博/百度/B站/HN）: heatScore = √(互动加权值) ÷ 2
  微博: raw_hot；百度: hotScore；B站: 播放×1+弹幕×5+评论×3+收藏×10
  HN: (points + 评论×2) × 200（补量级）
代理源（36氪/搜狗/Bing/搜索）: heatScore = 热力值 × 15
  （用户指定比例：100 热力值 = 1500 热度值）
```

**衰减**：24 小时半衰期，每轮爬取前统一衰减（`heatScore × 0.5^(小时/24)`）。

### 4.2 增速（热度值驱动）

```
growthRate = (当前热度值 − 初始热度值) ÷ 初始热度值 × 100
  初始热度值 = prevHeatScore（首次观测写入，不受衰减影响）
velocityScore = growthRate × √(热度值+1) × 来源多样性系数 ÷ 10
  来源多样性系数 = 1 + 0.2 × 同标题出现源数
```

### 4.3 三级分类（每轮全量重算，可降级）

```
热力值 ≥ 80:
   增速分 ≥ 100 → 🚀 burst 爆发
   否则         → 🔥 hot 热点
热力值 < 80:
   增速分 ≥ 30  → 📈 rising 潜力
   否则         → 无级别
```

**活跃窗口（v3.1）**：KPI、实时网格、级别判定统一采用 **7 天**口径——话题超过 7 天未再被抓到，级别自动降级为无级别，避免"僵尸级别"占用雷达首页名额。

---

## 5. AI 管线（OpenRouter，已验证）

### 5.1 模型分级

| 级别 | 模型 | 用途 |
|------|------|------|
| fast | deepseek/deepseek-v4-flash | 全部管线调用（批量判定/验证） |
| quality | deepseek/deepseek-v4-flash | 预留 |
| free | deepseek/deepseek-v4-flash:free | 预留 |

### 5.2 管线结构（批量 + 并发）

```
Crawl Complete（内容过滤后 ~280 条）
      │
      ▼
Stage 1: 关键词相关性判定（GATE）     ← deepseek-flash
  批量 12 条/批 × 并发 2 路
  不相关 → deleteMany（容错并发删除）
  AI 失败 → retried（留待下轮，不误删）
  输入: 关键词意图 + 标题 + 摘要 + 来源（结构化多行 prompt，v3.3）
  输出: relevant + matchedKeyword + confidence + reason（15-25 字理由）
  快路径已移除：标题含关键词仍需 AI 复核
      │
      ▼
Stage 2: 内容验证 verify（仅可能入榜） ← deepseek-flash
  needsVerify = 热力值≥80 或 预估增速≥30
  输出: isVerified / isRumor / isActionable（三个布尔，省 token）
  → 写入 isRumor / isActionable / aiVerified
      │
      ▼
Stage 3: 定级 classifyTiers          ← 本地计算（无 AI）
  热度值增速 + 热力值 → burst/hot/rising（全量重算）
      │
      ▼
保存（含互动明细/理由/置信度）+ 广播 + 告警
```

**扫描进度（v3.2）**：`scheduler` 维护全局 `CrawlStatus`（running/phase/progress/currentSource/topicsFound），爬取阶段按来源数 0→80%，AI 阶段按批次 82→98%，完成置 100%；通过 `GET /api/v1/crawl/status` 与 Socket `crawl_status` 推送。

**调用量控制（v3.4）**：管线只取两类话题——`matchedKeyword IS NULL`（未判定/相关性重试）与 `verifyRetry = true`（verify 失败待补）；已判定话题不再重复送 AI，级别由 `classifyTiers` 本地每轮重算。

### 5.3 AI 健壮性（关键修复）

| 问题 | 修复 |
|------|------|
| SDK 调用格式错误导致 AI 从未生效 | `chat.send({ chatRequest })` Speakeasy 包装格式 |
| DeepSeek 返回 ```json``` 围栏 | JSON.parse 前剥离围栏 |
| AI 请求挂起导致管线卡死 | 120s 超时保护（Promise.race） |
| 手动触发与定时器并发管线 | triggerCrawl 共享 running 锁（409 拒绝） |
| 删除时记录已不存在（P2025） | deleteMany 容错 |
| 删除时告警外键冲突（P2003） | Alert.topicId 级联删除 |

### 5.4 Copilot（投资问答 Agent，v3.6）

```
前端 ChatPanel（全局浮窗）
      │  Socket.io: chat_request / chat_event
      ▼
Agent 循环（最多 3 轮工具调用，每轮流式）
  工具: list_keywords / search_topics / get_topic_detail /
        get_stats / get_trending / get_stock_links
      │
      ▼
最终回答流式返回（deepseek-v4-flash，maxTokens 2048）
```

- 传输：Socket.io（`chat_request` → `chat_event`，按 requestId 关联），绕开 HTTP SSE 经开发代理不稳定问题；REST `POST /api/v1/agent/chat`（SSE）保留供调试
- 会话：无状态，前端携带最近 10 条历史（`sanitizeHistory` 校验角色/长度），并持久化到 sessionStorage
- 健壮性：单轮 240s / 整体 300s / 前端 320s 可配；429 → "问太快啦…"、5xx → "AI 服务暂时不可用"；客户端断开/停止自动 `chat_cancel` 中止后端；新提问自动顶掉残留旧请求
- 成本：工具结果截断 4000 字符、消息上限 2000 字符、200s 无响应看门狗（前端）

### 5.5 话题-股价联动（v3.7）

```
AI 管线完成
      │
      ▼
候选话题: 入榜（burst/hot/rising）+ 热度值前 10
      │
      ▼
LLM 提取公司名（标题+摘要，1-3 个，仅 A股）
      │
      ▼
公司→代码: 种子映射表 → 东财 suggest 搜索兜底 → 关键词种子兜底
      │
      ▼
行情: 东财 push2 批量实时报价（失败→新浪 hq 降级）
      │
      ▼
写入 TopicStockLink（今日涨跌 + isStale）
      │
      ▼
异动 ≥1.5% → AI 复盘（retryWithBackoff 3 次，仍失败留待下轮）
```

- 只保留今日涨跌幅（v3.7 简化：不再请求日 K 线，解决批量 K 线被风控导致 5日/发现后大量为空的问题）
- 掉出候选范围的话题保留最后一次行情并标记 `isStale`，前端显示"过去涨跌：xxx%"
- 频率与成本：按中国日历日去重——同日已抓取的话题跳过（不再重复 AI 提取/行情请求），次日自动重新处理；每轮 20 话题、每日上限 50、每话题最多 3 只；手动"刷新行情"不受同日限制

---

## 6. 内容过滤（规则黑名单）

[content-filter.ts](src/server/crawlers/content-filter.ts) 入库前统一过滤：

| 层 | 规则 | 示例 |
|----|------|------|
| 标题包含 | 百科/词典/单词/是什么/什么是/什么叫/官网/官方下载/下载/指南/教程/技巧/保姆级/新闻资讯/最新资讯/娱乐看猫眼… | Film_百度百科、什么是半导体、DeepSeek 使用技巧 |
| 标题正则 | `下载(?!量)`（排除"下载量"）、短"A \| B"品牌页 | Download Claude |
| 公司注册/商城 | `XX有限公司` 结尾；`公司名+商城/官网/首页` 组合 | 华为技术有限公司、小米科技有限责任公司-小米商城-Xiaomi |
| URL 黑名单 | baike.baidu.com / zhihu.com/topic / dramx.com / 163.com/dy/media… | 全球半导体观察 |
| 品牌-域名 | 中文别名映射 + 品牌域名（含镜像）除 news/blog/press 外全拦截 | 华为-构建万物互联的世界（huawei.com）、aa-deepseek.com.cn |

设计原则：**宁可漏网不误杀**——知乎问答/深度文章、测评/实测内容、含"下载量"的新闻均保留。

**v3.6/v3.7 增强**：

- 搜索引擎跳转壳 URL 解码（`resolveSearchUrl`）：Bing `ck/a` 的 base64 `u=` 参数、百度/搜狗 `/link?url=` 还原真实域名后再做品牌检测；爬虫入库前也先解码
- 搜狗 `/link?url=` 为不透明令牌：对疑似品牌/官方页标题用 HEAD 跟随重定向还原真实域名
- 标题规则补充：`官方商城/商城首页/VMALL/请返回商城/品质保证/百强企业/7天退货/构建万物互联/Fully Connected/Intelligent World/Wikipedia/Guide` + 短标题"品牌+官方/商城"正则
- 品牌库新增 `vmall`/`studio7`；URL 黑名单新增 `vmall.com/bnn.in.th/studio7online.com/wikipedia.org/play.google.com/istudio.store` 及旧的 Claude 发布公告页
- 存量清理脚本 `scripts/cleanup-brand-noise.ts`（dry-run 默认，`--apply` 删除），共清理 31 条

---

## 7. 数据库设计（Prisma + SQLite）

### 7.1 核心模型

```prisma
model Keyword {
  id            Int      @id @default(autoincrement())
  keyword       String   @unique
  isActive      Boolean  @default(true)
  priority      Int      @default(0)
  growthThreshold Float  @default(0.15)
  searchQueries String?  // 英文搜索词缓存（JSON 数组）
  intentContext String?  // 关键词意图上下文（投资语境/关联方向，AI 生成缓存）
  zhExpansionQueries String? // 中文扩展查询词（JSON 数组，国内渠道用）
  deletedAt     DateTime? // 软删除标记（删除=停用+隐藏话题；同名重加恢复）
}

model Topic {
  id              Int      @id @default(autoincrement())
  title           String
  normalizedTitle String
  sourceId        Int
  heatIndex       Float    @default(0)      // 热力值 0-100
  heatScore       Float?                    // 热度值（无界，√压缩/×15）
  prevHeatScore   Float?                    // 初始观测（增速基准，首次写入）
  rawHeat         Float?                    // 已停写，待删列
  growthRate      Float?                    // (当前−初始)/初始 ×100
  velocityScore   Float?
  aiVerified      Int      @default(0)
  isRumor         Boolean?                  // 疑似谣言标记
  isActionable    Boolean?                  // AI 判定值得关注
  verifyRetry     Boolean  @default(false)  // verify 失败待下轮重试
  matchReason     String?                   // AI 匹配理由（15-25 字）
  matchConfidence Float?                    // AI 匹配置信度 0-1
  engagement      String?                   // 互动明细 JSON（views/comments/points...）
  snippet         String?                   // 搜索结果摘要（判定与测试用）
  searchQuery     String?                   // 实际命中的搜索词（追踪误判来源）
  isHidden        Boolean  @default(false)  // 关键词被删除/标签失效时隐藏
  aiSummary       String?                   // 已停写，待删列
  aiCategory      String?                   // 已停写，待删列
  tier            String?                   // burst | hot | rising | null
  matchedKeyword  String?                   // 关联关键词（兼作 category 过滤字段）
  publishedAt     DateTime?                 // 原始发布时间（B站/36氪/HN 可采集，可空）
  recommendScore  Float?                    // 综合推荐分（级别权重+增速+热度+新鲜度）
  mentionCount    Int      @default(1)
  stockRecap      String?                   // AI 生成的话题-股价关联复盘（异动时生成，缓存）
}

model TopicHistory {
  topicId    Int
  heatIndex  Float
  heatScore  Float?   // 趋势图使用
  growthRate Float?
}

model TopicStockLink {
  id                Int      @id @default(autoincrement())
  topicId           Int
  stockCode         String
  stockName         String
  exchange          String   @default("A股")
  secid             String?  // 东财 secid，如 1.600519
  price             Float?
  pctToday          Float?   // 今日涨跌幅 %
  pct5d             Float?   // 已停用（保留列）
  pctSinceDiscovery Float?   // 已停用（保留列）
  trendJson         String?  // 已停用（保留列）
  isStale           Boolean  @default(false) // 掉出候选范围 → 显示"过去涨跌"
  quoteTime         DateTime?
  fetchedAt         DateTime @default(now())
  @@unique([topicId, stockCode])
}

model Alert {
  topicId   Int
  // topic 关系 onDelete: Cascade
}
```

### 7.2 迁移记录

| migration | 内容 |
|-----------|------|
| add_keyword_search_queries | Keyword.searchQueries |
| add_topic_heat_score | Topic.heatScore |
| add_prev_heat_score | Topic.prevHeatScore |
| add_history_heat_score | TopicHistory.heatScore |
| alert_topic_cascade | Alert 级联删除 |
| add_is_rumor | Topic.isRumor |
| add_published_at_and_recommend_score | Topic.publishedAt / recommendScore + 索引 |
| backfill_recommend_score | 存量话题回填综合推荐分 |
| fix_backfill_recommend_score | 修正回填（epoch 毫秒新鲜度计算） |
| add_topic_engagement_signals | Topic.matchReason / matchConfidence / engagement / isActionable |
| add_search_context_and_snippet | Keyword.intentContext / zhExpansionQueries；Topic.snippet / searchQuery |
| add_verify_retry | Topic.verifyRetry（verify 失败重试标记） |
| keyword_soft_delete_and_hide_topics | Keyword.deletedAt / Topic.isHidden（软删除 + 隐藏话题） |
| add_topic_stock_links | TopicStockLink 表 + Topic.stockRecap（股价联动） |
| topic_stock_link_stale | TopicStockLink.isStale（掉出候选范围标记"过去涨跌"） |

---

## 8. API 设计

```
关键词
  GET/POST    /api/v1/keywords            # 创建时自动生成英文搜索词
  PUT/DELETE  /api/v1/keywords/:id
  POST        /api/v1/keywords/:id/pause

话题
  GET         /api/v1/topics              # 分页/筛选（tier/keyword/keywords/sources/since/hasStocks）/排序（recommendScore 默认，白名单）
  GET         /api/v1/topics/filter-options  # 筛选选项（关键词+来源，带计数）
  GET         /api/v1/topics/hot          # 热度榜（heatScore desc，7天窗口）
  GET         /api/v1/topics/trending     # 增速榜（7天窗口）
  GET         /api/v1/topics/:id          # 详情（含 history/heatScore 趋势/stockLinks/stockRecap）
  GET         /api/v1/topics/:id/history
  POST        /api/v1/topics/:id/stocks/refresh  # 手动刷新某话题股价联动

告警 / 数据源 / 设置 / 统计
  GET/POST    /api/v1/alerts ...
  GET         /api/v1/sources             # 源健康（含24h话题数）
  GET/PUT     /api/v1/settings
  GET         /api/v1/stats               # KPI（burst/hot/rising 计数等，7天活跃口径）
  GET         /api/v1/stats/velocity

系统
  POST        /api/v1/crawl/trigger       # 手动触发（running 锁，进行中返回 409）
  GET         /api/v1/crawl/status        # 扫描进度（running/phase/progress/当前来源/条数）

Socket 事件
  new_topic / alert / source_status / crawl_status（扫描进度实时推送）
  chat_request / chat_event（Copilot 问答，requestId 关联）

Agent
  GET         /api/v1/agent/search|trending|status
  POST        /api/v1/agent/monitor
  POST        /api/v1/agent/chat          # SSE 流式问答（前端已改用 Socket.io）
```

---

## 9. 前端设计

### 9.1 页面

| 路径 | 页面 | 要点 |
|------|------|------|
| `/` | DashboardPage | KPI行（7天活跃口径，可点击跳转筛选）+ 实时话题列表（TopicRow 一行一话题，heatScore 降序，7天窗口） |
| `/topics` | TopicsPage | 筛选（发现时间范围/关键词多选/来源多选/级别/有股价联动）+ 排序（综合推荐/热度值/增速/热力值/连续上榜/最新发布/最新发现）+ 分页 + URL同步；TopicRow：榜单排名/互动量/AI 理由展开/热度值/增速/行情徽标 |
| `/topics/:id` | TopicDetailPage | 渐变面积趋势图 + 级别徽章 + #关键词 + 谣言/值得关注标记 + AI 相关性分析（理由+置信度）+ 互动数据分项 + 股价联动卡片（今日/过去涨跌 + AI 复盘 + 刷新）+ 发布时间 |
| 全局（所有页面） | ScanStatusBar | 顶部扫描进度条：百分比 + 阶段 + 当前来源 + 已发现条数；扫描完成短暂提示 |
| 全局（所有页面） | ChatPanel | 右下角投资问答浮窗：Socket.io 流式问答、工具调用日志、快捷问题、停止/清空、会话持久化 |
| `/keywords` | KeywordsPage | CRUD + 暂停/激活 |
| `/sources` | SourcesPage | 源健康 |
| `/settings` | SettingsPage | 配置 |

### 9.2 术语（v3.1 统一）

| 术语 | 对应 | 展示 |
|------|------|------|
| 热度值 | heatScore | 千分位/万格式化（1,275 / 1.2万） |
| 热力值 | heatIndex | 0-100；分级阈值与详情页指标，话题行内不再展示 |
| 增速 | velocityScore | 话题行与热度值同字号大字显示，正负着色 |
| 综合推荐 | recommendScore | 默认排序：级别权重+增速+热度+新鲜度 |
| 相关性理由/置信度 | matchReason / matchConfidence | 列表默认收起理由、点击展开；置信度常驻 |
| 互动数据 | engagement | 微博热度/标签、百度搜索指数、B站播放弹幕评论收藏点赞、HN 分数评论 |
| 榜单排名 | sourceRank | 微博/百度/B站热榜前 10 显示 `#N 来源` |
| 值得关注 | isActionable | AI 判定可行动性，展示「值得关注」徽标 |
| 发布时间 | publishedAt | 原始发布时间（B站/36氪/HN；未知显示 —） |
| 发现时间 | firstSeenAt | 首次被系统抓取/发现的时间 |
| 最新发现 | lastSeenAt | 最近一次被抓取的时间（排序用） |
| 连续上榜 | mentionCount | 同一来源连续多轮采集到该话题的次数 |
| 今日涨跌/过去涨跌 | pctToday / isStale | 关联A股最新涨跌；话题掉出候选范围后旧值显示"过去涨跌" |

---

## 10. 项目结构（实际）

```
src/
├── server/
│   ├── index.ts               # Express + 路由 + 手动触发
│   ├── socket.ts / db.ts
│   ├── crawlers/
│   │   ├── scheduler.ts       # 调度 + running 锁 + 衰减 + 内容过滤入口 + 扫描进度状态
│   │   ├── content-filter.ts  # 低价值规则过滤（v3 新增）
│   │   ├── keyword-queries.ts # 英文搜索词 + 意图上下文 + 中文扩展词（v3.3）
│   │   ├── hacker-news.ts     # HN 源（v3 新增）
│   │   ├── weibo/baidu/bilibili/kr36/sogou/bing/web-search.ts
│   │   └── utils.ts           # heatScore 公式 + normalizeTitle + UA
│   ├── ai/
│   │   ├── client.ts          # OpenRouter SDK（chatRequest 包装 + 超时 + 围栏剥离）
│   │   ├── pipeline.ts        # 批量相关性（并发2路）→ verify（子集）→ classifyTiers
│   │   └── eval/              # 相关性评估（黄金用例跑分 + AI 生成候选用例）
│   ├── agent/
│   │   ├── chat.ts            # Copilot：Agent 循环 + 流式 OpenRouter + 超时/重试
│   │   └── tools.ts           # 6 个工具定义与执行（关键词/话题/统计/增速/股价联动）
│   ├── stocks/
│   │   ├── pipeline.ts        # 股价联动刷新（候选→提取→映射→行情→复盘→isStale）
│   │   ├── provider.ts        # 东财 suggest/push2/push2his + 新浪 hq（GBK 解码）
│   │   └── company-map.ts     # 关键词 → A股种子映射表
│   ├── routes/                # keywords/topics/alerts/sources/settings/stats/agent
│   └── notifications/         # browser.ts / email.ts
├── client/src/
│   ├── pages/                 # 6 页面
│   ├── components/            # KpiRow/TopicRow/ScanStatusBar/VelocityGrid/TopicDetailChart/ChatPanel 等
│   ├── utils/format.ts        # 热度/互动量格式化 + 按来源主指标/分项
│   └── hooks/                 # useApi / useSocket
├── shared/types.ts
├── tests/                     # 单元/集成测试（含 stocks 测试）+ relevance 黄金用例（68 条）
└── scripts/                   # 数据治理：官网/公司页清理、品牌噪音清理、重复话题合并
```

---

## 11. 关键设计决策（v3.7）

1. **got + cheerio 而非 axios**：功能等价、内置重试/超时，保持现有稳定实现
2. **双热度体系**：热力值（0-100 阈值/详情页）+ 热度值（无界真实量级）分离，避免归一化抹平量级
3. **√ 压缩热度值**：范围紧凑（几千封顶）且保留 10 倍量级差异；代理源线性 ×15（用户指定）
4. **增速用初始值基准**：对比首观，不受衰减干扰，简单可解释
5. **批量 + 并发 + 超时**：管线 22 分钟 → 5-10 分钟，AI 失败不误删
6. **规则过滤前置**：零成本拦截百科/官网/教程，减少 AI 调用与列表噪音
7. **verify 精简且子集化**：仅对可能入榜话题调用，输出收敛为 isVerified/isRumor/isActionable 三个布尔（省 token、提速且语义等价）
8. **`tsx watch < NUL`**：解决 Windows 下 concurrently 无 TTY 挂起（stdin 空设备）
9. **手动触发与定时器共享 running 锁**：杜绝并发管线数据竞争
10. **综合推荐分（recommendScore）**：级别权重 + 增速 + 热度 + 新鲜度，作为默认排序，让"正在爆发/上升"的话题优先于死热度霸榜
11. **7 天活跃窗口统一口径**：KPI/实时网格/级别判定共用同一窗口，超过 7 天未再被抓到自动降级，消除"僵尸级别"与数字不一致
12. **发布/发现双时间**：`publishedAt`（可空）与 `firstSeenAt`/`lastSeenAt` 分离，避免用发现时间冒充发布时间
13. **排序白名单**：topics 排序字段白名单校验，杜绝非法字段注入导致 500
14. **36氪 RSS 兜底可达**：JSON API 任意失败（含解析失败）都会降级 RSS，避免整源空手而归
15. **UI UX Pro Max 设计系统**：深色金融仪表盘风格（Space Grotesk + 绿青渐变 + 玻璃拟态），SVG 图标替换 emoji，KPI 数字动画与渐变面积图
16. **AI 输出最小化**：相关性输出增加 reason 字段（成本可忽略），verify 删除 classification/confidence（从未落库），管线响应更短更快
17. **互动明细结构化**：`engagement` JSON 保留平台原生指标（展示与热度计算解耦），rawHeat 加权汇总停止写入
18. **一行一话题 TopicRow**：全宽行 + 可扫读布局，理由默认收起、展开查看，降低信息密度换取判断效率
19. **扫描状态可观测**：内存级 CrawlStatus + REST 轮询 + Socket 推送；进度 = 爬取 0-80% + AI 82-98% + 完成 100%
20. **废弃字段先停写后删列**：aiSummary/aiCategory/rawHeat 停止写入并从 API 移除，列保留待后续 migration 删除
21. **榜单排名防误导**：仅微博/百度/B站热榜前 10 显示 #N，搜索/快讯源的序号不当作排名展示
22. **中文扩展与英文翻译分离**：国内渠道用 `zhExpansionQueries`（原词恒在 + 变体轮换），HN 用英文 `searchQueries`；记录命中词 `searchQuery` 用于追踪误判来源
23. **意图上下文驱动**：`intentContext` 同时服务扩展词生成与相关性判定，并可用显式排除（二手回收/教程技巧/第三方改装/营销活动）收紧边界
24. **判定输入结构化**：标题/摘要/来源/意图分开展示，摘要作为标题不足时的主要依据；移除“标题含词即放行”快路径（评估实测精确率 72.7% → 88.9%）
25. **评估体系可量化**：68 条黄金用例 + 单元/集成测试 + `npm run eval:relevance` 输出 P/R/F1、混淆矩阵与错误样例，所有改动先跑分后上线
26. **AI 调用最小化**：管线只处理“未判定”与“verify 待重试”，已判定话题由本地 classifyTiers 重算；verifyRetry 保证失败可补且不重判
27. **内容过滤品牌强规则**：品牌域名（含镜像）非新闻页全拦截 + 中文别名 + 公司注册/商城标题规则，官网新闻路径保留
28. **7 天查重窗口**：话题身份窗口与活跃窗口统一，7 天内重现合并、超期视为新话题；存量重复合并脚本兜底
29. **关键词软删除**：删除=停用+隐藏话题（deletedAt/isHidden），同名重加恢复；所有查询限定仍存在的关键词
30. **调度间隔 2 小时**：扫描周期与扩展词轮换统一为 7200000ms，降低爬取与 AI 频率
31. **matchedKeyword 归一化校验（v3.5）**：模型返回的关键词标签先与激活列表比对（大小写/空白/包含），防止别名/翻译变体导致话题失联
32. **聊天走 Socket.io 而非 HTTP SSE（v3.6）**：开发代理下长连接不稳定（服务端写完但浏览器收不到），WebSocket 复用现有通道更可靠
33. **前端会话持久化（v3.6）**：聊天记录写 sessionStorage、done/error 同步落盘，刷新/HMR 不丢
34. **超时参数化 + 友好错误（v3.6）**：240/300/320s 三级可配；429/5xx 转中文提示；超时主动 chat_cancel 后端
35. **搜索引擎跳转壳 URL 解码（v3.6/v3.7）**：Bing base64 `u=`、百度/搜狗 `/link?url=` 还原真实域名，品牌检测才能生效；搜狗不透明令牌用 HEAD 跟随
36. **公司识别三层解析（v3.7）**：LLM 只提取公司名，代码/关联由种子映射表 → 东财搜索 → 关键词种子兜底确定性完成，避免幻觉代码
37. **联动指标只保留今日涨跌（v3.7）**：去掉日 K 线（批量请求易被风控导致 5日/发现后大面积为空）；掉出候选范围显示"过去涨跌"（isStale）
38. **复盘失败重试（v3.7）**：retryWithBackoff 3 次（1s/3s），仍失败留待下一轮刷新，避免 429 导致复盘永久缺失
