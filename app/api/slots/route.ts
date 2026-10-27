import { NextResponse } from 'next/server'
import { TIMES } from '@/lib/config'
import { repo } from '@/lib/repo'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const branchId = q.get('branch') ?? ''
  const deptId = q.get('dept') ?? ''
  const date = q.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'bad date' }, { status: 400 })
  const day = new Date(date + 'T00:00:00').getDay()
  const taken = new Set(await repo.takenTimes(branchId, deptId, date))
  const times = TIMES.map((time) => ({ time, available: day !== 0 && !taken.has(time) }))
  return NextResponse.json({ times })
}
