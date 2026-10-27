import { NextResponse } from 'next/server'
import { canEdit, getSession } from '@/lib/auth'
import { STATUS_LABEL } from '@/lib/config'
import { toFilter } from '@/lib/filter'
import { repo } from '@/lib/repo'
import { SlotTakenError } from '@/lib/types'

export async function GET(req: Request) {
  const s = getSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ bookings: await repo.list(toFilter(s, new URL(req.url).searchParams)) })
}

export async function PATCH(req: Request) {
  const s = getSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: '변경 권한이 없습니다.' }, { status: 403 })
  const { id, status, memo } = await req.json()
  if (status !== undefined && !(status in STATUS_LABEL)) return NextResponse.json({ error: 'bad status' }, { status: 400 })
  if (status === undefined && typeof memo !== 'string') return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  let updated
  try {
    updated = await repo.update(String(id), { status, memo: typeof memo === 'string' ? memo.slice(0, 500) : undefined }, s.branchId)
  } catch (e) {
    if (e instanceof SlotTakenError) return NextResponse.json({ error: '같은 시간에 이미 다른 예약이 있어 복구할 수 없습니다.' }, { status: 409 })
    throw e
  }
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ booking: updated })
}
