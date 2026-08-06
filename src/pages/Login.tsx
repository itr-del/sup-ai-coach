import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Dumbbell, Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const { refresh } = useAuth()
  const nav = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('请输入用户名和密码')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        await api.login({ username, password })
      } else {
        if (password.length < 6) {
          toast.error('密码至少 6 位')
          setBusy(false)
          return
        }
        await api.register({ username, password, display_name: displayName || username })
      }
      await refresh()
      toast.success(mode === 'login' ? '欢迎回来！' : '注册成功，开始训练！')
      nav('/', { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-[0.04]">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="34" fill="none" stroke="white" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="20" fill="none" stroke="white" strokeWidth="0.5" />
            <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="0.3" />
            <line x1="50" y1="2" x2="50" y2="98" stroke="white" strokeWidth="0.3" />
          </svg>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary clip-angle glow-orange">
            <Dumbbell className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-brand text-2xl font-bold tracking-tight">SUP AI COACH</h1>
          <p className="mt-1 text-sm text-muted-foreground">桨板训练大脑 · 从评估到突破</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md py-2 text-sm font-medium transition-colors',
                  mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">昵称</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="怎么称呼你？"
                  className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">用户名</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? '进入训练' : '创建账号'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          AI 技能评估 · 个性化训练计划 · 每日打卡点评 · 知识库支撑
        </p>
      </div>
    </div>
  )
}
