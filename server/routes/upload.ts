import { Hono } from 'hono';
import { saveUpload } from '../uploads.js';

const upload = new Hono();

upload.post('/', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: '无效的上传请求' }, 400);
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: '缺少文件字段 file' }, 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return c.json({ error: '文件为空' }, 400);
  const maxSize = 30 * 1024 * 1024;
  if (buffer.length > maxSize) return c.json({ error: '文件超过 30MB 限制' }, 413);
  const att = saveUpload(buffer, file.name, file.type || 'application/octet-stream');
  return c.json({ ok: true, attachment: att });
});

export default upload;
