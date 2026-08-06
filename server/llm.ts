import { db } from './db.js';
import { decryptSecret } from './secret.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  supportsVision: boolean;
  configured: boolean;
}

/** 读取某个用户的 LLM 配置（解密 key） */
export function getUserLlmConfig(userId: number): LlmConfig {
  const row = db
    .prepare('SELECT base_url, model, api_key_enc, supports_vision FROM llm_settings WHERE user_id = ?')
    .get(userId) as { base_url: string; model: string; api_key_enc: string; supports_vision: number } | undefined;
  if (!row || !row.api_key_enc) {
    return { baseUrl: '', model: '', apiKey: '', supportsVision: false, configured: false };
  }
  return {
    baseUrl: (row.base_url || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    model: row.model || 'deepseek-chat',
    apiKey: decryptSecret(row.api_key_enc),
    supportsVision: !!row.supports_vision,
    configured: true,
  };
}

/**
 * 非流式对话（用于结构化解析、点评等一次性调用）。
 * 若用户未配置 key → 返回 demo:true，由调用方降级。
 */
export async function llmChat(
  userId: number,
  messages: ChatMessage[],
  timeoutMs = 60000,
): Promise<{ content: string; demo: boolean }> {
  const cfg = getUserLlmConfig(userId);
  if (!cfg.configured) return { content: '', demo: true };
  return llmChatWithConfig(cfg, messages, timeoutMs);
}

export async function llmChatWithConfig(
  cfg: LlmConfig,
  messages: ChatMessage[],
  timeoutMs = 60000,
): Promise<{ content: string; demo: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7 }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new Error(`LLM 服务返回 ${res.status}：${text}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('LLM 返回了空内容');
    return { content, demo: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式对话：SSE 转发给前端。
 * onDelta 收到增量文本；返回完整内容。
 */
export async function llmStream(
  userId: number,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
): Promise<{ content: string; demo: boolean }> {
  const cfg = getUserLlmConfig(userId);
  if (!cfg.configured) {
    onDelta('');
    return { content: '', demo: true };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`LLM 服务返回 ${res.status}：${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }
    if (!full) throw new Error('LLM 流式返回为空');
    return { content: full, demo: false };
  } finally {
    clearTimeout(timer);
  }
}

/** 拼接多模态消息（图片转 base64 data URL 传给视觉模型） */
export function buildVisionMessages(
  system: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userText: string,
  images: string[], // data URL 列表
): ChatMessage[] {
  const parts: ContentPart[] = [];
  if (userText) parts.push({ type: 'text', text: userText });
  for (const img of images) parts.push({ type: 'image_url', image_url: { url: img } });
  const msgs: ChatMessage[] = [{ role: 'system', content: system }];
  for (const h of history) msgs.push({ role: h.role, content: h.content });
  if (parts.length === 0) parts.push({ type: 'text', text: '（用户未输入文字）' });
  msgs.push({ role: 'user', content: parts });
  return msgs;
}
