import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowLeft, CalendarDays, CheckCircle2, FileImage, FileVideo, Loader2, Mic, Paperclip, Send, Sparkles, Target, X,
} from 'lucide-react'
import { api, streamChat } from '@/lib/api'
import { cn } from '@/lib/utils'

type Msg = { id: number; role: 'user' | 'assistant'; content: string; attachments?: any[] }

export default function Assess() {
  const [assessmentId, setAssessmentId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Array<{ url: string; type: string; name: string }>>([])
  const [streaming, setStreaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState<any>(null)
  const [showGoal, setShowGoal] = useState(false)
  const [goal, setGoal] = useState({ title: '', target_distance_km: '', target_time_min: '', target_pace_km: '', target_date: '' })
  const [weeks, setWeeks] = useState(4)
  const [startDate, setStartDate] = useState(today())
  const [generating, setGenerating] = useState(false)
  const [llmOk, setLlmOk] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    // 检查 LLM 配置
    api.getLlmSettings().then((res) => setLlmOk(res.llm.configured)).catch(() => setLlmOk(false))
    // 恢复最近的活跃评估
    api.listAssessments().then((res) => {
      const active = res.assessments.find((a: any) => a.status === 'active')
      if (active) {
        setAssessmentId(active.id)
        api.getMessages(active.id).then((m) => {
          setMessages(m.messages.map((x: any) => ({ id: x.id, role: x.role, content: x.content, attachments: JSON.parse(x.attachments_json || '[]') })))
          if (m.assessment.status === 'completed') setCompleted(JSON.parse(m.assessment.dimensions_json || '[]'))
        })
      } else {
        const last = res.assessments[0]
        if (last && last.status === 'completed') {
          api.getMessages(last.id).then((m) => setMessages(m.messages.map((x: any) => ({ id: x.id, role: x.role, content: x.content }))))
          setCompleted(JSON.parse(last.dimensions_json || '[]'))
        }
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const startAssessment = async () => {
    setBusy(true)
    try {
      const res = await api.createAssessment()
      setAssessmentId(res.id)
      setMessages([{ id: 0, role: 'assistant', content: res.opening }])
      setCompleted(null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!assessmentId) return
    const text = input.trim()
    if (!text && attachments.length === 0) return
    if (streaming) return
    const atts = attachments
    setMessages((m) => [...m, { id: Date.now(), role: 'user', content: text || '（附件）', attachments: atts }])
    setAttachments([])
    setInput('')
    setStreaming(true)
    const assistantMsg: Msg = { id: Date.now() + 1, role: 'assistant', content: '' }
    setMessages((m) => [...m, assistantMsg])
    try {
      const full = await streamChat(assessmentId, { text, attachments: atts.map((a) => ({ url: a.url, type: a.type })) }, (delta) => {
        setMessages((m) => m.map((x) => (x.id === assistantMsg.id ? { ...x, content: x.content + delta } : x)))
      })
      setMessages((m) => m.map((x) => (x.id === assistantMsg.id ? { ...x, content: full } : x)))
    } catch (e: any) {
      setMessages((m) => m.map((x) => (x.id === assistantMsg.id ? { ...x, content: `⚠️ ${e.message}` } : x)))
    } finally {
      setStreaming(false)
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
        toast.error(`${f.name}: ${err.message}`)
      }
    }
  }

  const complete = async () => {
    if (!assessmentId) return
    setBusy(true)
    try {
      const res = await api.completeAssessment(assessmentId)
      setCompleted(res.assessment.dimensions)
      setShowGoal(true)
      toast.success('技能评估完成！确认目标后即可生成训练计划')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const generatePlan = async () => {
    if (!assessmentId) return
    setGenerating(true)
    try {
      const body = {
        goal: {
          title: goal.title || undefined,
          target_distance_km: goal.target_distance_km ? Number(goal.target_distance_km) : undefined,
          target_time_min: goal.target_time_min ? Number(goal.target_time_min) : undefined,
          target_pace_km: goal.target_pace_km || undefined,
          target_date: goal.target_date || undefined,
        },
        weeks,
        start_date: startDate,
      }
      const res = await api.generatePlan(assessmentId, body)
      toast.success(`计划「${res.title}」已生成，共 ${res.workoutCount} 次训练`)
      nav('/plan')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-bold tracking-tight">AI 技能评估</h1>
          <p className="text-sm text-muted-foreground">多模态对话 · 结构化技能维度 · 生成训练计划</p>
        </div>
        {!llmOk && (
          <Link to="/settings" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning hover:bg-warning/20">
            ⚠️ 未配置 LLM Key，去设置
          </Link>
        )}
      </div>

      {!assessmentId ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="font-brand text-lg font-bold">开启你的技能评估</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            AI 教练会通过对话了解你的划桨技术、体能基础、训练条件，支持上传图片/视频让教练直接分析你的动作，最终生成 6 维技能画像与个性化训练计划。
          </p>
          <button
            onClick={() => void startAssessment()}
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            开始评估对话
          </button>
        </div>
      ) : (
        <>
          {/* 聊天区 */}
          <div className="flex h-[52vh] min-h-[320px] flex-col rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> 评估会话 #{assessmentId}
              </span>
              <span className="text-[11px] text-muted-foreground">支持 文字 / 图片 / 视频 / 音频</span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground')}>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {m.attachments.map((a, i) => (
                          <span key={i} className="flex items-center gap-1 rounded-md bg-black/10 px-1.5 py-0.5 text-[10px]">
                            {a.type === 'image' ? <FileImage className="h-3 w-3" /> : a.type === 'video' ? <FileVideo className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.content || (m.role === 'assistant' && <Loader2 className="h-3.5 w-3.5 animate-spin" />)}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {/* 输入区 */}
            <div className="border-t border-border p-3">
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((a, i) => (
                    <span key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2 py-1 text-[11px]">
                      {a.type === 'image' ? <FileImage className="h-3.5 w-3.5 text-accent" /> : a.type === 'video' ? <FileVideo className="h-3.5 w-3.5 text-primary" /> : <Mic className="h-3.5 w-3.5 text-success" />}
                      <span className="max-w-[140px] truncate">{a.name}</span>
                      <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}><X className="h-3 w-3 text-muted-foreground" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={pickFile} />
                <button onClick={() => fileRef.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary">
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                  placeholder="描述你的桨板情况，或让教练分析你上传的动作…"
                  rows={1}
                  className="max-h-28 flex-1 resize-none rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button onClick={() => void send()} disabled={streaming || (!input.trim() && attachments.length === 0)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* 操作区 */}
          {!completed ? (
            <button
              onClick={() => void complete()}
              disabled={busy || streaming}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              对话已充分？完成评估，生成技能画像
            </button>
          ) : showGoal ? (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-accent" /> 确认目标，生成训练计划</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <label className="col-span-2 block md:col-span-1">
                  <span className="mb-1 block text-xs text-muted-foreground">目标名称</span>
                  <input value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} placeholder="如：6km 进 38 分" className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">目标距离 (km)</span>
                  <input type="number" value={goal.target_distance_km} onChange={(e) => setGoal({ ...goal, target_distance_km: e.target.value })} placeholder="6" className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">目标用时 (min)</span>
                  <input type="number" value={goal.target_time_min} onChange={(e) => setGoal({ ...goal, target_time_min: e.target.value })} placeholder="38" className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">目标配速 (min/km)</span>
                  <input value={goal.target_pace_km} onChange={(e) => setGoal({ ...goal, target_pace_km: e.target.value })} placeholder="6:20" className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">截止日期</span>
                  <input type="date" value={goal.target_date} onChange={(e) => setGoal({ ...goal, target_date: e.target.value })} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">计划周期 (周)</span>
                  <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary">
                    {[2, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{w} 周</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">开始日期</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
              </div>
              <button
                onClick={() => void generatePlan()}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                {generating ? 'AI 正在制定计划…' : '生成训练计划'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
              已生成计划，去 <Link to="/plan" className="font-medium text-primary hover:underline">训练计划页</Link> 查看；或{' '}
              <button onClick={() => { setCompleted(null); setShowGoal(false); setAssessmentId(null); setMessages([]) }} className="font-medium text-primary hover:underline">
                <ArrowLeft className="mr-0.5 inline h-3 w-3" /> 重新评估
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
