import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export interface SavedAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  name: string;
  url: string; // /uploads/xxx
  mime: string;
  size: number;
}

const MIME_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export function detectType(mime: string): SavedAttachment['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** 保存上传文件，返回附件元数据 */
export function saveUpload(buffer: Buffer, filename: string, mime: string): SavedAttachment {
  const ext = MIME_MAP[mime] || path.extname(filename).replace('.', '').slice(0, 8) || 'bin';
  const name = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const rel = path.join('uploads', name);
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return { type: detectType(mime), name: filename || name, url: `/${rel}`, mime, size: buffer.length };
}

export function uploadAbsPath(relUrl: string): string {
  return path.join(UPLOAD_DIR, path.basename(relUrl));
}

/** 视频抽帧：均匀取 n 帧，返回 data URL 列表 */
export function extractVideoFrames(relUrl: string, n = 3): string[] {
  const abs = uploadAbsPath(relUrl);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  try {
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', abs], {
      encoding: 'utf8',
    });
    const duration = parseFloat((JSON.parse(probe).format?.duration) || '0');
    if (!duration || duration <= 0) return [];
    for (let i = 0; i < n; i++) {
      const t = Math.min((duration * (i + 0.5)) / n, duration - 0.1);
      const png = execFileSync(
        'ffmpeg',
        ['-ss', String(Math.max(t, 0)), '-i', abs, '-frames:v', '1', '-vf', 'scale=960:-1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
        { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
      );
      out.push(`data:image/png;base64,${png.toString('base64')}`);
    }
  } catch (e) {
    console.error('[frames] 视频抽帧失败:', (e as Error).message);
  }
  return out;
}

/** 图片文件转 data URL */
export function imageToDataUrl(relUrl: string): string | null {
  const abs = uploadAbsPath(relUrl);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  const mime = relUrl.endsWith('.png') ? 'image/png' : relUrl.endsWith('.webp') ? 'image/webp' : relUrl.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 音频元数据（时长等） */
export function audioMeta(relUrl: string): { durationSec: number } {
  const abs = uploadAbsPath(relUrl);
  try {
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', abs], {
      encoding: 'utf8',
    });
    return { durationSec: parseFloat((JSON.parse(probe).format?.duration) || '0') || 0 };
  } catch {
    return { durationSec: 0 };
  }
}
