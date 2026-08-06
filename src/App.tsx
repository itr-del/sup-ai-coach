import { Navigate, Route, Routes } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider, GuestOnly, RequireAuth } from '@/lib/auth'
import Shell from '@/components/Shell'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Assess from '@/pages/Assess'
import Plan from '@/pages/Plan'
import Checkin from '@/pages/Checkin'
import Knowledge from '@/pages/Knowledge'
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/" element={<RequireAuth><Shell /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="assess" element={<Assess />} />
          <Route path="plan" element={<Plan />} />
          <Route path="checkin" element={<Checkin />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster theme="dark" position="top-center" richColors />
    </AuthProvider>
  )
}
