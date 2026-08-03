# 热点监控工具 — 架构设计文档

> 基于 2026-08-02 最新 API 文档调研 | 技术栈已验证

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│       Frontend: React 18 + Vite 8 + TypeScript           │
│       Tailwind CSS v4 (cyberpunk design tokens)          │
│       Recharts (charts) + GSAP (animations)              │
│       Service Worker (push notifications)                │
│       Socket.io Client (real-time events)                │
└──────────────┬──────────────────────────────────────────┘
               │  REST API + WebSocket (Socket.io)
               │  Vite proxy → Express :3456
┌──────────────▼──────────────────────────────────────────┐
│       Backend: Express.js 5.x + TypeScript               │
│       Socket.io Server (real-time bidirectional)         │
│       node-cron (30-min scheduler)                       │
└──┬──────────┬──────────┬──────────┬─────────────────────┘
   │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌──▼──┐  ┌───▼──────────┐
│Crawler│  │  AI   │  │ Notif│  │ Storage      │
│Engine │  │Pipeline│  │System│  │ Prisma+SQLite│
│cheerio│  │OpenRtr│  │WebPush│  │ (WAL mode)   │
│Twitter│  │SDK    │  │nodemail│  │              │
│Web Srch│ │       │  │       │  │              │
└───────┘  └───────┘  └──────┘  └──────────────┘
```

---

## 2. 技术栈选型（已验证）

| 层 | 选型 | 版本 | 理由 |
|----|------|------|------|
| **前端框架** | React | 18.x | 生态成熟、HMR 快速 |
| **构建工具** | Vite | 8.x | 最新版, 毫秒级HMR |
| **类型系统** | TypeScript | 5.x | 全栈类型安全 |
| **CSS** | Tailwind CSS | v4 | @tailwindcss/vite 插件, @theme 自定义设计令牌 |
| **路由** | React Router | v7 (react-router) | 统一从 react-router 导入 (不再用 react-router-dom) |
| **图表** | Recharts | 2.x | React 原生 SVG 图表 |
| **动画** | GSAP | 3.x | 高性能入场动画 |
| **后端** | Express.js | 5.2.x | 稳定、极简 |
| **数据库** | Prisma + SQLite | 5.x / 6.x | 类型安全ORM、自动迁移、Prisma Studio GUI |
| **实时通信** | Socket.io | 4.x | 双向事件通信、自动重连、房间广播、HTTP长轮询降级 |
| **爬虫** | cheerio + got | - | 轻量HTML解析 |
| **AI** | @openrouter/sdk | latest | 统一300+模型接入 |
| **Twitter** | twitterapi.io REST API | - | X-API-Key 认证, $0.15/1k tweets |
| **通知** | web-push + nodemailer | - | VAPID + SMTP |
| **调度** | node-cron | - | 定时触发爬虫 |

---

## 3. 数据源设计

### 3.1 国内平台爬虫（cheerio）

| 来源 | URL | 提取方式 | 刷新间隔 |
|------|-----|----------|----------|
| 微博热搜 | `weibo.com/ajax/side/hotSearch` | JSON接口 | 30 min |
| 知乎热榜 | `zhihu.com/hot` | cheerio解析 | 30 min |
| 百度热搜 | `top.baidu.com/board?tab=realtime` | cheerio解析 | 30 min |
| 今日头条 | `toutiao.com/hot-event` | cheerio解析 | 30 min |
| B站热门 | `api.bilibili.com/x/web-interface/popular` | REST API | 30 min |
| 36氪快讯 | `36kr.com/feed` | RSS解析 | 30 min |
| GitHub Trending | `github.com/trending` | cheerio解析 | 30 min |

### 3.2 Twitter (X) API（twitterapi.io）

**认证方式：** `X-API-Key` header
**Base URL：** `https://api.twitterapi.io/twitter/tweet/advanced_search`

```typescript
// API 调用方式（已验证）
const response = await fetch(
  'https://api.twitterapi.io/twitter/tweet/advanced_search?queryType=Latest&query=<keyword>',
  { headers: { 'X-API-Key': '<api-key>' } }
);
```

