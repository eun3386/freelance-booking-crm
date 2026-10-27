import { NextResponse } from 'next/server'
import { isPhone, normalizePhone } from '@/lib/config'
import { repo } from '@/lib/repo'

// 데모: SMS를 실제로 보내지 않고 응답에 인증번호를 포함 (devCode).
// 운영: 아래 지점에서 알리고/NHN Cloud/Twilio 등 발송 API 호출 후 devCode 제거.
export async function POST(req: Request) {
  const { phone } = await req.json()
  if (!isPhone(String(phone))) return NextResponse.json({ error: '휴대폰 번호를 확인해주세요.' }, { status: 400 })
  const p = normalizePhone(phone)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  if ((await repo.otpRequest(p, code)) === 'throttled') return NextResponse.json({ error: '잠시 후 다시 요청해주세요.' }, { status: 429 })
  return NextResponse.json({ ok: true, devCode: process.env.SMS_PROVIDER ? undefined : code })
}
