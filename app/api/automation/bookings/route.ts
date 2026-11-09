import { NextResponse } from 'next/server'
import { isAutomationAuthorized } from '@/lib/automation'
import { STATUS_LABEL, branchName, deptName } from '@/lib/config'
import { repo } from '@/lib/repo'

// 자동화(n8n) 전용 조회. 연락처가 포함되므로 반드시 AUTOMATION_SECRET 으로 보호한다.
// GET /api/automation/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD  (최대 31일, 양 끝 포함)
export async function GET(req: Request) {
  if (!isAutomationAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const from = q.get('from') ?? ''
  const to = q.get('to') ?? from
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (!ok(from) || !ok(to) || to < from) return NextResponse.json({ error: 'from/to 를 YYYY-MM-DD 로 지정하세요.' }, { status: 400 })
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 31) return NextResponse.json({ error: '조회 범위는 최대 31일입니다.' }, { status: 400 })

  const rows = await repo.list({ scopeBranch: null, from, to })
  return NextResponse.json({
    bookings: rows.map((b) => ({
      ...b,
      branchName: branchName(b.branchId),
      deptName: deptName(b.deptId),
      statusLabel: STATUS_LABEL[b.status],
    })),
  })
}