**响应结构：**
```json
{
  "tweets": [{
    "id": "string",
    "url": "string",
    "text": "string",
    "retweetCount": 123,
    "likeCount": 123,
    "replyCount": 123,
    "viewCount": 123,
    "createdAt": "string",
    "author": {
      "userName": "string",
      "name": "string",
      "followers": 123,
      "isBlueVerified": true
    },
    "entities": {
      "hashtags": [{ "text": "string" }],
      "urls": [{ "expanded_url": "string" }],
      "user_mentions": [{ "screen_name": "string" }]
    }
  }],
  "has_next_page": true,
  "next_cursor": "string"
}
```

**查询语法：** 支持高级搜索运算符
- 关键词: `"AI" OR "大模型"`
- 来源: `from:elonmusk`
- 时间: `since_time:1776045662 until_time:1776081762`
- 参考: [twitter-advanced-search](https://github.com/igorbrigadir/twitter-advanced-search)

### 3.3 通用网络搜索爬虫

通过后端直接爬取搜索引擎搜索结果页，不使用付费搜索 API。

---

## 4. 数据库设计（Prisma + SQLite）

### 4.1 Prisma 初始化

```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
```

### 4.2 Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:../data/hotmonitor.db"
}

// ── 监控关键词 ──
model Keyword {
  id              Int      @id @default(autoincrement())
  keyword         String   @unique
  category        String   @default("custom")
  isActive        Boolean  @default(true)
  priority        Int      @default(0)
  growthThreshold Float    @default(0.15)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  alerts          Alert[]
}

// ── 数据源 ──
model Source {
  id              Int      @id @default(autoincrement())
  slug            String   @unique
  name            String
  url             String
  accessType      String   @default("scrape")
  isActive        Boolean  @default(true)
  status          String   @default("ok")
  cooldownUntil   DateTime?
  lastFetchedAt   DateTime?
  fetchIntervalMs Int      @default(1800000)
  createdAt       DateTime @default(now())

  topics          Topic[]
  crawlLogs       CrawlLog[]
}

// ── 话题 ──
model Topic {
  id              Int      @id @default(autoincrement())
  title           String
  normalizedTitle String
  sourceId        Int
  sourceRank      Int?
  url             String?
  heatIndex       Float    @default(0)
  rawHeat         Float?
  growthRate      Float?
  velocityScore   Float?
  aiVerified      Int      @default(0)
  aiSummary       String?
  aiCategory      String?
  firstSeenAt     DateTime
  lastSeenAt      DateTime
  peakHeat        Float    @default(0)
  mentionCount    Int      @default(1)

  source          Source   @relation(fields: [sourceId], references: [id])
  history         TopicHistory[]
  alerts          Alert[]

  @@index([normalizedTitle])
  @@index([firstSeenAt])
  @@index([sourceId])
  @@index([velocityScore])
}

// ── 话题历史（时间序列） ──
model TopicHistory {
  id         Int      @id @default(autoincrement())
  topicId    Int
  heatIndex  Float
  sourceRank Int?
  growthRate Float?
  recordedAt DateTime @default(now())

  topic      Topic    @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@index([topicId, recordedAt])
}

// ── 告警 ──
model Alert {
  id        Int      @id @default(autoincrement())
  topicId   Int
  keywordId Int?
  alertType String
  severity  String   @default("info")
  message   String
  isRead    Boolean  @default(false)
  isSent    Boolean  @default(false)
  createdAt DateTime @default(now())

  topic     Topic    @relation(fields: [topicId], references: [id])
  keyword   Keyword? @relation(fields: [keywordId], references: [id])

  @@index([isRead, createdAt])
}

// ── 系统设置 ──
model Setting {
  key       String   @id
  value     String
  updatedAt DateTime @default(now()) @updatedAt
}

