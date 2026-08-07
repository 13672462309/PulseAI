# ⚡ PulseAI — AI 热点监控指挥中心

> 关键词驱动的 AI 热点监控工具，为投资者发现对炒股有实际意义的新兴热门话题

## 功能

- 🎯 **关键词监控** — 设定关键词（如"AI大模型"、"半导体"），AI 语义判定相关性，只保留相关内容
- 🚫 **低价值内容过滤** — 规则黑名单自动拦截百科/词典/官网首页/教程/下载站/门户频道（"半导体是什么?_知乎"、"DeepSeek | 深度求索"不入库）
- 🔥 **双热度体系** — 热力值（0-100 相对分）+ 热度值（无界绝对热度，√压缩/代理源×15），24h 半衰期衰减
- 📈 **潜力话题追踪** — 热度值增速（当前−初始）发现"正在变热"的话题，三级分类（🚀爆发/🔥热点/📈潜力）每轮重算可降级
- 🤖 **AI 内容验证** — 批量判定（12条/批 × 并发2路）+ isVerified/isRumor/isActionable，入榜话题显示 ⚠️疑似谣言 / 值得关注
- 🧠 **相关性理由 + 置信度** — 每条话题给出 15-25 字匹配理由，列表默认收起、点击展开；置信度常驻
- 📊 **原始互动量** — 微博热度/标签、百度搜索指数、B站播放/弹幕/评论/收藏/点赞、HN 分数/评论；卡片主指标 + 详情分项
- 🏆 **榜单排名** — 微博/百度/B站热榜前 10 显示 `#N 来源`
- 🚦 **扫描进度** — 全局进度条实时显示百分比、阶段、当前来源与已发现条数（REST + Socket）
- 🌐 **8 数据源** — 微博/百度/B站（双通道）/36氪/搜狗（双通道）/Bing/Hacker News/通用搜索
- 🧭 **智能排序与筛选** — 综合推荐默认排序 + 最新发布/最新发现；发现时间范围、动态关键词、信息来源多选筛选，全部条件同步 URL
- 🕒 **发布/发现双时间** — 列表标注原始发布时间（B站/36氪/HN）与系统发现时间
- 📊 **7 天活跃口径** — KPI、实时列表、级别判定统一为近 7 天，超期话题自动降级
- 🎨 **深色金融仪表盘 UI** — Space Grotesk + 绿青渐变 + 玻璃拟态，SVG 图标、KPI 数字动画、渐变面积趋势图
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

> 提示：`npm run dev` 使用 `tsx watch < NUL` 解决 Windows 下 concurrently 无终端导致后端挂起的问题。若仍有异常，可分开两个终端运行 `npm run dev:server` 与 `npm run dev:client`。

## 数据源

| 来源 | 通道 | 热度值 |
|------|------|--------|
| 微博热搜 | 热榜 API | 热搜指数（真实） |
| 百度热搜 | 热榜爬虫 | 搜索指数（真实） |
| B站 | 热榜 + 关键词搜索 | 播放/互动加权（真实） |
| 36氪快讯 | API + RSS | 代理源（热力值×15） |
| 搜狗 | 热词榜 + 关键词搜索 | 代理源（热力值×15） |
| Bing 搜索 | 全关键词搜索 | 代理源（热力值×15） |
| 通用网页搜索 | 全关键词搜索 | 代理源（热力值×15） |
| Hacker News | hn.algolia.com | points+评论（真实） |

每 30 分钟自动采集一轮；仪表盘可手动「立即扫描」触发。

> v3.2 起，真实互动源额外输出结构化互动明细（engagement），话题行按来源显示主指标（如"播放 128万"），详情页展示完整分项。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite 6 + Tailwind CSS v4 + Recharts + GSAP |
| 后端 | Express.js 5 + TypeScript |
| 数据库 | Prisma 5 + SQLite (WAL) |
| 实时通信 | Socket.io 4 |
| 爬虫 | got + cheerio |
| AI | OpenRouter（deepseek-v4-flash，批量+并发+超时保护） |
| 通知 | Web Push API + Nodemailer |

## 项目结构

```
PulseAI/
├── src/
│   ├── server/          # Express 后端
│   │   ├── crawlers/    # 8 源爬虫 + 调度器 + 内容过滤 + 关键词搜索词
│   │   ├── ai/          # OpenRouter 管线（批量相关性→验证→定级）
│   │   ├── routes/      # REST API 端点
│   │   └── notifications/ # Web Push + Email
│   ├── client/          # React 前端
│   │   └── src/
│   │       ├── pages/   # 仪表盘/话题/详情/关键词/源/设置
│   │       ├── components/ # KpiRow / TopicRow / ScanStatusBar / VelocityGrid / TopicDetailChart / icons
│   │       ├── utils/   # 热度/互动量格式化
│   │       └── hooks/   # useApi, useSocket
│   └── shared/          # 共享类型定义
├── agent-skill/         # Agent Skill 封装
├── prisma/              # Schema + 10 个迁移
├── REQUIREMENTS.md      # 需求文档（v3.2）
└── DESIGN.md            # 架构设计文档（v3.2）
```

## API 端点

```
GET/POST    /api/v1/keywords          # 关键词管理（新词自动生成英文搜索词）
GET         /api/v1/topics            # 话题列表（分页/筛选/排序，默认综合推荐；关键词/来源多选、发现时间范围）
GET         /api/v1/topics/filter-options  # 筛选选项（关键词+来源，带计数）
GET         /api/v1/topics/hot        # 热度榜（热度值降序，7天窗口）
GET         /api/v1/topics/trending   # 增速榜（7天窗口）
GET         /api/v1/topics/:id        # 话题详情 + 热度趋势
GET/POST    /api/v1/alerts            # 告警管理
GET         /api/v1/sources           # 数据源健康
GET         /api/v1/stats             # 仪表盘统计（KPI）
GET         /api/v1/stats/velocity    # 增速 Top
POST        /api/v1/crawl/trigger     # 手动触发（进行中返回 409）
GET         /api/v1/crawl/status      # 扫描进度（百分比/阶段/当前来源/条数）
GET/PUT     /api/v1/settings          # 系统设置
GET         /api/v1/agent/*           # Agent 端点
```

## Agent Skill 使用

安装到 Claude Code 后，可通过以下命令调用：

```bash
/pulseai search AI大模型        # 搜索热点
/pulseai trending 科技           # 查看潜力热点
/pulseai monitor 芯片 科技       # 添加监控关键词
/pulseai status                 # 查看系统状态
```
