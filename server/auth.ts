import crypto from 'node:crypto';
import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db } from './db.js';

export const COOKIE_NAME = 'sup_sid';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser;
  }
}

export function createSession(userId: number): string {
  const sid = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sid, userId, expires);
  return sid;
}

export function setSessionCookie(c: Context, sid: string) {
  setCookie(c, COOKIE_NAME, sid, { httpOnly: true, maxAge: SESSION_TTL_MS / 1000, path: '/', sameSite: 'Lax' });
}

export function clearSession(c: Context) {
  const sid = getCookie(c, COOKIE_NAME);
  if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function getSessionUser(c: Context): SessionUser | null {
  const sid = getCookie(c, COOKIE_NAME);
  if (!sid) return null;
  const row = db
    .prepare('SELECT u.id, u.username, u.display_name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?')
    .get(sid) as (SessionUser & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    return null;
  }
  return { id: row.id, username: row.username, display_name: row.display_name };
}

const PUBLIC_PATHS = new Set(['/api/auth/register', '/api/auth/login', '/api/health']);

export async function authMiddleware(c: Context, next: Next) {
  if (PUBLIC_PATHS.has(c.req.path)) return next();
  const user = getSessionUser(c);
  if (!user) return c.json({ error: '未登录' }, 401);
  c.set('user', user);
  return next();
}
