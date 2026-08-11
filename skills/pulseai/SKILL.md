---
name: pulseai
description: 搜索并分析全网热点的自包含技能。当用户想查询热点话题、搜索关键词相关新闻或动态、查看微博/百度/B站/36氪/搜狗/Bing/通用搜索/Hacker News 等来源的候选热点，或要求做热点相关性判断时使用。搜索由内置 Python 脚本完成，不需要后端、数据库或 API Key；相关性分析与价值判断由当前 AI 模型自己完成。
---

# PulseAI 事件投资雷达搜索

## 工作方式

本技能不调用外部 AI API，也不依赖任何后端服务。`scripts/pulseai.py` 只负责抓取候选内容并做基础过滤；语义相关性、谣言风险、投资价值等判断由当前会话的 AI 模型完成（例如 Claude Code 接入 DeepSeek 时，就由 DeepSeek 完成分析）。

## 运行脚本

用当前环境中的 Python 执行，优先使用 `--json` 获取结构化候选：

```bash
python <skill目录>/scripts/pulseai.py search "<关键词>" --json --limit 80
python <skill目录>/scripts/pulseai.py hot --json --limit 50
python <skill目录>/scripts/pulseai.py scan --json
python <skill目录>/scripts/pulseai.py sources --json
```

在 Claude Code 中，可用 `${CLAUDE_SKILL_DIR}/scripts/pulseai.py` 代替 `<skill目录>`。其他工具按本 `SKILL.md` 所在目录解析脚本路径。

可选参数：

- `--sources weibo,baidu,hacker-news`：只跑指定来源
- `--limit N`：限制输出条数
- `scan [关键词]`：不带关键词时全量扫描；带关键词时各搜索源按关键词查询

## 分析步骤

拿到 `topics` 后，逐条执行：

1. 判断是否与用户关键词/意图语义相关，不能只做字符串包含。
2. 剔除低价值噪音：百科、词典、官网、教程、下载站、营销活动、无实质产业动态。
3. 保留真实新闻、公司动态、政策、产业链事件，并结合 `heatIndex`/`heatScore` 给出优先级。
4. 为保留结果输出：标题、来源、链接、热度值、匹配理由、置信度（0-1）。
5. 某个来源失败时在回答中注明降级，不影响其他来源的结果。

## 输出格式

默认用中文回答：先给结论（当前最值得关注的话题），再列候选；每条包含来源和链接。用户要求结构化输出时，直接返回 JSON。

## 注意事项

- 脚本无状态：每次运行只返回临时结果，不写数据库、不修改项目代码。
- 网络请求由脚本完成；机器无法访问某些来源时，对应来源会标记为失败。
- 不要调用外部 AI API 做相关性判断，分析必须由当前 AI 模型完成。
