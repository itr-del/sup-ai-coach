import { Hono } from 'hono';
import { db } from '../db.js';
import { encryptSecret } from '../secret.js';

const settings = new Hono();

// ---------- 读取 LLM 配置（脱敏） ----------
settings.get('/llm', (c) => {
  const user = c.get('user');
  const row = db.prepare('SELECT * FROM llm_settings WHERE user_id = ?').get(user.id) as
    | { base_url: string; model: string; api_key_enc: string; supports_vision: number; provider: string }
    | undefined;
  if (!row || !row.api_key_enc) {
    return c.json({
      llm: { configured: false, provider: 'custom', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', supports_vision: false, api_key_masked: '' },
    });
  }
  const masked = row.api_key_enc.length > 16 ? `${row.api_key_enc.slice(0, 4)}****${row.api_key_enc.slice(-4)}` : '****';
  return c.json({
    llm: {
      configured: true,
      provider: row.provider || 'custom',
      base_url: row.base_url,
      model: row.model,
      supports_vision: !!row.supports_vision,
      api_key_masked: masked,
    },
  });
});

// ---------- 保存 LLM 配置 ----------
settings.post('/llm', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const base_url = String(body?.base_url || 'https://api.deepseek.com/v1').trim();
  const model = String(body?.model || 'deepseek-chat').trim();
  const provider = String(body?.provider || 'custom');
  const supports_vision = body?.supports_vision ? 1 : 0;
  let api_key_enc = String(body?.api_key || '').trim();

  if (!api_key_enc && body?.keep_key !== false) {
    // 未提供新 key 时保留旧 key
    const old = db.prepare('SELECT api_key_enc FROM llm_settings WHERE user_id = ?').get(user.id) as { api_key_enc: string } | undefined;
    api_key_enc = old?.api_key_enc || '';
  }
  if (!api_key_enc) return c.json({ error: 'API Key 不能为空' }, 400);

  const enc = encryptSecret(api_key_enc);
  db.prepare(
    `INSERT INTO llm_settings (user_id, provider, base_url, model, api_key_enc, supports_vision, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider, base_url=excluded.base_url, model=excluded.model,
     api_key_enc=excluded.api_key_enc, supports_vision=excluded.supports_vision, updated_at=datetime('now')`,
  ).run(user.id, provider, base_url, model, enc, supports_vision);

  return c.json({ ok: true, llm: { configured: true, provider, base_url, model, supports_vision: !!supports_vision, api_key_masked: `${api_key_enc.slice(0, 4)}****` } });
});

// ---------- 测试 LLM 连通性 ----------
settings.post('/llm/test', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const base_url = String(body?.base_url || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const model = String(body?.model || 'deepseek-chat');
  const api_key = String(body?.api_key || '').trim();
  if (!api_key) return c.json({ error: '请输入 API Key 再测试' }, 400);
  try {
    const res = await fetch(`${base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api_key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      return c.json({ ok: false, error: `HTTP ${res.status}：${text}` }, 400);
    }
    return c.json({ ok: true, message: `连接成功：${model}` });
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 400);
  }
});

export default settings;
