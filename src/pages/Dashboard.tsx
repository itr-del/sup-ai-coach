import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  Activity, ArrowRight, BookOpen, CalendarDays, ChevronRight, Clock, Flame, Gauge, MapPin,
  MessageSquareText, Route, Target, TrendingUp, Trophy, Waves, Zap,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '@/lib/api'

const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  technique: { label: '技术', color: '#22D3EE', icon: Waves },
  endurance: { label: '耐力', color: '#FF6B35', icon: Activity },
  speed: { label: '速度', color: '#FACC15', icon: Zap },
  strength: { label: '力量', color: '#A78BFA', icon: Flame },
  recovery: { label: '恢复', color: '#34D399', icon: CalendarDays },
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayDetail, setDayDetail] = useState<any>(null)
  const [dayLoading, setDayLoading] = useState(false)

  useEffect(() => {
    api.overview().then((res) => setData(res.overview)).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  // 指标数据派生（必须无条件调用 hooks）
  const metrics = data?.metrics ?? []
  const distancePoints = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of metrics) if (m.metric_key === 'distance_km') map.set(m.date, m.value)
    const days: { date: string; km: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      days.push({ date: d.slice(5), km: map.get(d) ?? 0 })
    }
    return days
  }, [metrics])

  const pacePoints = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of metrics) if (m.metric_key === 'pace_sec_km') map.set(m.date, m.value)
    return [...map.entries()].slice(-14).map(([date, v]) => ({ date: date.slice(5), pace: (v / 60).toFixed(2) }))
  }, [metrics])

  const openDay = async (date: string) => {
    setSelectedDate(date)
    setDayLoading(true)
    try {
      const res = await api.dayDetail(date)
      setDayDetail(res)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDayLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
      </div>
    )
  }
  if (!data) return <div className="text-center text-muted-foreground">加载失败</div>

  const { agg, dimensions, planProgress, recentCheckins, goal, assessment, plan, knowledgeCount, profile } = data
  const radarData = (dimensions?.length ? dimensions : []).map((d: any) => ({ axis: d.name, score: d.score }))
  const hasPlan = !!plan && planProgress

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-bold tracking-tight">训练总览</h1>
          <p className="text-sm text-muted-foreground">{(profile?.nickname || '桨手')} · 你的 SUP 训练现状总屏</p>
        </div>
        <div className="flex gap-2">
          <Link to="/assess" className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <MessageSquareText className="h-3.5 w-3.5" /> {dimensions?.length ? '重新评估' : '开始 AI 评估'}
          </Link>
          <Link to="/checkin" className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-secondary">
            <Activity className="h-3.5 w-3.5 text-accent" /> 今日打卡
          </Link>
        </div>
      </div>

      {/* 核心指标卡 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Activity} label="累计训练" value={String(agg.sessions)} unit="次" color="#FF6B35" />
        <StatCard icon={Route} label="总里程" value={String(agg.total_km)} unit="km" color="#22D3EE" />
        <StatCard icon={Clock} label="总时长" value={String(agg.total_min)} unit="min" color="#A78BFA" />
        <StatCard icon={Gauge} label="平均强度" value={agg.avg_rpe ? String(agg.avg_rpe) : '—'} unit="RPE" color="#FACC15" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 左列：技能雷达 + 目标 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> 技能雷达</h2>
              {assessment && <span className="text-[10px] text-muted-foreground">{assessment.skill_level}</span>}
            </div>
            {radarData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="70%">
                    <PolarGrid stroke="#1E2B45" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: '#8595B3', fontSize: 11 }} />
                    <Radar dataKey="score" stroke="#FF6B35" fill="#FF6B35" fillOpacity={0.35} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">还没有技能评估数据</p>
                <Link to="/assess" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  去完成首次评估 <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-accent" /> 当前目标</h2>
              <Link to="/plan" className="text-[11px] text-muted-foreground hover:text-primary">管理</Link>
            </div>
            {goal ? (
              <div>
                <div className="text-base font-bold">{goal.title}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {goal.target_distance_km && <span>目标 {goal.target_distance_km} km</span>}
                  {goal.target_time_min && <span>限时 {goal.target_time_min} min</span>}
                  {goal.target_pace_km && <span>配速 {goal.target_pace_km} /km</span>}
                  {goal.target_date && <span>截止 {goal.target_date}</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚未设定目标，去 AI 评估中确认你的目标吧</p>
            )}
          </div>

          {/* 计划进度 */}
          {hasPlan && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-success" /> 计划进度</h2>
                <Link to="/plan" className="text-[11px] text-muted-foreground hover:text-primary">详情</Link>
              </div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate pr-2 text-muted-foreground">{plan.title}</span>
                <span className="stat-num text-primary">{planProgress.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${planProgress.percent}%` }} />
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">已完成 {planProgress.done} / {planProgress.total} 次训练</div>
            </div>
          )}
        </div>

        {/* 中列：趋势 + 里程 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> 近 30 天训练量</h2>
              <span className="text-[11px] text-muted-foreground">km / 天</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={distancePoints}>
                  <defs>
                    <linearGradient id="kmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#FF6B35" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1E2B45" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#8595B3', fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fill: '#8595B3', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ background: '#111B2E', border: '1px solid #1E2B45', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="km" stroke="#FF6B35" strokeWidth={2} fill="url(#kmGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {pacePoints.length > 1 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-accent" /> 配速趋势</h2>
                <span className="text-[11px] text-muted-foreground">min/km</span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pacePoints}>
                    <CartesianGrid stroke="#1E2B45" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#8595B3', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis reversed tick={{ fill: '#8595B3', fontSize: 10 }} tickLine={false} axisLine={false} width={36} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                    <Tooltip contentStyle={{ background: '#111B2E', border: '1px solid #1E2B45', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="pace" stroke="#22D3EE" strokeWidth={2} fill="#22D3EE" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 知识库入口 */}
          <Link to="/knowledge" className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">训练知识库</div>
                <div className="text-xs text-muted-foreground">{knowledgeCount} 条已解析知识</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>

        {/* 右列：最近训练 + 下钻 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-success" /> 最近训练</h2>
              <Link to="/checkin" className="text-[11px] text-muted-foreground hover:text-primary">全部</Link>
            </div>
            <div className="space-y-2">
              {recentCheckins.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">还没有打卡记录，去完成第一次训练吧！</p>}
              {recentCheckins.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => openDay(c.date)}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/40 px-3.5 py-3 text-left transition-colors hover:border-primary/40"
                >
                  <div>
                    <div className="text-xs font-medium">{c.date}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {c.distance_km ? `${c.distance_km} km` : ''}
                      {c.distance_km && c.duration_min ? ' · ' : ''}
                      {c.duration_min ? `${c.duration_min} min` : ''}
                      {c.rpe ? ` · RPE ${c.rpe}` : ''}
                    </div>
                  </div>
                  {c.ai_review ? (
                    <span className="rounded-md bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">已点评</span>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 下钻面板：某天详情 */}
      {selectedDate && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={() => setSelectedDate(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-5 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-brand text-lg font-bold">{selectedDate}</div>
                <div className="text-xs text-muted-foreground">训练详情 · 计划 vs 实际</div>
              </div>
              <button onClick={() => setSelectedDate(null)} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-secondary">关闭</button>
            </div>
            {dayLoading ? (
              <div className="space-y-3"><div className="h-16 rounded-xl shimmer" /><div className="h-24 rounded-xl shimmer" /></div>
            ) : dayDetail ? (
              <div className="space-y-4">
                {/* 计划 */}
                {dayDetail.workout ? (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-md bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        {TYPE_META[dayDetail.workout.type]?.label ?? dayDetail.workout.type}
                      </span>
                      <span className="text-sm font-semibold">{dayDetail.workout.title}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{dayDetail.workout.content}</p>
                    {dayDetail.workout.target_detail && (
                      <p className="mt-2 text-xs font-medium text-accent">🎯 {dayDetail.workout.target_detail}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">当日无计划训练任务</div>
                )}
                {/* 实际 */}
                {dayDetail.checkin ? (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">实际训练</span>
                      {dayDetail.checkin.pace && <span className="stat-num text-primary">{dayDetail.checkin.pace} /km</span>}
                    </div>
                    <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                      <MiniStat label="距离" value={dayDetail.checkin.distance_km ? `${dayDetail.checkin.distance_km}km` : '—'} />
                      <MiniStat label="时长" value={dayDetail.checkin.duration_min ? `${dayDetail.checkin.duration_min}min` : '—'} />
                      <MiniStat label="RPE" value={dayDetail.checkin.rpe ? String(dayDetail.checkin.rpe) : '—'} />
                    </div>
                    {dayDetail.checkin.actual_detail && (
                      <p className="text-xs leading-relaxed text-muted-foreground">{dayDetail.checkin.actual_detail}</p>
                    )}
                    {dayDetail.checkin.ai_review && (
                      <div className="mt-3 space-y-2 rounded-lg bg-secondary/40 p-3">
                        <p className="text-xs leading-relaxed">💬 {dayDetail.checkin.ai_review}</p>
                        {dayDetail.checkin.strengths && (
                          <p className="text-[11px] text-success">✅ 优点：{dayDetail.checkin.strengths}</p>
                        )}
                        {dayDetail.checkin.weaknesses && (
                          <p className="text-[11px] text-warning">⚠️ 改进：{dayDetail.checkin.weaknesses}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    这一天没有打卡记录
                    <Link to="/checkin" className="ml-2 text-primary hover:underline">去打卡</Link>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, unit, color }: { icon: any; label: string; value: string; unit: string; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-10" style={{ background: color }} />
      <Icon className="mb-2 h-4 w-4" style={{ color }} />
      <div className="stat-num text-2xl">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 py-2">
      <div className="stat-num text-sm">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
