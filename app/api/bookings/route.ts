import { NextResponse } from 'next/server'
import { BRANCHES, DEPARTMENTS, TIMES, normalizePhone } from '@/lib/config'
import { repo } from '@/lib/repo'
import { SlotTakenError } from '@/lib/types'
import { verify } from '@/lib/auth'

export async function POST(req: Request) {
  const b = await req.json()
  const phone = normalizePhone(String(b.phone ?? ''))
  const tok = verify<{ phone: string; exp: number }>(b.token)
  if (!tok || tok.phone !== phone || tok.exp < Date.now())
    return NextResponse.json({ error: '휴대폰 인증이 필요합니다.' }, { status: 401 })

  const name = String(b.name ?? '').trim()
  const valid =
    name.length >= 2 &&
    name.length <= 20 &&
    BRANCHES.some((x) => x.id === b.branchId) &&
    DEPARTMENTS.some((x) => x.id === b.deptId) &&
    TIMES.includes(b.time) &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
    new Date(b.date + 'T00:00:00').getDay() !== 0
  if (!valid) return NextResponse.json({ error: '입력값을 확인해주세요.' }, { status: 400 })

  try {
    const booking = await repo.create({ branchId: b.branchId, deptId: b.deptId, date: b.date, time: b.time, name, phone })
    return NextResponse.json({ booking })
  } catch (e) {
    if (e instanceof SlotTakenError) return NextResponse.json({ error: '방금 다른 고객이 예약한 시간입니다. 다른 시간을 선택해주세요.' }, { status: 409 })
    throw e
  }
}
