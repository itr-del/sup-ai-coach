import { Hono } from 'hono';
import { db } from '../db.js';

const dashboard = new Hono();

// ---------- 现状总屏 ----------
dashboard.get('/overview', (c) => {
  const user = c.get('user');

  // 最新评估
  const assessment = db
    .prepare("SELECT * FROM assessments WHERE user_id = ? AND status='completed' ORDER BY id DESC LIMIT 1")
    .get(user.id) as Record<string, any> | undefined;
  const dimensions = assessment ? JSON.parse(assessment.dimensions_json || '[]') : [];

  // 进行中的目标
  const goal = db.prepare("SELECT * FROM goals WHERE user_id = ? AND status='active' ORDER BY id DESC LIMIT 1").get(user.id);

  // 最新计划 + 进度
  const plan = db.prepare('SELECT * FROM training_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id) as
    | Record<string, any>
    | undefined;
  let planProgress = null;
  if (plan) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM workouts WHERE plan_id = ?').get(plan.id) as { n: number };
    const done = db.prepare("SELECT COUNT(*) AS n FROM workouts WHERE plan_id = ? AND status='done'").get(plan.id) as { n: number };
    planProgress = { total: total.n, done: done.n, percent: total.n > 0 ? Math.round((done.n / total.n) * 100) : 0 };
  }

  // 最近 7 次打卡
  const recentCheckins = db
    .prepare('SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 7')
    .all(user.id);

  // 最近 30 天指标趋势
  const from = addDays(today(), -29);
  const metrics = db
    .prepare('SELECT date, metric_key, value, unit FROM metrics WHERE user_id = ? AND date >= ? ORDER BY date ASC')
    .all(user.id, from) as Array<{ date: string; metric_key: string; value: number; unit: string }>;

  // 聚合：总训练次数/总距离/总时长/平均RPE
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS sessions, COALESCE(SUM(distance_km),0) AS total_km, COALESCE(SUM(duration_min),0) AS total_min,
       AVG(rpe) AS avg_rpe, MAX(date) AS last_date FROM checkins WHERE user_id = ?`,
    )
    .get(user.id) as Record<string, any>;

  // 知识库统计
  const kbCount = db.prepare("SELECT COUNT(*) AS n FROM knowledge WHERE user_id = ? AND status='parsed'").get(user.id) as { n: number };

  return c.json({
    overview: {
      profile: db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id),
      assessment,
      dimensions,
      goal,
      plan,
      planProgress,
      recentCheckins,
      metrics,
      agg: {
        sessions: agg?.sessions ?? 0,
        total_km: Math.round((agg?.total_km ?? 0) * 100) / 100,
        total_min: Math.round(agg?.total_min ?? 0),
        avg_rpe: agg?.avg_rpe ? Math.round(agg.avg_rpe * 10) / 10 : null,
        last_date: agg?.last_date ?? null,
      },
      knowledgeCount: kbCount?.n ?? 0,
    },
  });
});

// ---------- 阶段汇总（计划阶段 × 完成度） ----------
dashboard.get('/phases', (c) => {
  const user = c.get('user');
  const plan = db.prepare('SELECT * FROM training_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id) as
    | Record<string, any>
    | undefined;
  if (!plan) return c.json({ phases: [], plan: null });

  const phases = JSON.parse(plan.phases_json || '[]') as Array<{ name: string; weeks: number; desc: string }>;
  const workouts = db.prepare('SELECT * FROM workouts WHERE plan_id = ? ORDER BY date ASC').all(plan.id) as Array<Record<string, any>>;
  const checkins = db.prepare('SELECT date, distance_km, duration_min, rpe FROM checkins WHERE user_id = ?').all(user.id) as Array<Record<string, any>>;
  const checkinMap = new Map(checkins.map((c) => [c.date, c]));

  const phaseRows = phases.map((p) => {
    const ws = workouts.filter((w) => w.phase === p.name);
    const done = ws.filter((w) => w.status === 'done');
    const withCheckin = ws.filter((w) => checkinMap.has(w.date));
    return {
      name: p.name,
      weeks: p.weeks,
      desc: p.desc,
      total: ws.length,
      done: done.length,
      checkinCount: withCheckin.length,
      percent: ws.length > 0 ? Math.round((Math.max(done.length, withCheckin.length) / ws.length) * 100) : 0,
      avgRpe: withCheckin.length > 0 ? Math.round((withCheckin.reduce((s, w) => s + (checkinMap.get(w.date)?.rpe ?? 0), 0) / withCheckin.length) * 10) / 10 : null,
    };
  });

  return c.json({ phases: phaseRows, plan: { id: plan.id, title: plan.title, start_date: plan.start_date, end_date: plan.end_date } });
});

// ---------- 某天详情（下钻） ----------
dashboard.get('/day/:date', (c) => {
  const user = c.get('user');
  const date = c.req.param('date');
  const workout = db
    .prepare('SELECT w.*, p.title AS plan_title FROM workouts w LEFT JOIN training_plans p ON p.id = w.plan_id WHERE w.user_id = ? AND w.date = ?')
    .get(user.id, date);
  const checkin = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date = ?').get(user.id, date);
  return c.json({ date, workout: workout || null, checkin: checkin || null });
});

// ---------- 指标趋势 ----------
dashboard.get('/trend', (c) => {
  const user = c.get('user');
  const key = c.req.query('key') || 'distance_km';
  const days = Math.min(Math.max(Number(c.req.query('days') || 30), 7), 365);
  const from = addDays(today(), -(days - 1));
  const rows = db
    .prepare('SELECT date, value, unit FROM metrics WHERE user_id = ? AND metric_key = ? AND date >= ? ORDER BY date ASC')
    .all(user.id, key, from);
  return c.json({ key, points: rows });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default dashboard;
