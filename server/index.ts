import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { authMiddleware } from './auth.js';
import { migrate } from './db.js';
import assess from './routes/assess.js';
import auth from './routes/auth.js';
import checkin from './routes/checkin.js';
import dashboard from './routes/dashboard.js';
import knowledge from './routes/knowledge.js';
import plan from './routes/plan.js';
import profile from './routes/profile.js';
import settings from './routes/settings.js';
import upload from './routes/upload.js';

// ---------- 初始化 ----------
migrate();
console.log('[sup-coach] 数据库初始化完成');

const app = new Hono();

app.onError((err, c) => {
  console.error('[sup-coach] 未捕获异常：', err);
  return c.json({ error: '服务器内部错误' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true, name: 'sup-coach', ts: Date.now() }));

// ---------- API（除 register/login/health 外全部需登录）----------
app.use('/api/*', authMiddleware);

const api = new Hono();
api.route('/auth', auth);
api.route('/profile', profile);
api.route('/assessments', assess);
api.route('/checkins', checkin);
api.route('/dashboard', dashboard);
api.route('/knowledge', knowledge);
api.route('/plan', plan);
api.route('/settings', settings);
api.route('/upload', upload);
app.route('/api', api);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404);
  return c.json({ error: '接口不存在' }, 404);
});

// ---------- 上传文件静态托管 ----------
app.use('/uploads/*', serveStatic({ root: './data' }));

// ---------- 前端静态托管 + SPA fallback ----------
const DIST = path.resolve(process.cwd(), 'dist');
const indexHtml = () => {
  const p = path.join(DIST, 'index.html');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
};

app.use('/*', serveStatic({ root: './dist', onNotFound: () => {} }));

app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404);
  const html = indexHtml();
  if (!html) return c.text('前端构建产物 dist/index.html 不存在：请先运行 npm run build。', 200);
  return c.html(html);
});

// ---------- 启动 ----------
const PORT = parseInt(process.env.PORT || '17900');
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`[sup-coach] SUP AI Coach 已启动：http://localhost:${info.port}`);
});
