import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db.js';
import { buildVisionMessages, getUserLlmConfig, llmChatWithConfig, llmStream, type ChatMessage } from '../llm.js';
import { extractVideoFrames, imageToDataUrl, audioMeta } from '../uploads.js';

const assess = new Hono();

const ASSESS_SYSTEM = `你是「SUP 桨板 AI 教练」的技能评估专家。你的任务是通过对话全面了解用户的桨板（SUP）技能水平，包括：
1. 划桨技术（桨法、站姿、平衡、转向、急停等）
2. 体能基础（心肺耐力、上肢/核心力量、柔韧性、平衡能力）
3. 经验与训练史（划龄、频次、最长距离、比赛经历）
4. 短板与痛点（怕水、腰酸、走板不稳、划不快等）
5. 训练条件（水域、器材、可训练时间）

要求：
- 一次聚焦 1-2 个问题，用轻松专业的语气，像私人教练一样。
- 用户上传的图片/视频要结合分析（姿势、装备、水域）。
- 信息足够后，提示用户点击「完成评估」，不要自行结束。

每次对话都要基于已有信息追问缺失的关键维度，不要重复已获得的信息。`;

const DIMENSION_KEYS = ['paddle_skill', 'balance', 'endurance', 'strength', 'flexibility', 'technique'];

// ---------- 会话管理 ----------
assess.post('/', (c) => {
  const user = c.get('user');
  const info = db
    .prepare('INSERT INTO assessments (user_id) VALUES (?)')
    .run(user.id);
  const id = Number(info.lastInsertRowid);
  // 写入开场白
  const opening = '你好！我是你的 SUP 桨板 AI 教练 🏄‍♂️ 先聊聊你的桨板基础吧——你玩桨板多久了？平时多久划一次？';
  db.prepare('INSERT INTO assessment_messages (assessment_id, role, content) VALUES (?, ?, ?)').run(id, 'assistant', opening);
  return c.json({ ok: true, id, opening });
});

assess.get('/', (c) => {
  const user = c.get('user');
  const rows = db
    .prepare('SELECT * FROM assessments WHERE user_id = ? ORDER BY id DESC LIMIT 20')
    .all(user.id);
  return c.json({ assessments: rows });
});

