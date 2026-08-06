import { Hono } from 'hono';
import { db } from '../db.js';

const profile = new Hono();

const FIELDS = [
  'nickname', 'gender', 'birth_year', 'height_cm', 'weight_kg', 'resting_hr', 'max_hr', 'vo2max',
  'experience_level', 'weekly_frequency', 'session_minutes', 'strength_score', 'endurance_score',
  'flexibility_score', 'balance_score', 'paddle_skill_score', 'medical_notes',
];

profile.get('/', (c) => {
  const user = c.get('user');
  const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
  if (!row) {
    return c.json({ profile: null });
  }
  return c.json({ profile: row });
});

profile.put('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const vals: Record<string, string | number | null> = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) {
      const v = body[f];
      vals[f] = typeof v === 'string' && v === '' ? null : v;
    }
  }
  const exists = db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(user.id);
  if (exists) {
    const sets = Object.keys(vals).map((k) => `${k} = @${k}`).join(', ');
    const sql = `UPDATE profiles SET ${sets}, updated_at = datetime('now') WHERE user_id = @user_id`;
    db.prepare(sql).run({ ...vals, user_id: user.id });
  } else {
    const keys = ['user_id', ...Object.keys(vals)];
    const sql = `INSERT INTO profiles (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`;
    db.prepare(sql).run({ ...vals, user_id: user.id });
  }
  const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
  return c.json({ ok: true, profile: row });
});

export default profile;
