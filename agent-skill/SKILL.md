# PulseAI — AI 热点监控 Agent Skill

## 描述

PulseAI 是一个 AI 驱动的热点监控工具。它自动从多个平台（微博、知乎、百度、头条、B站、36氪、Twitter、GitHub）采集热点信息，利用 AI 甄别真假内容，并通过增速评分发现"正在变热"的潜力话题。

作为 Agent Skill，它允许其他 AI（如 Claude Code）直接调用热点查询能力。

---

## 安装

```bash
# 1. 确保 PulseAI 已安装并运行
cd PulseAI
npm install
cp .env.example .env
# 编辑 .env 填入 OPENROUTER_API_KEY
npm run db:migrate
npm run db:seed
npm run dev
```

---

## 可用操作

### 搜索热点

```
/pulseai search <关键词>
```

示例：
- `/pulseai search AI大模型`
- `/pulseai search 半导体`
- `/pulseai search 新能源汽车`

返回与该关键词匹配的当前热点话题，按增速排序。

### 查看潜力热点

```
/pulseai trending [分类]
```

示例：
- `/pulseai trending` — 全部潜力热点
- `/pulseai trending 科技` — 仅科技类
- `/pulseai trending 财经` — 仅财经类

返回增速评分最高的热点话题（"正在变热"的内容）。

### 添加监控关键词

```
/pulseai monitor <关键词> [分类]
```

示例：
- `/pulseai monitor AI大模型`
- `/pulseai monitor 芯片 科技`

系统将开始监控该关键词，当相关内容成为热点时发出告警。

### 系统状态

```
/pulseai status
```

返回当前监控状态、数据源健康状况、近期告警数量。

---

## 技术细节

- **Base URL**: `http://localhost:3456/api/v1`
- **认证**: 无需认证（本地部署）
- **数据源**: 微博、知乎、百度、头条、B站、36氪、GitHub、Twitter(X)、网络搜索
- **AI**: OpenRouter (gemini-2.5-flash / claude-sonnet-4)
- **实时推送**: Socket.io