// ── 爬取日志 ──
model CrawlLog {
  id           Int      @id @default(autoincrement())
  sourceId     Int
  status       String
  topicsFound  Int      @default(0)
  durationMs   Int?
  errorMessage String?
  createdAt    DateTime @default(now())

  source       Source   @relation(fields: [sourceId], references: [id])

  @@index([sourceId, createdAt])
}
```

### 4.3 PrismaClient 使用模式（已验证 API）

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 查询 ──
// 潜力热点：按 velocity_score 排序
const trending = await prisma.topic.findMany({
  where: {
    aiVerified: 1,
    lastSeenAt: { gte: new Date(Date.now() - 6 * 3600_000) }
  },
  orderBy: { velocityScore: 'desc' },
  take: 20,
});

// 分页查询话题
const topics = await prisma.topic.findMany({
  where: { aiCategory: '科技' },
  orderBy: { firstSeenAt: 'desc' },
  skip: 0,
  take: 50,
});

// 话题详情（含关联数据）
const topic = await prisma.topic.findUnique({
  where: { id: 42 },
  include: {
    source: true,
    history: {
      orderBy: { recordedAt: 'desc' },
      take: 100,
    },
  },
});

// ── 写入 ──
// 创建话题（先去重）
const existing = await prisma.topic.findFirst({
  where: {
    normalizedTitle: 'ai大模型突破',
    lastSeenAt: { gte: new Date(Date.now() - 2 * 3600_000) }
  },
});

if (existing) {
  // 更新已有话题
  await prisma.topic.update({
    where: { id: existing.id },
    data: {
      heatIndex: weightedNewHeat,
      mentionCount: { increment: 1 },
      lastSeenAt: new Date(),
    },
  });
  // 记录历史
  await prisma.topicHistory.create({
    data: { topicId: existing.id, heatIndex: weightedNewHeat },
  });
} else {
  // 创建新话题
  await prisma.topic.create({
    data: {
      title: 'AI大模型突破',
      normalizedTitle: 'ai大模型突破',
      sourceId: 1,
      heatIndex: 85.5,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

// ── 批量事务 ──
await prisma.$transaction(
  topics.map(t => prisma.topic.create({ data: t }))
);

// ── 创建告警 ──
await prisma.alert.create({
  data: {
    topicId: 42,
    keywordId: 1,
    alertType: 'keyword_match',
    severity: 'critical',
    message: '关键词"AI大模型"匹配到热点话题',
  },
});
```

### 4.4 数据库迁移

```bash
# 开发阶段：自动迁移
npx prisma migrate dev --name init

# 生产环境：应用迁移
npx prisma migrate deploy

# 可视化浏览（Prisma Studio）
npx prisma studio
```

---

## 5. API 设计

### 5.1 基础信息

- **Base Path：** `/api/v1`
- **Content-Type：** `application/json`
- **CORS：** 允许 Vite dev server origin

### 5.2 端点列表

```
关键词
  GET    /keywords              → 列表 (?active=true)
  POST   /keywords              → 创建 { keyword, category? }
  PUT    /keywords/:id          → 更新
  DELETE /keywords/:id          → 删除
  POST   /keywords/:id/pause    → 切换激活状态

话题
  GET    /topics                → 列表 (分页、筛选、排序)
  GET    /topics/:id            → 详情
  GET    /topics/:id/history    → 时间序列 (?range=1h|6h|24h|7d)
  GET    /topics/trending       → 潜力榜 (velocity_score)
  GET    /topics/hot            → 热度榜 (heat_index)

告警
  GET    /alerts                → 列表 (?unread=true)
  POST   /alerts/:id/read       → 标记已读
  POST   /alerts/read-all       → 全部已读

系统
  GET    /sources               → 数据源健康
  GET    /stats                 → 仪表盘汇总
  GET    /stats/velocity        → 增速 Top 20
  POST   /crawl/trigger         → 手动触发爬取
  GET    /settings              → 所有配置
  PUT    /settings/:key         → 更新配置

实时
  GET    /events                → SSE 事件流

Agent Skill（供其他 AI 调用）
  GET    /agent/search?query=   → 自然语言搜索
  GET    /agent/trending        → 潜力热点
  POST   /agent/monitor         → 添加关键词
  GET    /agent/status          → 系统状态
```

