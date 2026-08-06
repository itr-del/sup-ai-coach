import { Hono } from 'hono';
import { db } from '../db.js';

const plan = new Hono();

// ---------- 目标 ----------
plan.get('/goals', (c) => {
  const user = c.get('user');
  const rows = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC').all(user.id);
  return c.json({ goals: rows });
});

plan.post('/goals', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const info = db.prepare(
    `INSERT INTO goals (user_id, title, target_distance_km, target_time_min, target_pace_km, target_date, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
  ).run(
    user.id,
    String(body?.title || '我的训练目标'),
    body?.target_distance_km != null ? Number(body.target_distance_km) : null,
    body?.target_time_min != null ? Number(body.target_time_min) : null,
    String(body?.target_pace_km || ''),
    String(body?.target_date || ''),
  );
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(Number(info.lastInsertRowid));
  return c.json({ ok: true, goal: row });
});

plan.patch('/goals/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const exists = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!exists) return c.json({ error: '目标不存在' }, 404);
  const sets: string[] = [];
  const vals: Record<string, unknown> = { id };
  for (const k of ['title', 'target_distance_km', 'target_time_min', 'target_pace_km', 'target_date', 'status']) {
    if (body[k] !== undefined) {
      sets.push(`${k} = @${k}`);
      vals[k] = body[k];
    }
  }
  if (sets.length > 0) db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = @id`).run(vals);
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  return c.json({ ok: true, goal: row });
});

plan.delete('/goals/:id', (c) => {
  const user = c.get('user');
  const info = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(Number(c.req.param('id')), user.id);
  if (info.changes === 0) return c.json({ error: '目标不存在' }, 404);
  return c.json({ ok: true });
});

// ---------- 计划 ----------
plan.get('/plans', (c) => {
  const user = c.get('user');
  const rows = db.prepare('SELECT * FROM training_plans WHERE user_id = ? ORDER BY id DESC').all(user.id);
  return c.json({ plans: rows });
});

plan.get('/plans/:id', (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = db.prepare('SELECT * FROM training_plans WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!row) return c.json({ error: '计划不存在' }, 404);
  const workouts = db.prepare('SELECT * FROM workouts WHERE plan_id = ? ORDER BY date ASC').all(id);
  return c.json({ plan: row, workouts });
});

plan.delete('/plans/:id', (c) => {
  const user = c.get('user');
  const info = db.prepare('DELETE FROM training_plans WHERE id = ? AND user_id = ?').run(Number(c.req.param('id')), user.id);
  if (info.changes === 0) return c.json({ error: '计划不存在' }, 404);
  return c.json({ ok: true });
});

// ---------- 训练任务 ----------
plan.patch('/workouts/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const exists = db.prepare('SELECT w.id FROM workouts w JOIN training_plans p ON p.id = w.plan_id WHERE w.id = ? AND w.user_id = ?').get(id, user.id);
  if (!exists) return c.json({ error: '训练任务不存在' }, 404);
  if (body.status) db.prepare("UPDATE workouts SET status = ? WHERE id = ?").run(String(body.status), id);
  const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id);
  return c.json({ ok: true, workout: row });
});

export default plan;
