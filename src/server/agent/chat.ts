import type { Response } from 'express';
import type { ChatMessage, ChatStreamEvent } from '../../shared/types.js';
import { MODELS } from '../ai/client.js';
import { TOOL_DEFINITIONS, executeTool, type ToolDefinition, type ToolResult } from './tools.js';

// ── PulseAI Copilot ──
// Lightweight agent loop: the model calls DB-backed tools (streamed internally),
// tool results are appended, and the final answer is streamed to the client via SSE.

const SYSTEM_PROMPT = `你是 PulseAI 的投资热点问答助手。用户会询问监控话题、热度、增速、关键词、产业链或投资相关信号。

规则：
- 优先调用工具获取真实数据，基于工具结果回答；不要编造数据库里没有的话题或数字。
- 中文回答，简洁有条理；提到具体话题时给出标题、来源、热度值/增速等关键数字。
- 如果信息不足，如实说明，并建议用户如何缩小问题（例如指定关键词、级别或时间范围）。
- 不提供具体买卖建议，只做信息整理与信号提示。
- 涉及谣言或"是否值得关注"时，引用系统已有的 isRumor / isActionable 标记。`;

interface OpenAiMessage {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface StreamCompleteOptions {
  messages: OpenAiMessage[];
  tools?: ToolDefinition[];
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
  timeoutMs?: number;
}

interface ToolCallChunk {
  id: string;
  name: string;
  arguments: string;
}

const AI_CHAT_TIMEOUT_MS = Number(process.env.AI_CHAT_TIMEOUT_MS || 240_000);
const AI_CHAT_DEADLINE_MS = Number(process.env.AI_CHAT_DEADLINE_MS || 300_000);

export function writeSse(res: Response, event: ChatStreamEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** Keep only valid chat turns, truncate long content, and cap the window. */
export function sanitizeHistory(history: unknown, max = 10): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  const out: ChatMessage[] = [];
  for (const m of history) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as any).role;
    const content = (m as any).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content: content.slice(0, 2000) });
    }
  }
  return out.slice(-max);
}

/**
 * One streaming chat completion against OpenRouter (OpenAI-compatible REST).
 * The SDK is used for the main pipeline; this helper keeps the agent loop's
 * streaming path simple and forwards text deltas as they arrive.
 */
async function streamChatComplete({
  messages,
  tools,
  onDelta,
  signal,
  maxTokens = 2048,
  timeoutMs = AI_CHAT_TIMEOUT_MS,
}: StreamCompleteOptions): Promise<{ content: string; toolCalls: ToolCallChunk[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'sk-or-v1-xxx') {
    throw new Error('未配置 OPENROUTER_API_KEY，无法使用 AI 问答');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: MODELS.fast,
        messages,
        ...(tools?.length ? { tools } : {}),
        stream: true,
        temperature: 0.3,
        max_tokens: maxTokens,
        provider: { zdr: true, sort: 'price' },
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) {
        throw new Error('问太快啦，AI 服务限流（429），请稍等片刻再试');
      }
      if (res.status >= 500) {
        throw new Error(`AI 服务暂时不可用（${res.status}），请稍后重试`);
      }
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCalls: ToolCallChunk[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, sep).replace(/\r$/, '').trim();
        buffer = buffer.slice(sep + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            onDelta?.(delta.content);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              let slot = toolCalls.find((t) => t.id && t.id === tc.id) ?? toolCalls.find((t, i) => i === index);
              if (!slot) {
                slot = { id: tc.id ?? `call_${index}`, name: '', arguments: '' };
                toolCalls.push(slot);
              }
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name += tc.function.name;
              if (tc.function?.arguments) slot.arguments += tc.function.arguments;
            }
          }
        } catch {
          // ignore malformed keep-alive/comment frames
        }
      }
    }

    return { content, toolCalls };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (signal?.aborted) {
        console.warn('[AgentChat] aborted by client disconnect');
        throw new Error('请求已取消');
      }
      if (timedOut) {
        console.warn(`[AgentChat] AI response timed out after ${Math.round(timeoutMs / 1000)}s`);
        throw new Error(`AI 响应超时（${Math.round(timeoutMs / 1000)}s），请稍后重试`);
      }
    }
    console.warn('[AgentChat] completion error:', err?.message ?? String(err));
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function runAgentChat(params: {
  message: string;
  history: ChatMessage[];
  signal: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
}): Promise<void> {
  const { message, history, signal, emit } = params;
  if (signal.aborted) throw new Error('请求已取消');

  const messages: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  emit({ type: 'status', text: '正在分析问题…' });

  const deadline = Date.now() + AI_CHAT_DEADLINE_MS;
  const remaining = (): number => Math.max(30_000, deadline - Date.now());

  const MAX_TOOL_ROUNDS = 3;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal.aborted) throw new Error('请求已取消');
    if (Date.now() >= deadline) throw new Error('问答整体超时，请换个更简单的问题重试');
    const { content, toolCalls } = await streamChatComplete({
      messages,
      tools: TOOL_DEFINITIONS,
      signal,
      maxTokens: 1024,
      timeoutMs: remaining(),
    });

    if (!toolCalls.length) {
      emit({ type: 'delta', text: content || '（没有获取到可回答的信息，请换个问法）' });
      emit({ type: 'done' });
      return;
    }

    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls.map((tc, i) => ({
        id: tc.id || `call_${round}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const [i, tc] of toolCalls.entries()) {
      const callId = tc.id || `call_${round}_${i}`;
      emit({ type: 'tool_start', name: tc.name, args: tc.arguments.slice(0, 300) });
      let result: ToolResult;
      try {
        result = await executeTool(tc.name, tc.arguments);
      } catch (err: any) {
        result = { name: tc.name, content: `工具执行失败: ${err?.message ?? String(err)}`, summary: '执行失败' };
      }
      emit({ type: 'tool_end', name: tc.name, summary: result.summary });
      messages.push({ role: 'tool', tool_call_id: callId, content: result.content });
    }
  }

  if (signal.aborted) throw new Error('请求已取消');
  emit({ type: 'status', text: '正在生成最终回答…' });
  const { content } = await streamChatComplete({
    messages,
    signal,
    maxTokens: 2048,
    timeoutMs: remaining(),
    onDelta: (text) => emit({ type: 'delta', text }),
  });
  emit({ type: 'done' });
}
