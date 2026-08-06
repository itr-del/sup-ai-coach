import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HeartPulse, Loader2, Ruler, Save, User } from 'lucide-react'
import { api } from '@/lib/api'

const LEVELS = [
  { value: 'beginner', label: '纯新手（没划过）' },
  { value: 'novice', label: '入门（划龄 <1 年）' },
  { value: 'intermediate', label: '进阶（可稳定长划）' },
  { value: 'advanced', label: '熟练（竞速/比赛）' },
]

export default function Profile() {
  const [form, setForm] = useState<Record<string, any>>({
    nickname: '', gender: '', birth_year: '', height_cm: '', weight_kg: '', resting_hr: '', max_hr: '', vo2max: '',
    experience_level: 'beginner', weekly_frequency: '', session_minutes: '',
    strength_score: '', endurance_score: '', flexibility_score: '', balance_score: '', paddle_skill_score: '',
    medical_notes: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getProfile().then((res) => {
      if (res.profile) {
        const p = res.profile
        const f: Record<string, any> = {}
        for (const k of Object.keys(form)) f[k] = p[k] != null && p[k] !== '' ? String(p[k]) : ''
        setForm(f)
      }
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, any> = {}
      for (const [k, v] of Object.entries(form)) {
        body[k] = v === '' ? null : (['birth_year', 'height_cm', 'weight_kg', 'resting_hr', 'max_hr', 'vo2max', 'weekly_frequency', 'session_minutes', 'strength_score', 'endurance_score', 'flexibility_score', 'balance_score', 'paddle_skill_score'].includes(k) ? Number(v) : v)
      }
      await api.saveProfile(body)
      toast.success('身体画像已保存')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-96 rounded-2xl shimmer" />

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight">身体画像</h1>
        <p className="text-sm text-muted-foreground">基本信息 + 身体素质指标，AI 教练制定计划的重要依据</p>
      </div>

      <Section icon={User} title="基本信息">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="昵称"><input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} className={inputCls} /></Field>
          <Field label="性别">
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={inputCls}>
              <option value="">未填</option><option value="male">男</option><option value="female">女</option>
            </select>
          </Field>
          <Field label="出生年份"><input type="number" value={form.birth_year} onChange={(e) => set('birth_year', e.target.value)} className={inputCls} /></Field>
          <Field label="经验等级">
            <select value={form.experience_level} onChange={(e) => set('experience_level', e.target.value)} className={inputCls}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section icon={Ruler} title="身体数据">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="身高 (cm)"><input type="number" value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} className={inputCls} /></Field>
          <Field label="体重 (kg)"><input type="number" value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} className={inputCls} /></Field>
          <Field label="静息心率 (bpm)"><input type="number" value={form.resting_hr} onChange={(e) => set('resting_hr', e.target.value)} className={inputCls} /></Field>
          <Field label="最大心率 (bpm)"><input type="number" value={form.max_hr} onChange={(e) => set('max_hr', e.target.value)} className={inputCls} /></Field>
          <Field label="VO2max"><input type="number" value={form.vo2max} onChange={(e) => set('vo2max', e.target.value)} className={inputCls} /></Field>
          <Field label="每周训练次数"><input type="number" value={form.weekly_frequency} onChange={(e) => set('weekly_frequency', e.target.value)} className={inputCls} /></Field>
          <Field label="单次时长 (min)"><input type="number" value={form.session_minutes} onChange={(e) => set('session_minutes', e.target.value)} className={inputCls} /></Field>
        </div>
      </Section>

      <Section icon={HeartPulse} title="身体素质自评（1-10）">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="力量"><ScoreInput value={form.strength_score} onChange={(v) => set('strength_score', v)} /></Field>
          <Field label="耐力"><ScoreInput value={form.endurance_score} onChange={(v) => set('endurance_score', v)} /></Field>
          <Field label="柔韧"><ScoreInput value={form.flexibility_score} onChange={(v) => set('flexibility_score', v)} /></Field>
          <Field label="平衡"><ScoreInput value={form.balance_score} onChange={(v) => set('balance_score', v)} /></Field>
          <Field label="划桨技术"><ScoreInput value={form.paddle_skill_score} onChange={(v) => set('paddle_skill_score', v)} /></Field>
        </div>
      </Section>

      <div className="rounded-2xl border border-border bg-card p-5">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">伤病/注意事项</label>
        <textarea value={form.medical_notes} onChange={(e) => set('medical_notes', e.target.value)} rows={3} placeholder="如：腰椎旧伤、肩袖不适、医生建议…" className={inputCls} />
      </div>

      <button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        保存画像
      </button>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary'

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function ScoreInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" min={1} max={10} value={value} onChange={(e) => onChange(e.target.value)} placeholder="-" className={inputCls} />
    </div>
  )
}
