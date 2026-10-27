import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const SECRET = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me'

export type Role = 'admin' | 'manager' | 'staff'
export interface Session {
  username: string
  role: Role
  branchId: string | null // null = 전체 지점
}

// 데모 계정 (운영에서는 Supabase Auth + 역할 테이블 사용)
export const USERS: Record<string, Session & { password: string }> = {
  admin: { username: 'admin', password: 'admin1234', role: 'admin', branchId: null },
  gangnam: { username: 'gangnam', password: 'manager1234', role: 'manager', branchId: 'gangnam' },
  haeundae: { username: 'haeundae', password: 'staff1234', role: 'staff', branchId: 'haeundae' },
}

export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verify<T>(token: string | undefined): T | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}

export function getSession(): Session | null {
  return verify<Session>(cookies().get('session')?.value)
}

export const canEdit = (s: Session) => s.role === 'admin' || s.role === 'manager'
export const canSee = (s: Session, branchId: string) => s.branchId === null || s.branchId === branchId
