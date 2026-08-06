import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { clearSession, createSession, getSessionUser, setSessionCookie } from '../auth.js';

const auth = new Hono();

auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const display_name = String(body?.display_name || '').trim();
  if (!username || !password) return c.json({ error: '用户名和密码不能为空' }, 400);
  if (username.length < 2 || username.length > 32) return c.json({ error: '用户名长度需在 2-32 之间' }, 400);
  if (password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return c.json({ error: '用户名已存在' }, 409);
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)')
    .run(username, hash, display_name || username);
  const sid = createSession(Number(info.lastInsertRowid));
  setSessionCookie(c, sid);
  return c.json({ ok: true, user: { id: Number(info.lastInsertRowid), username, display_name: display_name || username } });
});

auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string; display_name: string }
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }
  const sid = createSession(row.id);
  setSessionCookie(c, sid);
  return c.json({ ok: true, user: { id: row.id, username: row.username, display_name: row.display_name } });
});

auth.post('/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

auth.get('/me', (c) => {
  const user = getSessionUser(c);
  if (!user) return c.json({ error: '未登录' }, 401);
  return c.json({ user });
});

export default auth;
