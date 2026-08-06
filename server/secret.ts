import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * API Key 加密存储：AES-256-GCM。
 * 密钥文件生成在 data/.secret（仅本机可读），数据库泄露不暴露明文 key。
 */
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');

function loadKey(): Buffer {
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, key, { mode: 0o600 });
  return key;
}

const KEY = loadKey();

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(enc: string): string {
  if (!enc) return '';
  try {
    const [ivB64, tagB64, dataB64] = enc.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
