import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

type AuthState = {
  user: { id: number; username: string; display_name: string } | null
  loading: boolean
  refresh: () => Promise<void>
  setUser: (user: { id: number; username: string; display_name: string }) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState['user']>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await api.me()
      setUser(res.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      window.location.assign('/login')
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading, refresh, setUser, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-dark-bg">
        <Loader2 className="h-6 w-6 animate-spin text-glow" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />
  return <>{children}</>
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-dark-bg">
        <Loader2 className="h-6 w-6 animate-spin text-glow" />
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}
