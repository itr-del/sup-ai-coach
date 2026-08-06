import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Activity, CheckCircle2, FileImage, FileVideo, Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const TYPE_META: Record<string, { label: string; color: string }> = {
  technique: { label: '技术', color: '#22D3EE' },
  endurance: { label: '耐力', color: '#FF6B35' },
  speed: { label: '速度', color: '#FACC15' },
  strength: { label: '力量', color: '#A78BFA' },
  recovery: { label: '恢复', color: '#34D399' },
}

export default function Checkin() {
  const [date, setDate] = useState(today())
  const [workout, setWorkout] = useState<any>(null)
  const [existing, setExisting] = useState<any>(null)
  const [form, setForm] = useState({ actual_detail: '', distance_km: '', duration_min: '', pace: '', rpe: '', feeling: '' })
  const [attachments, setAttachments] = useState<Array<{ url: string; type: string; name: string }>>([])
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const loadDay = async (d: string) => {
    try {
      const [day, hist] = await Promise.all([api.dayDetail(d), api.listCheckins()])
      setWorkout(day.workout)
      setExisting(day.checkin)
      setHistory(hist.checkins)
      setAttachments([])
      if (day.checkin) {
        setForm({
          actual_detail: day.checkin.actual_detail || '',
          distance_km: day.checkin.distance_km != null ? String(day.checkin.distance_km) : '',
          duration_min: day.checkin.duration_min != null ? String(day.checkin.duration_min) : '',
          pace: day.checkin.pace || '',
          rpe: day.checkin.rpe != null ? String(day.checkin.rpe) : '',
          feeling: day.checkin.feeling || '',
        })
      } else {
        setForm({ actual_detail: '', distance_km: '', duration_min: '', pace: '', rpe: '', feeling: '' })
      }
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  useEffect(() => { void loadDay(date) }, [date])

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, any> = {
        date,
        workout_id: workout?.id ?? null,
        actual_detail: form.actual_detail,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        pace: form.pace,
        rpe: form.rpe ? Number(form.rpe) : null,
        feeling: form.feeling,
        attachments,
      }
      await api.saveCheckin(body)
      toast.success('打卡已保存')
      await loadDay(date)
      if (workout && workout.status !== 'done') {
        try { await api.setWorkoutStatus(workout.id, 'done') } catch { /* ignore */ }
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const review = async () => {
    if (!existing) {
      toast.error('请先保存打卡记录')
      return
    }
    setReviewing(true)
    try {
      const res = await api.reviewCheckin(existing.id)
      setExisting((x: any) => ({ ...x, ai_review: res.review.ai_review, strengths: res.review.strengths, weaknesses: res.review.weaknesses, reviewed_at: new Date().toISOString() }))
      toast.success('AI 点评完成')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setReviewing(false)
    }
  }

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const f of files) {
      try {
        const res = await api.upload(f)
        setAttachments((a) => [...a, { url: res.attachment.url, type: res.attachment.type, name: res.attachment.name }])
      } catch (err: any) {
        toast.error(err.message)
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-bold tracking-tight">每日打卡</h1>
          <p className="text-sm text-muted-foreground">记录实际训练 · 获取 AI 教练点评</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      {/* 当日计划 */}
      {workout ? (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ color: TYPE_META[workout.type]?.color || '#22D3EE', background: `${TYPE_META[workout.type]?.color || '#22D3EE'}1a` }}>
              {TYPE_META[workout.type]?.label || workout.type}
            </span>
            <span className="text-sm font-semibold">{workout.title}</span>
            {workout.target_detail && <span className="text-[11px] text-accent">🎯 {workout.target_detail}</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{workout.content}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
          当日无计划任务，可以自由训练并记录
        </div>
      )}

      {/* 打卡表单 */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" /> 实际训练记录</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">距离 (km)</span>
            <input type="number" step="0.1" value={form.distance_km} onChange={(e) => setForm({ ...form, distance_km: e.target.value })} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">时长 (min)</span>
            <input type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">配速 (min/km)</span>
            <input value={form.pace} onChange={(e) => setForm({ ...form, pace: e.target.value })} placeholder="6:30" className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">强度 RPE (1-10)</span>
            <input type="number" min={1} max={10} value={form.rpe} onChange={(e) => setForm({ ...form, rpe: e.target.value })} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-muted-foreground">训练详情</span>
          <textarea
            value={form.actual_detail}
            onChange={(e) => setForm({ ...form, actual_detail: e.target.value })}
            rows={3}
            placeholder="实际做了什么？划了几组？状态如何？心率、呼吸、技术感觉…"
            className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-muted-foreground">身体感受</span>
          <input value={form.feeling} onChange={(e) => setForm({ ...form, feeling: e.target.value })} placeholder="如：肩部略酸，核心稳定，整体轻松" className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
        </label>

        {/* 附件 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={pickFile} />
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary">
            <Paperclip className="h-3.5 w-3.5" /> 添加照片/视频
          </button>
          {attachments.map((a, i) => (
            <span key={i} className="flex items-center gap-1 rounded-lg border border-border bg-secondary px-2 py-1 text-[11px]">
              {a.type === 'image' ? <FileImage className="h-3.5 w-3.5 text-accent" /> : <FileVideo className="h-3.5 w-3.5 text-primary" />}
              <span className="max-w-[120px] truncate">{a.name}</span>
              <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}><X className="h-3 w-3 text-muted-foreground" /></button>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存打卡
          </button>
          <button
            onClick={() => void review()}
            disabled={reviewing || !existing}
            className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-40"
          >
            {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 教练点评
          </button>
        </div>

        {/* 点评展示 */}
        {existing?.ai_review && (
          <div className="mt-4 space-y-2 rounded-xl bg-secondary/40 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-accent">
              <Sparkles className="h-3.5 w-3.5" /> AI 教练点评 {existing.reviewed_at ? `· ${existing.reviewed_at.slice(0, 16)}` : ''}
            </div>
            <p className="text-sm leading-relaxed">{existing.ai_review}</p>
            {existing.strengths && <p className="text-xs text-success">✅ 优点：{existing.strengths}</p>}
            {existing.weaknesses && <p className="text-xs text-warning">⚠️ 改进：{existing.weaknesses}</p>}
          </div>
        )}
      </div>

      {/* 历史打卡 */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">打卡历史</h2>
          <div className="space-y-2">
            {history.slice(0, 14).map((c) => (
              <button
                key={c.id}
                onClick={() => setDate(c.date)}
                className={cn('flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors', date === c.date ? 'border-primary/50 bg-primary/10' : 'border-border bg-secondary/30 hover:border-primary/30')}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className={cn('h-4 w-4', c.ai_review ? 'text-success' : 'text-muted-foreground/40')} />
                  <div>
                    <div className="text-xs font-medium">{c.date}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.distance_km ? `${c.distance_km}km` : ''}{c.distance_km && c.duration_min ? ' · ' : ''}{c.duration_min ? `${c.duration_min}min` : ''}{c.rpe ? ` · RPE${c.rpe}` : ''}
                    </div>
                  </div>
                </div>
                {c.ai_review ? <span className="text-[10px] text-success">已点评</span> : <span className="text-[10px] text-muted-foreground/60">未点评</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