### 5.3 实时通信（Socket.io 已验证）

**服务端初始化：**

```typescript
// src/server/socket.ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173' }
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // 客户端可加入房间（按分类订阅）
  socket.on('subscribe:category', (category: string) => {
    socket.join(`category:${category}`);
  });

  socket.on('subscribe:keyword', (keywordId: number) => {
    socket.join(`keyword:${keywordId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// 在爬虫/AI管线完成后广播事件
export function broadcastNewTopic(topic: Topic) {
  io.emit('new_topic', topic);                      // 所有客户端
  io.to(`category:${topic.aiCategory}`).emit('new_topic', topic); // 分类房间
}

export function broadcastAlert(alert: Alert) {
  io.emit('alert', alert);                          // 所有客户端
  if (alert.keywordId) {
    io.to(`keyword:${alert.keywordId}`).emit('alert', alert); // 关键词房间
  }
}

export function broadcastSourceStatus(sourceId: number, status: string) {
  io.emit('source_status', { sourceId, status });
}

export { io, httpServer };
```

**客户端连接（React）：**

```typescript
// src/client/src/hooks/useSocket.ts
import { io, Socket } from 'socket.io-client';
import { useEffect, useRef } from 'react';

const socket: Socket = io('http://localhost:3456', {
  autoConnect: false,
});

export function useSocket() {
  const socketRef = useRef(socket);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('Socket.io connected:', socket.id);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return socketRef.current;
}
```

**事件类型定义：**

| 事件名 | 方向 | 数据 | 说明 |
|--------|------|------|------|
| `new_topic` | 服务器→客户端 | `Topic` | 新话题被发现 |
| `alert` | 服务器→客户端 | `Alert` | 新告警 |
| `source_status` | 服务器→客户端 | `{ sourceId, status }` | 数据源状态变化 |
| `subscribe:category` | 客户端→服务器 | `string` | 订阅分类（房间） |
| `subscribe:keyword` | 客户端→服务器 | `number` | 订阅关键词（房间） |

---

## 6. AI 管线（OpenRouter SDK 已验证）

### 6.1 SDK 初始化

```typescript
// 来自 @openrouterteam/typescript-sdk 文档（已验证）
import OpenRouter from '@openrouter/sdk';

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});
```

### 6.2 模型分级

| 级别 | 模型 | 成本 | 用途 |
|------|------|------|------|
| 快速 | `google/gemini-2.5-flash` | ~$0.15/1M | 去重聚类、内容验证、关键词匹配 |
| 高质量 | `anthropic/claude-sonnet-4` | ~$3/1M | 深度分析（高增速话题） |
| 免费 | `meta-llama/llama-4-maverick` | 免费 | 批量积压数据 |

### 6.3 JSON Schema 输出（已验证 API）

```typescript
const result = await client.chat.send({
  model: 'google/gemini-2.5-flash',
  messages: [{ role: 'user', content: prompt }],
  stream: false,
  responseFormat: {
    type: 'json_schema',
    jsonSchema: {
      name: 'TopicClassification',
      schema: {
        type: 'object',
        properties: {
          classification: {
            type: 'string',
            enum: ['verified_real', 'marketing_spam', 'rumor_unverified', 'entertainment', 'evergreen_noise']
          },
          confidence: { type: 'number' },
          summary: { type: 'string' },
          category: { type: 'string', enum: ['科技', '财经', '娱乐', '社会', '体育', '国际', '教育', '健康'] },
          is_actionable: { type: 'boolean' }
        },
        required: ['classification', 'confidence', 'summary', 'category', 'is_actionable']
      }
    }
  }
});
```

### 6.4 四阶段管线

```
Crawl Complete
      │
      ▼
