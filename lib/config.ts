export const BRANCHES = [
  { id: 'gangnam', name: '강남점' },
  { id: 'haeundae', name: '해운대점' },
  { id: 'daegu', name: '대구점' },
] as const

export const DEPARTMENTS = [
  { id: 'skin', name: '피부 클리닉' },
  { id: 'body', name: '바디 케어' },
  { id: 'consult', name: '상담' },
] as const

export const STATUS_LABEL = { pending: '대기', confirmed: '확정', cancelled: '취소' } as const
export type Status = keyof typeof STATUS_LABEL

// 10:00~17:30, 30분 단위, 점심(12:00~13:00) 제외
export const TIMES = Array.from({ length: 16 }, (_, i) => {
  const m = 10 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}).filter((t) => !['12:00', '12:30'].includes(t))

export const branchName = (id: string) => BRANCHES.find((b) => b.id === id)?.name ?? id
export const deptName = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.name ?? id

export const normalizePhone = (v: string) => v.replace(/\D/g, '')
export const isPhone = (v: string) => /^01[016789]\d{7,8}$/.test(normalizePhone(v))
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
