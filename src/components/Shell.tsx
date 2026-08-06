import { NavLink, Outlet } from 'react-router'
import { Activity, BookOpen, CalendarCheck, Dumbbell, Gauge, LogOut, MessageSquareText, Settings as SettingsIcon, User } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: '总览', icon: Gauge, end: true },
  { to: '/assess', label: 'AI 评估', icon: MessageSquareText },
  { to: '/plan', label: '训练计划', icon: CalendarCheck },
  { to: '/checkin', label: '每日打卡', icon: Activity },
  { to: '/knowledge', label: '知识库', icon: BookOpen },
  { to: '/profile', label: '身体画像', icon: User },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

export default function Shell() {
  const isMobile = useIsMobile()
  const { user, logout } = useAuth()

  if (isMobile) {
    return (
      <div className="min-h-[100dvh] bg-background pb-16">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary clip-angle-sm">
              <Dumbbell className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-brand text-sm font-bold leading-none">SUP AI COACH</div>
              <div className="text-[10px] text-muted-foreground">桨板训练大脑</div>
            </div>
          </div>
          <button onClick={() => void logout()} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary">
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        <main className="mx-auto max-w-3xl px-3 py-4">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-safe backdrop-blur">
          <div className="grid grid-cols-5">
            {NAV.slice(0, 5).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('flex flex-col items-center gap-0.5 py-2 text-[10px]', isActive ? 'text-primary' : 'text-muted-foreground')
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary clip-angle">
            <Dumbbell className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-brand text-base font-bold leading-tight text-sidebar-foreground">SUP AI COACH</div>
            <div className="text-[11px] text-sidebar-foreground/60">桨板训练大脑 · v1.0</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'bg-sidebar-accent text-sidebar-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                )
              }
            >
              <item.icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
              {(user?.display_name || user?.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-sidebar-foreground">{user?.display_name || user?.username}</div>
              <div className="truncate text-[11px] text-sidebar-foreground/50">@{user?.username}</div>
            </div>
          </div>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <LogOut className="h-3.5 w-3.5" /> 退出登录
          </button>
        </div>
      </aside>
      <main className="ml-56 flex-1 px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
