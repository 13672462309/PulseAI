# ⚡ HotMonitor — AI 热点监控指挥中心

> 轻量级 AI 驱动热点监控工具，让投资者走在热点第一线

## 功能

- 🎯 **关键词监控** — 设定关键词（如"AI大模型"、"半导体"），AI 甄别真假后实时通知
- 🔥 **自动热点发现** — 每 30 分钟从 9 个数据源自动聚合热点
- 📈 **潜力热点追踪** — 基于增速评分（velocity_score）发现"正在变热"的话题
- 🤖 **AI 内容验证** — OpenRouter 多模型分级，识别营销号/谣言/标题党
- 🎨 **赛博朋克 UI** — 指挥中心风格，矩阵绿配色，响应式适配
- 🔌 **Agent Skill** — 可被其他 AI 调用查询热点

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 OPENROUTER_API_KEY

# 3. 初始化数据库
npm run db:migrate
npm run db:seed

# 4. 启动
npm run dev
```

访问 http://localhost:5173 查看仪表盘。

## 数据源

| 来源 | 类型 | 频率 |
|------|------|------|
| 微博热搜 | API | 30 min |
| 知乎热榜 | 爬虫 | 30 min |
| 百度热搜 | 爬虫 | 30 min |
| 今日头条 | 爬虫 | 30 min |
| B站热门 | API | 30 min |
| 36氪快讯 | RSS | 30 min |
| GitHub Trending | 爬虫 | 30 min |
| Twitter (X) | API | 30 min |
| 网络搜索 | 爬虫 | 30 min |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + Tailwind CSS v4 + Recharts + GSAP |
| 后端 | Express.js 5 + TypeScript |
| 数据库 | Prisma 5 + SQLite (WAL) |
| 实时通信 | Socket.io 4 |
| AI | OpenRouter (Gemini Flash + Claude Sonnet) |
| 通知 | Web Push API + Nodemailer |

## 项目结构

```
ai-hotmonitor/
├── src/
│   ├── server/          # Express 后端
│   │   ├── crawlers/    # 爬虫引擎（9个源 + 调度器）
│   │   ├── ai/          # OpenRouter AI 管线
│   │   ├── routes/      # REST API 端点
│   │   └── notifications/ # Web Push + Email
│   ├── client/          # React 前端
│   │   └── src/
│   │       ├── pages/   # 7 个页面
│   │       ├── components/ # 8 个组件
│   │       └── hooks/   # useApi, useSocket
│   └── shared/          # 共享类型定义
├── agent-skill/         # Agent Skill 封装
├── prisma/              # 数据库 Schema + 迁移
├── REQUIREMENTS.md      # 需求文档
└── DESIGN.md            # 架构设计文档
```

## API 端点

```
GET/POST    /api/v1/keywords          # 关键词管理
GET         /api/v1/topics            # 话题列表（分页/筛选/排序）
GET         /api/v1/topics/trending   # 潜力热点（增速排序）
GET         /api/v1/topics/hot        # 热度榜单
GET         /api/v1/topics/:id        # 话题详情 + 时间序列
GET/POST    /api/v1/alerts            # 告警管理
GET         /api/v1/sources           # 数据源健康
GET         /api/v1/stats             # 仪表盘统计
GET         /api/v1/stats/velocity    # 增速 Top 20
POST        /api/v1/crawl/trigger     # 手动触发爬取
GET/PUT     /api/v1/settings          # 系统设置
GET         /api/v1/agent/search      # Agent: 自然语言搜索
GET         /api/v1/agent/trending    # Agent: 潜力热点
POST        /api/v1/agent/monitor     # Agent: 添加监控
GET         /api/v1/agent/status      # Agent: 系统状态
```

## Agent Skill 使用

安装到 Claude Code 后，可通过以下命令调用：

```bash
/hotmonitor search AI大模型        # 搜索热点
/hotmonitor trending 科技           # 查看潜力热点
/hotmonitor monitor 芯片 科技       # 添加监控关键词
/hotmonitor status                 # 查看系统状态
```
