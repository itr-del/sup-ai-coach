import { Hono } from 'hono';
import { db } from '../db.js';
import { getUserLlmConfig, llmChatWithConfig } from '../llm.js';

const checkin = new Hono();

// ---------- 打卡（同一日期 upsert） ----------
checkin.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const date = String(body?.date || '');
  if (!date) return c.json({ error: '日期不能为空' }, 400);

  const fields = {
    user_id: user.id,
    date,
    workout_id: body?.workout_id ? Number(body.workout_id) : null,
    actual_detail: String(body?.actual_detail || ''),
    distance_km: body?.distance_km != null && body.distance_km !== '' ? Number(body.distance_km) : null,
    duration_min: body?.duration_min != null && body.duration_min !== '' ? Number(body.duration_min) : null,
    pace: String(body?.pace || ''),
    rpe: body?.rpe != null && body.rpe !== '' ? Number(body.rpe) : null,
    feeling: String(body?.feeling || ''),
    attachments_json: JSON.stringify(Array.isArray(body?.attachments) ? body.attachments : []),
  };

  const exists = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND date = ?').get(user.id, date);
  let id: number;
  if (exists) {
    db.prepare(
      `UPDATE checkins SET workout_id=@workout_id, actual_detail=@actual_detail, distance_km=@distance_km,
       duration_min=@duration_min, pace=@pace, rpe=@rpe, feeling=@feeling, attachments_json=@attachments_json WHERE id=@id`,
    ).run({ ...fields, id: (exists as { id: number }).id });
    id = (exists as { id: number }).id;
  } else {
    const info = db.prepare(
      `INSERT INTO checkins (user_id, date, workout_id, actual_detail, distance_km, duration_min, pace, rpe, feeling, attachments_json)
       VALUES (@user_id, @date, @workout_id, @actual_detail, @distance_km, @duration_min, @pace, @rpe, @feeling, @attachments_json)`,
    ).run(fields);
    id = Number(info.lastInsertRowid);
  }

  // 同步指标时间序列
  const metricStmt = db.prepare(
    `INSERT INTO metrics (user_id, date, metric_key, value, unit, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date, metric_key) DO UPDATE SET value=excluded.value, note=excluded.note`,
  );
  if (fields.distance_km != null) metricStmt.run(user.id, date, 'distance_km', fields.distance_km, 'km', '');
  if (fields.duration_min != null) metricStmt.run(user.id, date, 'duration_min', fields.duration_min, 'min', '');
  if (fields.rpe != null) metricStmt.run(user.id, date, 'rpe', fields.rpe, '', '');
  if (fields.pace) {
    const sec = paceToSec(fields.pace);
    if (sec) metricStmt.run(user.id, date, 'pace_sec_km', sec, 's/km', fields.pace);
  }

  const row = db.prepare('SELECT * FROM checkins WHERE id = ?').get(id);
  return c.json({ ok: true, checkin: row });
});

checkin.get('/', (c) => {
  const user = c.get('user');
  const from = c.req.query('from') || '2000-01-01';
  const to = c.req.query('to') || '2099-12-31';
  const rows = db
    .prepare('SELECT * FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC')
    .all(user.id, from, to);
  return c.json({ checkins: rows });
});

checkin.get('/date/:date', (c) => {
  const user = c.get('user');
  const date = c.req.param('date');
  const row = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date = ?').get(user.id, date);
  if (!row) return c.json({ checkin: null });
  return c.json({ checkin: row });
});

// ---------- AI 点评（对比计划 vs 实际 + 历史趋势） ----------
checkin.post('/:id/review', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const checkin = db.prepare('SELECT * FROM checkins WHERE id = ? AND user_id = ?').get(id, user.id) as
    | Record<string, any>
    | undefined;
  if (!checkin) return c.json({ error: '打卡记录不存在' }, 404);

  const cfg = getUserLlmConfig(user.id);
  if (!cfg.configured) return c.json({ error: '尚未配置 LLM API Key' }, 400);

  // 计划内容
  let planText = '（无对应计划任务）';
  if (checkin.workout_id) {
    const w = db.prepare('SELECT * FROM workouts WHERE id = ?').get(checkin.workout_id) as Record<string, any> | undefined;
    if (w) planText = `【计划】${w.title}（${w.type}）\n内容：${w.content}\n目标：${w.target_detail}`;
  }
  // 近 7 天历史
  const from = addDays(checkin.date, -6);
  const recent = db
    .prepare('SELECT date, distance_km, duration_min, pace, rpe FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC')
    .all(user.id, from, checkin.date) as Array<Record<string, any>>;

  const sys = `你是 SUP 桨板训练教练，负责点评用户的每日训练打卡。
要求：
1. 对比「计划要求」与「实际完成」，指出达成与差距
2. 结合近 7 天趋势（频率、距离、配速、RPE），给出状态判断
3. 输出三条信息：ai_review（150字内总体点评，鼓励+客观）、strengths（做得好的地方，50字内）、weaknesses（需要改进的地方，50字内）
4. 语气专业、具体、有数据支撑，不要空话

输出格式：严格 JSON，不要包含其他文字：
{"ai_review": "...", "strengths": "...", "weaknesses": "..."}`;

  const userMsg = `日期：${checkin.date}
${planText}
【实际】${checkin.actual_detail || '未填写'}
距离：${checkin.distance_km ?? '-'} km ｜ 时长：${checkin.duration_min ?? '-'} min ｜ 配速：${checkin.pace || '-'} ｜ RPE：${checkin.rpe ?? '-'}
身体感受：${checkin.feeling || '-'}
近7天记录：${JSON.stringify(recent)}`;

  const res = await llmChatWithConfig(cfg, [
    { role: 'system', content: sys },
    { role: 'user', content: userMsg },
  ]);

  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(res.content);
  } catch {
    const s = res.content.indexOf('{');
    const e = res.content.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try {
        json = JSON.parse(res.content.slice(s, e + 1));
      } catch {
        json = null;
      }
    }
  }
  if (!json) return c.json({ error: '点评生成失败，请重试' }, 500);

  db.prepare(
    `UPDATE checkins SET ai_review=?, strengths=?, weaknesses=?, reviewed_at=datetime('now') WHERE id=?`,
  ).run(json.ai_review || '', json.strengths || '', json.weaknesses || '', id);

  return c.json({ ok: true, review: { ai_review: json.ai_review, strengths: json.strengths, weaknesses: json.weaknesses } });
});

function paceToSec(pace: string): number | null {
  const m = pace.trim().match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default checkin;
