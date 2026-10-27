// 로컬 데모용 파일 저장소 (Supabase 환경변수가 없을 때 사용). Vercel 등 서버리스에서는 쓰기가 유지되지 않음.
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { TIMES, type Status } from './config'
import { hashCode } from './otp'
import { OTP_MAX_TRIES, OTP_RESEND_MS, OTP_TTL_MS, SlotTakenError, type Booking, type Filter, type Repo } from './types'

interface DB {
  bookings: Booking[]
  otps: Record<string, { hash: string; exp: number; created: number; tries: number }>
}

const FILE = process.env.DATA_FILE ?? path.join(process.cwd(), '.data', 'db.json')

async function load(): Promise<DB> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'))
  } catch {
    return seed()
  }
}

async function save(db: DB) {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(db, null, 2))
}

// 모든 읽기/쓰기를 하나의 큐로 직렬화 → 동시 예약 요청에서도 중복 예약이 생기지 않음
let queue: Promise<unknown> = Promise.resolve()
function withDb<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load()
    const result = await fn(db)
    await save(db)
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

const isTaken = (db: DB, b: Pick<Booking, 'branchId' | 'deptId' | 'date' | 'time'>) =>
  db.bookings.some((x) => x.status !== 'cancelled' && x.branchId === b.branchId && x.deptId === b.deptId && x.date === b.date && x.time === b.time)

export const fileRepo: Repo = {
  takenTimes: (branchId, deptId, date) =>
    withDb((db) => db.bookings.filter((x) => x.status !== 'cancelled' && x.branchId === branchId && x.deptId === deptId && x.date === date).map((x) => x.time)),

  create: (b) =>
    withDb((db) => {
      if (isTaken(db, b)) throw new SlotTakenError()
      const row: Booking = { ...b, id: randomUUID(), status: 'pending', memo: '', createdAt: new Date().toISOString() }
      db.bookings.push(row)
      return row
    }),

  list: async (f: Filter) => {
    const text = (f.q ?? '').trim().toLowerCase()
    const digits = text.replace(/\D/g, '')
    const rows = await withDb((db) => db.bookings.slice())
    return rows
      .filter((b) => f.scopeBranch === null || b.branchId === f.scopeBranch)
      .filter((b) => !f.branch || b.branchId === f.branch)
      .filter((b) => !f.status || b.status === f.status)
      .filter((b) => !f.dept || b.deptId === f.dept)
      .filter((b) => !f.from || b.date >= f.from)
      .filter((b) => !f.to || b.date <= f.to)
      .filter((b) => !text || b.name.toLowerCase().includes(text) || (digits !== '' && b.phone.includes(digits)))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  },

  update: (id, patch, scopeBranch) =>
    withDb((db) => {
      const b = db.bookings.find((x) => x.id === id)
      if (!b || (scopeBranch !== null && b.branchId !== scopeBranch)) return null
      // 취소 예약을 되살릴 때 같은 슬롯에 다른 예약이 있으면 거절
      if (patch.status && patch.status !== 'cancelled' && b.status === 'cancelled' && isTaken(db, b)) throw new SlotTakenError()
      if (patch.status) b.status = patch.status
      if (patch.memo !== undefined) b.memo = patch.memo
      return b
    }),

  otpRequest: (phone, code) =>
    withDb((db) => {
      const prev = db.otps[phone]
      if (prev && Date.now() - prev.created < OTP_RESEND_MS) return 'throttled' as const
      db.otps[phone] = { hash: hashCode(phone, code), exp: Date.now() + OTP_TTL_MS, created: Date.now(), tries: 0 }
      return 'ok' as const
    }),

  otpVerify: (phone, code) =>
    withDb((db) => {
      const o = db.otps[phone]
      if (!o || o.exp < Date.now()) return 'expired' as const
      if (o.tries >= OTP_MAX_TRIES) return 'locked' as const
      if (o.hash !== hashCode(phone, code)) {
        o.tries++
        return 'wrong' as const
      }
      delete db.otps[phone]
      return 'ok' as const
    }),
}

function seed(): DB {
  const names = ['김서연', '이도윤', '박지우', '최하준', '정수아', '한민재', '오지안', '윤서진']
  const branches = ['gangnam', 'haeundae', 'daegu']
  const depts = ['skin', 'body', 'consult']
  const statuses: Status[] = ['confirmed', 'pending', 'confirmed', 'cancelled']
  const bookings: Booking[] = []
  const base = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + (i % 9) - 2)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const b: Booking = {
      id: `seed${i}`,
      branchId: branches[i % 3],
      deptId: depts[i % 3 === 0 ? 0 : (i + 1) % 3],
      date,
      time: TIMES[(i * 3) % TIMES.length],
      name: names[i % names.length],
      phone: `0101234${String(1000 + i)}`,
      status: statuses[i % 4],
      memo: '',
      createdAt: new Date().toISOString(),
    }
    if (!bookings.some((x) => x.branchId === b.branchId && x.deptId === b.deptId && x.date === b.date && x.time === b.time)) bookings.push(b)
  }
  return { bookings, otps: {} }
}
