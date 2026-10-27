import { NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/config'
import { repo } from '@/lib/repo'
import { sign } from '@/lib/auth'

export async function POST(req: Request) {
  const { phone, code } = await req.json()
  const p = normalizePhone(String(phone))
  const result = await repo.otpVerify(p, String(code))
  if (result !== 'ok') {
    const msg = { expired: '인증번호가 만료되었습니다.', locked: '시도 횟수를 초과했습니다.', wrong: '인증번호가 일치하지 않습니다.' }[result]
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  // 인증 완료 토큰 (10분 유효, 해당 번호에만 사용 가능)
  return NextResponse.json({ token: sign({ phone: p, exp: Date.now() + 10 * 60 * 1000 }) })
}
