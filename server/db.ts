import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db: Database.Database = new Database(path.join(DATA_DIR, 'sup.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  -- 身体画像：基本信息 + 身体素质指标（一用户一行）
  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT '',
    birth_year INTEGER,
    height_cm REAL,
    weight_kg REAL,
    resting_hr INTEGER,
    max_hr INTEGER,
    vo2max REAL,
    experience_level TEXT NOT NULL DEFAULT 'beginner',   -- beginner/novice/intermediate/advanced
    weekly_frequency INTEGER DEFAULT 0,
    session_minutes INTEGER DEFAULT 0,
    strength_score INTEGER DEFAULT 0,     -- 1-10
    endurance_score INTEGER DEFAULT 0,
    flexibility_score INTEGER DEFAULT 0,
    balance_score INTEGER DEFAULT 0,
    paddle_skill_score INTEGER DEFAULT 0, -- 划桨技术自评 1-10
    medical_notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 技能评估会话（AI 对话式评估）
  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',     -- active/completed
    skill_level TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    dimensions_json TEXT NOT NULL DEFAULT '[]', -- [{key,name,score,note}]
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assessment_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                        -- user/assistant
    content TEXT NOT NULL DEFAULT '',
    attachments_json TEXT NOT NULL DEFAULT '[]', -- [{type,name,url}]
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 训练目标
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    target_distance_km REAL,
    target_time_min REAL,
    target_pace_km TEXT NOT NULL DEFAULT '',  -- mm:ss /km
    target_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',    -- active/completed/archived
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 训练计划（含阶段结构）
  CREATE TABLE IF NOT EXISTS training_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '',
    start_date TEXT,
    end_date TEXT,
    phases_json TEXT NOT NULL DEFAULT '[]',   -- [{name,weeks,desc}]
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 计划中的每一天训练任务
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,                       -- YYYY-MM-DD
    phase TEXT NOT NULL DEFAULT '',           -- 阶段名
    day_index INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'endurance',   -- technique/endurance/speed/strength/recovery
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',         -- 计划内容
    target_detail TEXT NOT NULL DEFAULT '',   -- 目标细节（配速/距离/时长）
    status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled/done/skipped
    UNIQUE(plan_id, date)
  );

  -- 每日打卡（实际训练情况）
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    actual_detail TEXT NOT NULL DEFAULT '',
    distance_km REAL,
    duration_min REAL,
    pace TEXT NOT NULL DEFAULT '',
    rpe INTEGER,                              -- 主观用力 1-10
    feeling TEXT NOT NULL DEFAULT '',         -- 身体感受
    attachments_json TEXT NOT NULL DEFAULT '[]',
    ai_review TEXT NOT NULL DEFAULT '',       -- AI 点评
    strengths TEXT NOT NULL DEFAULT '',
    weaknesses TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  );

  -- 指标时间序列（供总屏/下钻可视化）
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    metric_key TEXT NOT NULL,                 -- pace_6km/distance_km/duration_min/rpe/...
    value REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, date, metric_key)
  );

  -- 知识库
  CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'text', -- text/link/image/video
    source_url TEXT NOT NULL DEFAULT '',
    raw_text TEXT NOT NULL DEFAULT '',
    structured_json TEXT NOT NULL DEFAULT '[]', -- [{topic,keypoint,detail}]
    tags_json TEXT NOT NULL DEFAULT '[]',
    attachments_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',   -- pending/parsed/failed
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  -- LLM 设置（用户自管 API Key，加密存储）
  CREATE TABLE IF NOT EXISTS llm_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'custom',
    base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
    model TEXT NOT NULL DEFAULT 'deepseek-chat',
    api_key_enc TEXT NOT NULL DEFAULT '',
    supports_vision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);
}

export function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}
