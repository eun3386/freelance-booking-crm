// Turso(libSQL = SQLite) 저장소. 스키마는 sqlite/schema.sql.
// 원격(libsql:// · https://) 전용 web 클라이언트를 사용해 네이티브 바이너리 없이 Vercel 서버리스에서 동작.
import { createClient } from '@libsql/client/web'
import { randomUUID } from 'crypto'
import { hashCode } from './otp'
import { OTP_MAX_TRIES, OTP_RESEND_MS, OTP_TTL_MS, SlotTakenError, type Booking, type Filter, type Repo } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Exec = (sql: string, args?: unknown[]) => Promise<any[]>

const COLS = 'id, branch_id, dept_id, date, time, name, phone, status, memo, created_at'

const toBooking = (r: any): Booking => ({
  id: r.id,
  branchId: r.branch_id,
  deptId: r.dept_id,
  date: r.date,
  time: r.time,
  name: r.name,
  phone: r.phone,
  status: r.status,
  memo: r.memo,
  createdAt: r.created_at,
})

const isUnique = (e: any) => /UNIQUE constraint failed/i.test(String(e?.message ?? e)) || e?.code === 'SQLITE_CONSTRAINT_UNIQUE'

export function makeTursoRepo(x: Exec): Repo {
  return {
    async takenTimes(branchId, deptId, date) {
      const rows = await x(`select time from bookings where branch_id = ? and dept_id = ? and date = ? and status <> 'cancelled'`, [branchId, deptId, date])
      return rows.map((r) => r.time)
    },

    async create(b) {
      try {
        const rows = await x(
          `insert into bookings (id, branch_id, dept_id, date, time, name, phone) values (?, ?, ?, ?, ?, ?, ?) returning ${COLS}`,
          [randomUUID(), b.branchId, b.deptId, b.date, b.time, b.name, b.phone],
        )
        return toBooking(rows[0])
      } catch (e) {
        if (isUnique(e)) throw new SlotTakenError() // bookings_no_double_booking
        throw e
      }
    },

    async list(f: Filter) {
      const where: string[] = []
      const p: unknown[] = []
      const add = (sql: string, v: unknown) => (where.push(sql), p.push(v))
      if (f.scopeBranch !== null) add('branch_id = ?', f.scopeBranch)
      if (f.branch) add('branch_id = ?', f.branch)
      if (f.dept) add('dept_id = ?', f.dept)
      if (f.status) add('status = ?', f.status)
      if (f.from) add('date >= ?', f.from)
      if (f.to) add('date <= ?', f.to)
      const text = (f.q ?? '').trim()
      if (text) {
        const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&')
        const digits = text.replace(/\D/g, '')
        if (digits) {
          where.push(`(name like ? escape '\\' or phone like ? escape '\\')`)
          p.push(`%${esc(text)}%`, `%${esc(digits)}%`)
        } else {
          where.push(`name like ? escape '\\'`)
          p.push(`%${esc(text)}%`)
        }
      }
      const rows = await x(`select ${COLS} from bookings ${where.length ? 'where ' + where.join(' and ') : ''} order by date, time`, p)
      return rows.map(toBooking)
    },

    async update(id, patch, scopeBranch) {
      try {
        const rows = await x(
          `update bookings set status = coalesce(?, status), memo = coalesce(?, memo)
           where id = ? and (? is null or branch_id = ?) returning ${COLS}`,
          [patch.status ?? null, patch.memo ?? null, id, scopeBranch, scopeBranch],
        )
        return rows[0] ? toBooking(rows[0]) : null
      } catch (e) {
        if (isUnique(e)) throw new SlotTakenError() // 취소 예약 복구 시 슬롯 충돌
        throw e
      }
    },

    async otpRequest(phone, code) {
      const now = Date.now()
      // 재전송 제한 시간 안이면 DO UPDATE 의 WHERE 가 거짓 → 0행 → throttled (한 문장으로 원자적 처리)
      const rows = await x(
        `insert into sms_otps (phone, code_hash, expires_at, tries, created_at) values (?, ?, ?, 0, ?)
         on conflict (phone) do update
           set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, created_at = excluded.created_at
           where sms_otps.created_at < ?
         returning phone`,
        [phone, hashCode(phone, code), now + OTP_TTL_MS, now, now - OTP_RESEND_MS],
      )
      return rows.length ? 'ok' : 'throttled'
    },

    async otpVerify(phone, code) {
      const rows = await x(`select code_hash, tries, expires_at from sms_otps where phone = ?`, [phone])
      const o = rows[0]
      if (!o || Number(o.expires_at) < Date.now()) return 'expired'
      if (Number(o.tries) >= OTP_MAX_TRIES) return 'locked'
      const hash = hashCode(phone, code)
      if (o.code_hash !== hash) {
        await x(`update sms_otps set tries = tries + 1 where phone = ?`, [phone])
        return 'wrong'
      }
      // DELETE ... RETURNING 으로 1회용 보장
      const del = await x(`delete from sms_otps where phone = ? and code_hash = ? returning phone`, [phone, hash])
      return del.length ? 'ok' : 'expired'
    },
  }
}

let client: ReturnType<typeof createClient> | undefined
export const tursoRepo: Repo = makeTursoRepo(async (sql, args = []) => {
  client ??= createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const res = await client.execute({ sql, args: args as any[] })
  return res.rows.map((r) => ({ ...r })) // Row → 일반 객체
})
