import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Loader2, PlugZap, Save, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'

const PRESETS = [
  { name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', vision: false },
  { name: '智谱 GLM', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', vision: false },
  { name: '通义千问 Qwen', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', vision: false },
  { name: 'Qwen VL（视觉）', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-plus', vision: true },
  { name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: true },
  { name: 'Kimi', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', vision: false },
]

export default function Settings() {
  const [form, setForm] = useState({ base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', api_key: '', supports_vision: false })
  const [masked, setMasked] = useState('')
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    api.getLlmSettings().then((res) => {
      setConfigured(res.llm.configured)
      setMasked(res.llm.api_key_masked || '')
      if (res.llm.configured) {
        setForm((f) => ({ ...f, base_url: res.llm.base_url, model: res.llm.model, supports_vision: res.llm.supports_vision }))
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form.api_key && configured) {
      // 保留旧 key
      try {
        await api.saveLlmSettings({ base_url: form.base_url, model: form.model, supports_vision: form.supports_vision, keep_key: true })
        toast.success('设置已保存')
        setConfigured(true)
      } catch (e: any) {
        toast.error(e.message)
      }
      return
    }
    if (!form.api_key) {
      toast.error('请输入 API Key')
      return
    }
    setSaving(true)
    try {
      await api.saveLlmSettings({ base_url: form.base_url, model: form.model, api_key: form.api_key, supports_vision: form.supports_vision })
      toast.success('LLM 配置已保存（Key 加密存储）')
      setForm((f) => ({ ...f, api_key: '' }))
      setConfigured(true)
      setMasked(`${form.api_key.slice(0, 4)}****`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    const key = form.api_key
    if (!key) {
      toast.error('请先输入 API Key 再测试')
      return
    }
    setTesting(true)
    try {
      const res = await api.testLlm({ base_url: form.base_url, model: form.model, api_key: key })
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="h-96 rounded-2xl shimmer" />

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground">接入你自己的 LLM（多模态可选），Key 加密存储在本机</p>
      </div>

      {/* 状态 */}
      <div className={`flex items-center gap-3 rounded-2xl border p-4 ${configured ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${configured ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold">{configured ? 'LLM 已配置' : '尚未配置 LLM'}</div>
          <div className="text-xs text-muted-foreground">
            {configured ? `当前模型 ${form.model}${form.supports_vision ? '（支持视觉）' : ''}` : '配置后可启用 AI 评估 / 点评 / 知识解析'}
          </div>
        </div>
        {masked && <span className="ml-auto font-mono text-xs text-muted-foreground">{masked}</span>}
      </div>

      {/* 快捷预设 */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">快捷预设</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => setForm({ ...form, base_url: p.base_url, model: p.model, supports_vision: p.vision })}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/50 hover:text-primary"
            >
              {p.name}{p.vision && ' 👁'}
            </button>
          ))}
        </div>
      </div>

      {/* 配置表单 */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> 接口配置</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Base URL（OpenAI 兼容）</label>
            <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 font-mono text-sm outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">模型名称</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 font-mono text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-input bg-secondary/50 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">支持视觉（图片/视频）</span>
                <input type="checkbox" checked={form.supports_vision} onChange={(e) => setForm({ ...form, supports_vision: e.target.checked })} className="h-4 w-4 accent-[#FF6B35]" />
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">API Key {configured && !form.api_key && '（留空则保留当前 Key）'}</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder={configured ? '••••••••（已保存，留空不修改）' : 'sk-...'}
              className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存配置
            </button>
            <button onClick={() => void test()} disabled={testing} className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              测试连接
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground/60">
        🔒 API Key 使用 AES-256-GCM 加密存储于服务器本地，仅用于调用你指定的模型服务
      </p>
    </div>
  )
}
