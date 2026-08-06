import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle2, Circle, Flame, Target, Waves, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  technique: { label: '技术', color: '#22D3EE', icon: Waves },
  endurance: { label: '耐力', color: '#FF6B35', icon: Zap },
  speed: { label: '速度', color: '#FACC15', icon: Zap },
  strength: { label: '力量', color: '#A78BFA', icon: Flame },
  recovery: { label: '恢复', color: '#34D399', icon: CalendarDays },
}

export default function Plan() {
  const [plans, setPlans] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [plan, setPlan] = useState<any>(null)
  const [workouts, setWorkouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [phaseStats, setPhaseStats] = useState<any[]>([])

  useEffect(() => {
    Promise.all([api.listPlans(), api.listGoals()]).then(([p, g]) => {
      setPlans(p.plans)
      setGoals(g.goals)
      if (p.plans.length > 0) {
        setSelectedId(p.plans[0].id)
        void loadPlan(p.plans[0].id)
      }
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const loadPlan = async (id: number) => {
    const [p, ph] = await Promise.all([api.getPlan(id), api.phases()])
    setPlan(p.plan)
    setWorkouts(p.workouts)
    setPhaseStats(ph.phases)
  }

  const setStatus = async (w: any, status: string) => {
    try {
      await api.setWorkoutStatus(w.id, status)
      setWorkouts((arr) => arr.map((x) => (x.id === w.id ? { ...x, status } : x)))
      const ph = await api.phases()
      setPhaseStats(ph.phases)
      toast.success(status === 'done' ? '训练完成，记得打卡！' : '已更新状态')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (loading) return <div className="space-y-3"><div className="h-32 rounded-2xl shimmer" /><div className="h-64 rounded-2xl shimmer" /></div>

  // 按周分组
  const weeks: Array<{ idx: number; label: string; days: any[] }> = []
  if (workouts.length > 0) {
    const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date))
    const first = new Date(sorted[0].date)
    let current: any = null
    for (const w of sorted) {
      const d = new Date(w.date)
      const diff = Math.floor((d.getTime() - first.getTime()) / 86400000)
      const weekIdx = Math.floor(diff / 7)
      if (!current || current.idx !== weekIdx) {
        current = { idx: weekIdx, label: `第 ${weekIdx + 1} 周`, days: [] }
        weeks.push(current)
      }
      current.days.push(w)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-bold tracking-tight">训练计划</h1>
          <p className="text-sm text-muted-foreground">AI 生成的个性化周期计划 · 每日任务一览</p>
        </div>
        <div className="flex items-center gap-2">
          {goals.filter((g) => g.status === 'active').map((g) => (
            <span key={g.id} className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent">
              <Target className="h-3.5 w-3.5" /> {g.title}
            </span>
          ))}
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">还没有训练计划</p>
          <p className="mt-1 text-xs text-muted-foreground/70">去「AI 评估」完成技能评估后，即可一键生成个性化计划</p>
        </div>
      ) : (
        <>
          {/* 计划选择 */}
          <div className="flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedId(p.id); void loadPlan(p.id) }}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm transition-colors',
                  selectedId === p.id ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                )}
              >
                {p.title}
                <span className="ml-2 text-[10px] opacity-70">{p.start_date} ~ {p.end_date}</span>
              </button>
            ))}
          </div>

          {plan && (
            <>
              {/* 阶段进度 */}
              {phaseStats.length > 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {phaseStats.map((p) => (
                    <div key={p.name} className="rounded-2xl border border-border bg-card p-4">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-semibold">{p.name}</span>
                        <span className="stat-num text-xs text-primary">{p.percent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${p.percent}%` }} />
                      </div>
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        {p.done}/{p.total} 次完成{p.avgRpe ? ` · 平均 RPE ${p.avgRpe}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 周计划 */}
              <div className="space-y-4">
                {weeks.map((week) => (
                  <div key={week.idx} className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
                      <span className="text-sm font-bold">{week.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {week.days.filter((d) => d.status === 'done').length}/{week.days.length} 完成
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {week.days.map((w) => {
                        const meta = TYPE_META[w.type] || TYPE_META.endurance
                        const done = w.status === 'done'
                        const skipped = w.status === 'skipped'
                        const isPast = w.date < today()
                        return (
                          <div key={w.id} className={cn('flex items-start gap-3 px-4 py-3', skipped && 'opacity-50')}>
                            <div className="w-14 shrink-0 pt-0.5 text-center">
                              <div className="stat-num text-sm">{w.date.slice(5)}</div>
                              <div className="text-[10px] text-muted-foreground">{weekday(w.date)}</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>
                                  {meta.label}
                                </span>
                                <span className={cn('text-sm font-semibold', done && 'line-through opacity-60')}>{w.title}</span>
                                {w.target_detail && <span className="text-[11px] text-accent">🎯 {w.target_detail}</span>}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{w.content}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {!done && (
                                <button onClick={() => void setStatus(w, 'done')} disabled={!isPast && false} className={cn('flex h-8 w-8 items-center justify-center rounded-lg border', isPast ? 'border-success/40 text-success hover:bg-success/10' : 'border-border text-muted-foreground/50')}>
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}
                              {done && <span className="flex h-8 items-center gap-1 rounded-lg bg-success/15 px-2 text-[11px] font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> 完成</span>}
                              <button onClick={() => void setStatus(w, done ? 'scheduled' : 'skipped')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground/50 hover:bg-secondary">
                                <Circle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function weekday(date: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date + 'T00:00:00').getDay()]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