┌─────────────────┐
│ Stage 1: 去重聚类 │  ← gemini-2.5-flash, 50 topics/batch
│ (跨源标题合并)     │     输出: { clusters: [{ canonicalTitle, members }] }
└────────┬────────┘
         ▼
┌─────────────────┐
│ Stage 2: 内容验证 │  ← gemini-2.5-flash, 逐个cluster
│ (真实/垃圾/谣言)  │     输出: classification + summary + category
└────────┬────────┘
         ▼
┌─────────────────┐
│ Stage 3: 增速计算 │  ← Node.js 本地计算（不调用AI）
│ velocity_score   │     = growth_rate × log(heat+1) × source_diversity_factor
└────────┬────────┘
         ▼
┌─────────────────┐
│ Stage 4: 关键词匹配│  ← gemini-2.5-flash, 批量
│ (精确 + AI语义)   │     输出: { matches: [{ topicId, keywordId, confidence }] }
└────────┬────────┘
         ▼
    Save + Alert
```

### 6.5 成本估算

- 10个关键词 × 8个数据源 × 30分钟间隔
- 每轮 ~50 个原始 topic → 聚合成 ~15 个 cluster
- AI调用：聚类1次 + 验证15次 + 匹配1次 = 17次/轮 × 48轮/天 = 816次/天
- 以 gemini-2.5-flash 为主（每次约 500 tokens）：~$0.06/天

---

## 7. 前端设计

### 7.1 设计系统

**色彩方案（赛博朋克指挥中心）：**

| Token | Hex | 用途 |
|-------|-----|------|
| `--bg-root` | `#020617` | 最深页面背景 |
| `--bg-card` | `#0E1223` | 卡片表面 |
| `--bg-elevated` | `#1A1E2F` | 悬浮面板 |
| `--fg-primary` | `#F8FAFC` | 主文字 |
| `--fg-secondary` | `#94A3B8` | 次要文字 |
| `--accent-green` | `#00FF41` | 矩阵绿强调色 |
| `--accent-amber` | `#F59E0B` | 警告 |
| `--accent-red` | `#EF4444` | 严重告警 |
| `--border` | `#1E293B` | 边框 |

**字体：**
- 标题/KPI：**Orbitron** (700/900)
- 数据/代码：**JetBrains Mono** (400/500)

**关键视觉元素：**
- 扫描线叠加层（CSS animation, 3% opacity）
- 卡片顶部左边缘辉光（box-shadow 技巧）
- 状态指示器脉冲（2s 循环）
- 交错入场动画（GSAP `back.out(1.4)` 400ms / stagger 60ms）
- 热力色映射：绿(冷却/上升) → 琥珀(中) → 红(爆发)
- `prefers-reduced-motion` 适配

### 7.2 路由与页面

| 路径 | 页面 | 核心组件 |
|------|------|----------|
| `/` | DashboardPage | KpiRow, VelocityGrid, AlertFeed |
| `/topics` | TopicsPage | 筛选器, 排序, 话题列表 |
| `/topics/:id` | TopicDetailPage | TopicDetailChart, SourceTimeline, AI面板 |
| `/keywords` | KeywordsPage | CRUD表单, 关键词列表 |
| `/alerts` | AlertsPage | 告警列表, 已读/未读筛选 |
| `/sources` | SourcesPage | SourceHealthPanel |
| `/settings` | SettingsPage | 配置表单 |

### 7.3 核心组件

1. **CommandHeader** — 顶部指挥栏：Logo + 跑马灯状态 + 告警徽章 + 数字时钟
2. **KpiRow** — 4个统计卡片：活跃话题 / 增速爆发 / 今日告警 / 源在线数
3. **VelocityGrid** — 6×4 话题卡片矩阵（迷你趋势图 + 速度分 + 热力条 + 源标签）
4. **AlertFeed** — 实时告警流（严重度图标 + 标题 + 相对时间）
5. **TopicDetailChart** — 热度趋势 + 速度面积图 + 来源时间线 + AI分析面板
6. **ScanLineOverlay** — 全局扫描线CSS效果
7. **GlitchText** — 标题hover故障效果