assess.get('/:id/messages', (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const a = db.prepare('SELECT * FROM assessments WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!a) return c.json({ error: '评估会话不存在' }, 404);
  const msgs = db
    .prepare('SELECT * FROM assessment_messages WHERE assessment_id = ? ORDER BY id ASC')
    .all(id);
  return c.json({ messages: msgs, assessment: a });
});

// ---------- 流式对话 ----------
assess.post('/:id/chat', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const a = db.prepare('SELECT * FROM assessments WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!a) return c.json({ error: '评估会话不存在' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body?.text || '');
  const attachments: Array<{ url: string; type: string }> = Array.isArray(body?.attachments) ? body.attachments : [];

  const cfg = getUserLlmConfig(user.id);
  if (!cfg.configured) {
    return c.json({ error: '尚未配置 LLM API Key，请先到「设置」页配置' }, 400);
  }

  // 处理多模态附件
  const images: string[] = [];
  const notes: string[] = [];
  for (const att of attachments) {
    if (att.type === 'image') {
      const dataUrl = imageToDataUrl(att.url);
      if (dataUrl) {
        if (cfg.supportsVision) images.push(dataUrl);
        else notes.push(`[用户上传了图片 ${att.url}，但当前模型不支持视觉，无法分析图片]`);
      }
    } else if (att.type === 'video') {
      const frames = extractVideoFrames(att.url, 3);
      if (frames.length > 0) {
        if (cfg.supportsVision) images.push(...frames);
        else notes.push(`[用户上传了视频 ${att.url}，已抽帧但当前模型不支持视觉]`);
      }
    } else if (att.type === 'audio') {
      const meta = audioMeta(att.url);
      notes.push(`[用户上传了音频 ${att.url}（${meta.durationSec.toFixed(0)}秒），音频转写暂未启用，请提醒用户用文字描述内容]`);
    }
  }
  const userContent = [text, ...notes].filter(Boolean).join('\n');

  // 保存用户消息
  db.prepare(
    'INSERT INTO assessment_messages (assessment_id, role, content, attachments_json) VALUES (?, ?, ?, ?)',
  ).run(id, 'user', userContent || '（无文字，仅附件）', JSON.stringify(attachments));

  // 历史
  const history = db
    .prepare("SELECT role, content FROM assessment_messages WHERE assessment_id = ? AND role IN ('user','assistant') AND content != '' ORDER BY id ASC")
    .all(id) as Array<{ role: 'user' | 'assistant'; content: string }>;
  // 排除刚插入的这条（保留给 assistant 拼接时用不到），构造 messages
  const histMsgs: ChatMessage[] = [{ role: 'system', content: ASSESS_SYSTEM }];
  for (const h of history) {
    if (h.content.startsWith('（无文字，仅附件）') && h.role === 'user') continue;
    histMsgs.push({ role: h.role, content: h.content });
  }
  if (images.length > 0) {
    histMsgs.push({ role: 'user', content: [{ type: 'text', text: userContent || '请分析我上传的图片/视频' }, ...images.map((u) => ({ type: 'image_url' as const, image_url: { url: u } }))] });
  }

  // 流式返回
  return streamSSE(c, async (s) => {
    let full = '';
    const { demo } = await llmStream(user.id, histMsgs, (delta) => {
      full += delta;
      s.writeSSE({ data: JSON.stringify({ delta }) });
    });
    if (demo) {
      const fallback = '（未配置 LLM Key，无法生成回复。请到「设置」配置 API Key 后重试。）';
      full = fallback;
      await s.writeSSE({ data: JSON.stringify({ delta: fallback }) });
    }
    db.prepare('INSERT INTO assessment_messages (assessment_id, role, content) VALUES (?, ?, ?)').run(id, 'assistant', full);
    db.prepare("UPDATE assessments SET updated_at = datetime('now') WHERE id = ?").run(id);
    await s.writeSSE({ data: JSON.stringify({ done: true, full }) });
  });
});

// ---------- 完成评估：生成结构化技能维度 ----------
assess.post('/:id/complete', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const a = db.prepare('SELECT * FROM assessments WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!a) return c.json({ error: '评估会话不存在' }, 404);
  const cfg = getUserLlmConfig(user.id);
  if (!cfg.configured) return c.json({ error: '尚未配置 LLM API Key' }, 400);

  const history = db
    .prepare("SELECT role, content FROM assessment_messages WHERE assessment_id = ? AND role IN ('user','assistant') ORDER BY id ASC")
    .all(id) as Array<{ role: string; content: string }>;
  const transcript = history.map((h) => `${h.role === 'user' ? '用户' : '教练'}: ${h.content}`).join('\n');

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id) as Record<string, unknown> | undefined;
  const profileText = profile
    ? `身体画像：${JSON.stringify({
        身高: profile.height_cm, 体重: profile.weight_kg, 静息心率: profile.resting_hr,
        经验等级: profile.experience_level, 周频次: profile.weekly_frequency,
        力量: profile.strength_score, 耐力: profile.endurance_score, 柔韧: profile.flexibility_score,
        平衡: profile.balance_score, 划桨技术: profile.paddle_skill_score,
      })}`
    : '身体画像：未填写';

  const sys = `你是 SUP 桨板技能评估分析专家。根据以下对话记录和身体画像，输出用户的结构化技能评估。
输出格式：严格 JSON，不要包含任何其他文字。
{
  "skill_level": "beginner|novice|intermediate|advanced",
  "summary": "50字以内的总体评估",
  "dimensions": [
    {"key": "paddle_skill", "name": "划桨技术", "score": 1-10, "note": "一句话评价"},
    {"key": "balance", "name": "平衡能力", "score": 1-10, "note": "一句话评价"},
    {"key": "endurance", "name": "心肺耐力", "score": 1-10, "note": "一句话评价"},
    {"key": "strength", "name": "力量基础", "score": 1-10, "note": "一句话评价"},
    {"key": "flexibility", "name": "柔韧协调", "score": 1-10, "note": "一句话评价"},
    {"key": "technique", "name": "技术细节", "score": 1-10, "note": "一句话评价"}
  ]
}`;

  const res = await llmChatWithConfig(cfg, [
    { role: 'system', content: sys },
    { role: 'user', content: `${profileText}\n\n对话记录：\n${transcript.slice(-6000)}` },
  ]);

  const json = extractJson(res.content);
  if (!json || !json.dimensions) return c.json({ error: '评估结果解析失败，请重试', raw: res.content.slice(0, 500) }, 500);

  // 归一化维度
  const dims = DIMENSION_KEYS.map((key) => {
    const found = json.dimensions.find((d: Record<string, unknown>) => d.key === key);
    return found
      ? { key, name: found.name, score: clampScore(found.score), note: String(found.note || '') }
      : { key, name: key, score: 5, note: '' };
  });

  db.prepare(
    `UPDATE assessments SET status='completed', skill_level=?, summary=?, dimensions_json=?, updated_at=datetime('now') WHERE id=?`,
  ).run(json.skill_level || 'beginner', json.summary || '', JSON.stringify(dims), id);

  return c.json({ ok: true, assessment: { id, skill_level: json.skill_level, summary: json.summary, dimensions: dims } });
});

