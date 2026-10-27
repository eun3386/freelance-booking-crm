import { NextResponse } from 'next/server'
import { USERS, sign, getSession } from '@/lib/auth'

export async function GET() {
  return NextResponse.json({ session: getSession() })
}

export async function POST(req: Request) {
  const { username, password } = await req.json()
  const u = USERS[String(username)]
  if (!u || u.password !== password) return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  const session = { username: u.username, role: u.role, branchId: u.branchId }
  const res = NextResponse.json({ session })
  res.cookies.set('session', sign(session), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('session')
  return res
}
