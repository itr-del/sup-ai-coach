/**
 * SUP AI Coach API 客户端（同源 /api，httpOnly cookie 认证）
 */

export type User = { id: number; username: string; display_name: string }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  })
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  // auth
  me: () => req<{ user: User }>('/auth/me'),
  register: (body: { username: string; password: string; display_name?: string }) =>
    req<{ ok: true; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    req<{ ok: true; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),

  // profile
  getProfile: () => req<{ profile: Record<string, any> | null }>('/profile'),
  saveProfile: (body: Record<string, any>) => req<{ ok: true; profile: any }>('/profile', { method: 'PUT', body: JSON.stringify(body) }),

  // assessments
  createAssessment: () => req<{ ok: true; id: number; opening: string }>('/assessments', { method: 'POST' }),
  listAssessments: () => req<{ assessments: any[] }>('/assessments'),
  getMessages: (id: number) => req<{ messages: any[]; assessment: any }>(`/assessments/${id}/messages`),
  completeAssessment: (id: number) => req<{ ok: true; assessment: any }>(`/assessments/${id}/complete`, { method: 'POST' }),
  generatePlan: (id: number, body: { goal?: Record<string, any>; weeks?: number; start_date?: string }) =>
    req<{ ok: true; planId: number; title: string; workoutCount: number }>(`/assessments/${id}/plan`, { method: 'POST', body: JSON.stringify(body) }),

  // checkins
  saveCheckin: (body: Record<string, any>) => req<{ ok: true; checkin: any }>('/checkins', { method: 'POST', body: JSON.stringify(body) }),
  listCheckins: (from?: string, to?: string) =>
    req<{ checkins: any[] }>(`/checkins${from ? `?from=${from}&to=${to ?? ''}` : ''}`),
  getCheckinByDate: (date: string) => req<{ checkin: any | null }>(`/checkins/date/${date}`),
  reviewCheckin: (id: number) => req<{ ok: true; review: { ai_review: string; strengths: string; weaknesses: string } }>(`/checkins/${id}/review`, { method: 'POST' }),

  // dashboard
  overview: () => req<{ overview: any }>('/dashboard/overview'),
  phases: () => req<{ phases: any[]; plan: any }>('/dashboard/phases'),
  dayDetail: (date: string) => req<{ date: string; workout: any | null; checkin: any | null }>(`/dashboard/day/${date}`),
  trend: (key: string, days = 30) => req<{ key: string; points: any[] }>(`/dashboard/trend?key=${key}&days=${days}`),

  // knowledge
  listKnowledge: () => req<{ knowledge: any[] }>('/knowledge'),
  createKnowledge: (body: Record<string, any>) => req<{ ok: true; knowledge: any }>('/knowledge', { method: 'POST', body: JSON.stringify(body) }),
  parseKnowledge: (id: number) => req<{ ok: true; knowledge: any }>(`/knowledge/${id}/parse`, { method: 'POST' }),
  deleteKnowledge: (id: number) => req<{ ok: true }>(`/knowledge/${id}`, { method: 'DELETE' }),

  // plan
  listGoals: () => req<{ goals: any[] }>('/plan/goals'),
  createGoal: (body: Record<string, any>) => req<{ ok: true; goal: any }>('/plan/goals', { method: 'POST', body: JSON.stringify(body) }),
  listPlans: () => req<{ plans: any[] }>('/plan/plans'),
  getPlan: (id: number) => req<{ plan: any; workouts: any[] }>(`/plan/plans/${id}`),
  setWorkoutStatus: (id: number, status: string) => req<{ ok: true; workout: any }>(`/plan/workouts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // settings
  getLlmSettings: () => req<{ llm: any }>('/settings/llm'),
  saveLlmSettings: (body: Record<string, any>) => req<{ ok: true; llm: any }>('/settings/llm', { method: 'POST', body: JSON.stringify(body) }),
  testLlm: (body: { base_url: string; model: string; api_key: string }) =>
    req<{ ok: true; message: string }>('/settings/llm/test', { method: 'POST', body: JSON.stringify(body) }),

  // upload
  upload: async (file: File): Promise<{ ok: true; attachment: any }> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
    if (!res.ok) {
      let msg = '上传失败'
      try {
        const data = await res.json()
        if (data?.error) msg = data.error
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, msg)
    }
    return res.json()
  },
}

/** 流式对话：POST + ReadableStream 解析 SSE */
export async function streamChat(
  assessmentId: number,
  body: { text: string; attachments: Array<{ url: string; type: string }> },
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch(`/api/assessments/${assessmentId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = '对话失败'
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  if (!res.body) throw new ApiError(500, '无响应流')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (!payload) continue
      try {
        const json = JSON.parse(payload)
        if (json.delta) {
          full += json.delta
          onDelta(json.delta)
        }
        if (json.done) return full
      } catch {
        /* ignore */
      }
    }
  }
  return full
}

export function paceToSec(pace: string): number | null {
  const m = pace.trim().match(/^(\d+):(\d+)$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