// ---------- 生成训练计划 ----------
assess.post('/:id/plan', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const a = db.prepare('SELECT * FROM assessments WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!a) return c.json({ error: '评估会话不存在' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const goal = body?.goal || {};
  const weeks = Math.min(Math.max(Number(body?.weeks || 4), 1), 16);
  const startDate = String(body?.start_date || today());

  const cfg = getUserLlmConfig(user.id);
  if (!cfg.configured) return c.json({ error: '尚未配置 LLM API Key' }, 400);

  const dimensions = JSON.parse(a.dimensions_json || '[]');
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id) as Record<string, unknown> | undefined;

  const sys = `你是专业的 SUP 桨板训练计划制定专家。基于用户的技能评估、身体画像和目标，制定 ${weeks} 周训练计划。
输出格式：严格 JSON，不要包含任何其他文字。
{
  "title": "计划名称，如「6km 配速突破 4 周计划」",
  "phases": [{"name": "阶段名如「基础适应」", "weeks": 1, "desc": "阶段说明"}],
  "workouts": [
    {"date": "YYYY-MM-DD（从 ${startDate} 开始按天排，每周 3-5 次训练，休息日不排）", "phase": "阶段名", "type": "technique|endurance|speed|strength|recovery", "title": "训练名", "content": "详细训练内容（含热身/主体/放松）", "target_detail": "目标量化指标（距离/配速/时长/RPE）"}
  ]
}
注意：phases 的 weeks 之和必须等于 ${weeks}。workouts 数量 = 每周训练次数 × ${weeks}。`;

  const userMsg = `技能评估：${JSON.stringify(dimensions)}
身体画像：${JSON.stringify(profile || {})}
目标：${JSON.stringify(goal)}`;

  const res = await llmChatWithConfig(cfg, [
    { role: 'system', content: sys },
    { role: 'user', content: userMsg },
  ], 180000);

  const json = extractJson(res.content);
  if (!json || !Array.isArray(json.workouts) || json.workouts.length === 0) {
    return c.json({ error: '计划生成失败，请重试', raw: res.content.slice(0, 500) }, 500);
  }

  // 存目标（如果有）
  let goalId: number | null = null;
  if (goal.title || goal.target_distance_km) {
    const g = db.prepare(
      `INSERT INTO goals (user_id, title, target_distance_km, target_time_min, target_pace_km, target_date, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    ).run(user.id, goal.title || '我的目标', goal.target_distance_km || null, goal.target_time_min || null, goal.target_pace_km || '', goal.target_date || '');
    goalId = Number(g.lastInsertRowid);
  }

  // 存计划
  const planInfo = db.prepare(
    'INSERT INTO training_plans (user_id, goal_id, title, start_date, end_date, phases_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(user.id, goalId, json.title || '训练计划', startDate, addDays(startDate, weeks * 7 - 1), JSON.stringify(json.phases || []));
  const planId = Number(planInfo.lastInsertRowid);

  // 存 workouts
  const insert = db.prepare(
    `INSERT INTO workouts (plan_id, user_id, date, phase, day_index, type, title, content, target_detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let idx = 0;
  for (const w of json.workouts) {
    if (!w.date) continue;
    insert.run(planId, user.id, w.date, w.phase || '', idx++, w.type || 'endurance', w.title || '', w.content || '', w.target_detail || '');
  }

  return c.json({ ok: true, planId, title: json.title, workoutCount: idx });
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

function clampScore(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default assess;