### 7.4 Tailwind CSS v4 配置（已验证）

```typescript
// vite.config.ts — Vite 8 + Tailwind CSS v4 + Socket.io 代理
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // Tailwind v4 官方 Vite 插件
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',          // REST API → Express
      '/socket.io': {                           // Socket.io WebSocket
        target: 'http://localhost:3456',
        ws: true,
        changeOrigin: true,
      },
    }
  }
})
```

```css
/* globals.css — Tailwind v4 语法 */
@import 'tailwindcss';

@theme {
  --color-bg-root: #020617;
  --color-bg-card: #0E1223;
  --color-bg-elevated: #1A1E2F;
  --color-fg-primary: #F8FAFC;
  --color-fg-secondary: #94A3B8;
  --color-accent-green: #00FF41;
  --color-accent-amber: #F59E0B;
  --color-accent-red: #EF4444;
  --color-border: #1E293B;
  --font-heading: 'Orbitron', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

---

## 8. 通知系统

### 8.1 浏览器推送（web-push 已验证）

```typescript
// 服务端 — 来自 web-push-libs/web-push 文档
import webpush from 'web-push';

// 生成 VAPID 密钥（仅一次）
const vapidKeys = webpush.generateVAPIDKeys();

webpush.setVapidDetails(
  'mailto:admin@hotmonitor.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// 发送通知
await webpush.sendNotification(subscription, JSON.stringify({
  title: '[CRITICAL] AI大模型',
  body: 'GPT-5发布引发热议 — 已登上8个平台热搜',
  icon: '/icon-192.png',
  data: { topicId: 42, url: '/topics/42' }
}), { TTL: 3600 });
```

```typescript
// 浏览器端 — Service Worker 注册
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
});

// 发送订阅信息到服务器
await fetch('/api/v1/settings/push_subscription', {
  method: 'PUT',
  body: JSON.stringify(subscription)
});
```

### 8.2 邮件通知

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

await transporter.sendMail({
  from: process.env.SMTP_FROM,
  to: userEmail,
  subject: `[HotMonitor] ${severity} — ${topicTitle}`,
  html: `<p>${aiSummary}</p><p>来源: ${sourceCount}个平台</p><a href="${url}">查看详情</a>`,
});
```

---

## 9. 项目结构

