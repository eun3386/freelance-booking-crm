import { getSession } from '@/lib/auth'
import { STATUS_LABEL, branchName, deptName } from '@/lib/config'
import { toFilter } from '@/lib/filter'
import { repo } from '@/lib/repo'

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`

export async function GET(req: Request) {
  const s = getSession()
  if (!s) return new Response('unauthorized', { status: 401 })
  const rows = await repo.list(toFilter(s, new URL(req.url).searchParams))
  const head = ['예약일', '시간', '지점', '진료과', '이름', '연락처', '상태', '메모', '접수일시']
  const lines = rows.map((b) =>
    [b.date, b.time, branchName(b.branchId), deptName(b.deptId), b.name, b.phone, STATUS_LABEL[b.status], b.memo, b.createdAt].map(esc).join(','),
  )
  // UTF-8 BOM: 엑셀에서 한글 깨짐 방지
  const csv = '﻿' + [head.map(esc).join(','), ...lines].join('\r\n')
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="bookings.csv"' },
  })
}
