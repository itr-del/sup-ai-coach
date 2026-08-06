import { Hono } from 'hono';
import { db } from '../db.js';
import { getUserLlmConfig, llmChatWithConfig } from '../llm.js';
import { extractVideoFrames, imageToDataUrl } from '../uploads.js';

const knowledge = new Hono();

// ---------- 创建条目 ----------
knowledge.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const source_type = String(body?.source_type || 'text');
  const title = String(body?.title || '').trim();
  const text = String(body?.text || '');
  const source_url = String(body?.source_url || '');
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

  if (!title && !text && !source_url && attachments.length === 0) {
    return c.json({ error: '内容不能为空' }, 400);
  }
  const info = db.prepare(
    `INSERT INTO knowledge (user_id, title, source_type, source_url, raw_text, attachments_json, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
  ).run(user.id, title || (source_type === 'link' ? source_url : `知识条目 ${Date.now()}`), source_type, source_url, text, JSON.stringify(attachments));
  const row = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(Number(info.lastInsertRowid));
  return c.json({ ok: true, knowledge: row });
});

knowledge.get('/', (c) => {
  const user = c.get('user');
  const rows = db.prepare('SELECT * FROM knowledge WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(user.id);
  return c.json({ knowledge: rows });
});

knowledge.get('/:id', (c) => {
  const user = c.get('user');
  const row = db.prepare('SELECT * FROM knowledge WHERE id = ? AND user_id = ?').get(Number(c.req.param('id')), user.id);
  if (!row) return c.json({ error: '知识条目不存在' }, 404);
  return c.json({ knowledge: row });
});

knowledge.delete('/:id', (c) => {
  const user = c.get('user');
  const info = db.prepare('DELETE FROM knowledge WHERE id = ? AND user_id = ?').run(Number(c.req.param('id')), user.id);
  if (info.changes === 0) return c.json({ error: '知识条目不存在' }, 404);
  return c.json({ ok: true });
});

// ---------- 解析：多模态 → 结构化知识 ----------
knowledge.post('/:id/parse', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = db.prepare('SELECT * FROM knowledge WHERE id = ? AND user_id = ?').get(id, user.id) as Record<string, any> | undefined;
  if (!row) return c.json({ error: '知识条目不存在' }, 404);

  const cfg = getUserLlmConfig(user.id);
  if (!cfg.configured) return c.json({ error: '尚未配置 LLM API Key' }, 400);

  // 收集内容
  let contentText = row.raw_text || '';
  const images: string[] = [];
  const notes: string[] = [];
  const attachments = JSON.parse(row.attachments_json || '[]') as Array<{ url: string; type: string }>;

  for (const att of attachments) {
    if (att.type === 'image') {
      const d = imageToDataUrl(att.url);
      if (d) {
        if (cfg.supportsVision) images.push(d);
        else notes.push(`[图片 ${att.url}：当前模型不支持视觉]`);
      }
    } else if (att.type === 'video') {
      const frames = extractVideoFrames(att.url, 3);
      if (frames.length > 0) {
        if (cfg.supportsVision) images.push(...frames);
        else notes.push(`[视频 ${att.url}：已抽帧但当前模型不支持视觉]`);
      }
    } else if (att.type === 'audio') {
      notes.push(`[音频 ${att.url}：音频转写暂未启用]`);
    }
  }

  // 链接抓取正文
  let fetchNote = '';
  if (row.source_type === 'link' && row.source_url) {
    try {
      const res = await fetch(row.source_url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const html = await res.text();
        contentText = stripHtml(html).slice(0, 15000);
        if (!contentText.trim()) fetchNote = '[链接页面无可提取正文，可能是 JS 渲染页面]';
      } else {
        fetchNote = `[链接抓取失败 HTTP ${res.status}，站点可能反爬]`;
      }
    } catch (e) {
      fetchNote = `[链接抓取失败：${(e as Error).message.slice(0, 80)}]`;
    }
  }

  if (!contentText.trim() && images.length === 0) {
    db.prepare(`UPDATE knowledge SET status='failed', error=? WHERE id=?`).run(fetchNote || '无内容可解析，请补充文字或图片', id);
    return c.json({ error: fetchNote || '无内容可解析，请补充文字或图片' }, 400);
  }

  const sys = `你是 SUP 桨板训练知识库的解析引擎。把用户提供的材料（文字/链接/图片/视频）拆解为结构化知识，用于支撑训练决策。
要求：
1. 提取关键知识点：技术要点、训练方法、装备知识、安全事项、体能建议等
2. 每个知识点包含：topic（主题）、keypoint（核心要点，一句话）、detail（详细说明，2-3句）
3. 给出 tags（3-6 个标签，如「技术」「平衡」「耐力」「装备」「安全」）
4. 如果材料与桨板训练无关，knowledge 输出空数组并在 summary 说明

输出格式：严格 JSON，不要包含任何其他文字：
{"title": "知识条目标题", "summary": "材料概述，50字内", "tags": ["标签1","标签2"], "knowledge": [{"topic": "主题", "keypoint": "核心要点", "detail": "详细说明"}]}`;

  const userContent = `材料类型：${row.source_type}
标题：${row.title}
正文：${(contentText || '（无正文，仅附件）').slice(0, 12000)}
${notes.length ? '附件说明：\n' + notes.join('\n') : ''}
${images.length ? `（含 ${images.length} 张图片/帧待视觉分析）` : ''}`;

  let res;
  if (images.length > 0 && cfg.supportsVision) {
    res = await llmChatWithConfig(cfg, [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: [
          { type: 'text', text: userContent },
          ...images.map((u) => ({ type: 'image_url' as const, image_url: { url: u } })),
        ],
      },
    ]);
  } else {
    res = await llmChatWithConfig(cfg, [
      { role: 'system', content: sys },
      { role: 'user', content: userContent },
    ]);
  }

  const json = extractJson(res.content);
  if (!json) {
    db.prepare(`UPDATE knowledge SET status='failed', error=? WHERE id=?`).run('解析结果不是有效 JSON', id);
    return c.json({ error: '解析失败：LLM 输出非 JSON', raw: res.content.slice(0, 300) }, 500);
  }

  db.prepare(
    `UPDATE knowledge SET title=?, structured_json=?, tags_json=?, status='parsed', error='' WHERE id=?`,
  ).run(json.title || row.title, JSON.stringify(json.knowledge || []), JSON.stringify(json.tags || []), id);

  return c.json({ ok: true, knowledge: { ...row, title: json.title || row.title, structured_json: json.knowledge || [], tags_json: json.tags || [], summary: json.summary || '', status: 'parsed' } });
});

function extractJson(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    }
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(text.slice(s, e + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default knowledge;
