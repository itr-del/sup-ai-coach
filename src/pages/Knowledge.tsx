import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, FileImage, FileVideo, Link2, Loader2, Plus, Sparkles, Trash2, Type, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type KbItem = {
  id: number
  title: string
  source_type: string
  source_url: string
  raw_text: string
  structured_json: string
  tags_json: string
  attachments_json: string
  status: string
  error: string
  created_at: string
}

const SRC_META: Record<string, { label: string; icon: any; color: string }> = {
  text: { label: '文字', icon: Type, color: '#22D3EE' },
  link: { label: '链接', icon: Link2, color: '#A78BFA' },
  image: { label: '图片', icon: FileImage, color: '#FACC15' },
  video: { label: '视频', icon: FileVideo, color: '#FF6B35' },
}

export default function Knowledge() {
  const [items, setItems] = useState<KbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ source_type: 'text', title: '', text: '', source_url: '' })
  const [attachments, setAttachments] = useState<Array<{ url: string; type: string; name: string }>>([])
  const [saving, setSaving] = useState(false)
  const [parsingId, setParsingId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    api.listKnowledge().then((res) => setItems(res.knowledge)).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const add = async () => {
    if (!form.title && !form.text && !form.source_url && attachments.length === 0) {
      toast.error('请填写内容')
      return
    }
    setSaving(true)
    try {
      await api.createKnowledge({ ...form, attachments })
      toast.success('已添加，可立即解析')
      setForm({ source_type: 'text', title: '', text: '', source_url: '' })
      setAttachments([])
      setShowAdd(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const parse = async (id: number) => {
    setParsingId(id)
    try {
      await api.parseKnowledge(id)
      toast.success('解析完成，已存入训练大脑')
      load()
    } catch (e: any) {
      toast.error(e.message)
      load()
    } finally {
      setParsingId(null)
    }
  }

  const remove = async (id: number) => {
    try {
      await api.deleteKnowledge(id)
      load()
    } catch (e: any) {
      toast.error(e.message)
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
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-bold tracking-tight">训练知识库</h1>
          <p className="text-sm text-muted-foreground">文字 / 链接 / 图片 / 视频 → 结构化知识，支撑训练大脑</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> 添加知识
        </button>
      </div>

      {/* 添加表单 */}
      {showAdd && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex gap-1.5">
            {(['text', 'link', 'image', 'video'] as const).map((t) => {
              const meta = SRC_META[t]
              return (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, source_type: t })}
                  className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors', form.source_type === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
                >
                  <meta.icon className="h-3.5 w-3.5" /> {meta.label}
                </button>
              )
            })}
          </div>
          <div className="space-y-3">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="标题（可选）"
              className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {form.source_type === 'link' ? (
              <input
                value={form.source_url}
                onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                placeholder="https:// 文章链接，保存后自动抓取正文解析"
                className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            ) : form.source_type === 'text' ? (
              <textarea
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                rows={4}
                placeholder="粘贴训练知识、技术要点、心得体会…"
                className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <input ref={fileRef} type="file" accept={form.source_type === 'image' ? 'image/*' : 'video/*'} multiple className="hidden" onChange={pickFile} />
                <button onClick={() => fileRef.current?.click()} className="text-sm text-muted-foreground hover:text-primary">
                  {form.source_type === 'image' ? '📷 点击上传图片（支持多张）' : '🎥 点击上传视频（自动抽帧解析）'}
                </button>
                {attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {attachments.map((a, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-lg border border-border bg-secondary px-2 py-1 text-[11px]">
                        {a.type === 'image' ? <FileImage className="h-3.5 w-3.5 text-accent" /> : <FileVideo className="h-3.5 w-3.5 text-primary" />}
                        <span className="max-w-[140px] truncate">{a.name}</span>
                        <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}><X className="h-3 w-3 text-muted-foreground" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => void add()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">知识库还是空的</p>
          <p className="mt-1 text-xs text-muted-foreground/70">添加训练文章、技术视频、装备资料，AI 会自动拆解为结构化知识</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = SRC_META[item.source_type] || SRC_META.text
            const structured = item.status === 'parsed' ? JSON.parse(item.structured_json || '[]') : []
            const tags = item.status === 'parsed' ? JSON.parse(item.tags_json || '[]') : []
            return (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>
                        <meta.icon className="h-3 w-3" /> {meta.label}
                      </span>
                      <span className="truncate text-sm font-semibold">{item.title}</span>
                      {item.status === 'parsed' && <span className="rounded-md bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">已解析</span>}
                      {item.status === 'pending' && <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">待解析</span>}
                      {item.status === 'failed' && <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">解析失败</span>}
                    </div>
                    {item.source_url && <div className="mt-1 truncate text-[11px] text-muted-foreground/70">{item.source_url}</div>}
                    <div className="mt-1 text-[11px] text-muted-foreground/60">{item.created_at.slice(0, 16)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.status !== 'parsed' && (
                      <button
                        onClick={() => void parse(item.id)}
                        disabled={parsingId === item.id}
                        className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
                      >
                        {parsingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        AI 解析
                      </button>
                    )}
                    <button onClick={() => void remove(item.id)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* 结构化知识 */}
                {structured.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {structured.map((k: any, i: number) => (
                      <div key={i} className="rounded-xl bg-secondary/40 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-primary">{k.topic}</span>
                        </div>
                        <div className="mt-0.5 text-xs font-medium">{k.keypoint}</div>
                        {k.detail && <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{k.detail}</div>}
                      </div>
                    ))}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tags.map((t: string, i: number) => (
                          <span key={i} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {item.status === 'failed' && item.error && <p className="mt-2 text-[11px] text-destructive">{item.error}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