```
ai-hotmonitor/
├── REQUIREMENTS.md              # 需求文档
├── DESIGN.md                    # 架构设计文档（本文件）
├── README.md                    # 项目说明
├── .env.example                 # 环境变量模板
├── package.json
├── vite.config.ts               # Vite + Tailwind v4 + Socket.io 代理
├── tsconfig.json
│
├── prisma/                      # Prisma ORM
│   ├── schema.prisma            # 数据模型定义
│   └── migrations/              # 迁移文件
│
├── src/
│   ├── server/                  # Express 后端
│   │   ├── index.ts             # 入口：httpServer启动 + 调度器启动
│   │   ├── socket.ts            # Socket.io Server 初始化 + 事件广播
│   │   ├── db.ts                # PrismaClient 单例
│   │   ├── crawlers/
│   │   │   ├── scheduler.ts     # CrawlScheduler: 30分钟循环 + 限速
│   │   │   ├── weibo.ts         # 微博热搜 (JSON接口)
│   │   │   ├── zhihu.ts         # 知乎热榜 (cheerio)
│   │   │   ├── baidu.ts         # 百度热搜 (cheerio)
│   │   │   ├── toutiao.ts       # 今日头条 (cheerio)
│   │   │   ├── bilibili.ts      # B站热门 (REST API)
│   │   │   ├── kr36.ts          # 36氪快讯 (RSS)
│   │   │   ├── github.ts        # GitHub Trending (cheerio)
│   │   │   ├── twitter.ts       # Twitter(X) API (twitterapi.io)
│   │   │   └── web-search.ts    # 通用搜索引擎爬虫
│   │   ├── ai/
│   │   │   ├── client.ts        # OpenRouter SDK 初始化
│   │   │   └── pipeline.ts      # 四阶段管线: 聚类→验证→增速→匹配
│   │   ├── routes/
│   │   │   ├── keywords.ts
│   │   │   ├── topics.ts
│   │   │   ├── alerts.ts
│   │   │   ├── sources.ts
│   │   │   ├── settings.ts
│   │   │   ├── stats.ts
│   │   │   └── agent.ts         # Agent Skill 端点
│   │   ├── notifications/
│   │   │   ├── browser.ts       # web-push 封装
│   │   │   └── email.ts         # nodemailer 封装
│   │   └── seed.ts              # 数据源 seed 脚本
│   │
│   ├── client/                  # React 前端
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── router.ts        # createBrowserRouter
│   │   │   ├── pages/
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── TopicsPage.tsx
│   │   │   │   ├── TopicDetailPage.tsx
│   │   │   │   ├── KeywordsPage.tsx
│   │   │   │   ├── AlertsPage.tsx
│   │   │   │   ├── SourcesPage.tsx
│   │   │   │   └── SettingsPage.tsx
│   │   │   ├── components/
│   │   │   │   ├── CommandHeader.tsx
│   │   │   │   ├── KpiRow.tsx
│   │   │   │   ├── VelocityGrid.tsx
│   │   │   │   ├── AlertFeed.tsx
│   │   │   │   ├── TopicDetailChart.tsx
│   │   │   │   ├── SourceHealthPanel.tsx
│   │   │   │   ├── ScanLineOverlay.tsx
│   │   │   │   └── GlitchText.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useSocket.ts # Socket.io 客户端连接
│   │   │   │   └── useApi.ts    # REST API 请求封装
│   │   │   └── styles/
│   │   │       └── globals.css  # Tailwind v4 @import + @theme
│   │   └── public/
│   │       ├── sw.js             # Service Worker
│   │       ├── icon-192.png
│   │       └── icon-512.png
│   │
│   └── shared/
│       └── types.ts              # 前后端共享类型
│
├── agent-skill/                  # Agent Skill 封装
│   ├── SKILL.md
│   └── agent-skill.yaml
│
└── data/                         # 运行时数据（.gitignore）
    └── hotmonitor.db
```

---

## 10. 环境变量

```bash
# .env.example

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-xxx

# Twitter API (twitterapi.io)
TWITTER_API_KEY=your-twitter-api-key

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Server
PORT=3456
DATA_DIR=./data
CRAWL_INTERVAL_MS=1800000  # 30分钟

# VAPID (auto-generated on first run)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

## 11. 实现阶段

| Phase | 内容 | 预计文件数 |
|-------|------|-----------|
| 1 | 项目骨架 + 数据库 | ~8 files |
| 2 | 爬虫引擎（10个源） | ~12 files |
| 3 | AI管线（OpenRouter） | ~3 files |
| 4 | REST API 端点 | ~10 files |
| 5 | 前端仪表盘 | ~20 files |
| 6 | 通知系统 | ~4 files |
| 7 | Agent Skill | ~2 files |
| 8 | 加固 + 测试 + 文档 | ~3 files |

---

## 12. 关键技术决策

1. **Express 5.x 而非 Next.js**：实时仪表盘不需要SSR，Express直接控制爬虫管线+Socket.io
2. **Prisma + SQLite 而非裸 better-sqlite3**：类型安全ORM、自动迁移、Prisma Studio可视化、关系管理更清晰
3. **Socket.io 而非 SSE**：支持双向通信（客户端可订阅房间）、自动重连、HTTP长轮询降级、更丰富的房间广播
4. **OpenRouter 多模型分级**：gemini-flash做批量验证，claude-sonnet仅用于深度分析
5. **velocity_score 作为核心差异化**：大多数工具关注"现在什么最火"，本工具关注"什么正在变火"
6. **Tailwind CSS v4 @theme**：语义化设计令牌，全局无硬编码颜色
