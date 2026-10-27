// Neon(서버리스 PostgreSQL) 저장소. 연결 문자열(DATABASE_URL)은 서버 전용이며 브라우저에 노출되지 않음.
// SQL은 supabase/schema.sql 과 동일한 스키마를 사용 (Neon은 표준 PostgreSQL).
import { neon } from '@neondatabase/serverless'
import { hashCode } from './otp'
import { OTP_MAX_TRIES, OTP_RESEND_MS, OTP_TTL_MS, SlotTakenError, type Booking, type Filter, type Repo } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Query = (text: string, params?: unknown[]) => Promise<any[]>

// date/time/timestamp 를 DB에서 문자열로 확정해 시간대 변환 문제를 피함
const COLS = `id, branch_id, dept_id, to_char(date, 'YYYY-MM-DD') as date, to_char(time, 'HH24:MI') as time, name, phone, status, memo, created_at`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  createdAt: new Date(r.created_at).toISOString(),
})

export function makeNeonRepo(q: Query): Repo {
  return {
    async takenTimes(branchId, deptId, date) {
      const rows = await q(
        `select to_char(time, 'HH24:MI') as time from bookings
          where branch_id = $1 and dept_id = $2 and date = $3 and status <> 'cancelled'`,
        [branchId, deptId, date],
      )
      return rows.map((r) => r.time)
    },

    async create(b) {
      try {
        const rows = await q(
          `insert into bookings (branch_id, dept_id, date, time, name, phone)
           values ($1, $2, $3, $4, $5, $6) returning ${COLS}`,
          [b.branchId, b.deptId, b.date, b.time, b.name, b.phone],
        )
        return toBooking(rows[0])
      } catch (e: any) {
        // 23505 = unique_violation → bookings_no_double_booking 인덱스가 동시 요청 중 늦은 쪽을 거절
        if (e?.code === '23505') throw new SlotTakenError()
        throw e
      }
    },

    async list(f: Filter) {
      const where: string[] = []
      const p: unknown[] = []
      const add = (sql: string, v: unknown) => (p.push(v), where.push(sql.replace('?', `$${p.length}`)))
      if (f.scopeBranch !== null) add('branch_id = ?', f.scopeBranch)
      if (f.branch) add('branch_id = ?', f.branch)
      if (f.dept) add('dept_id = ?', f.dept)
      if (f.status) add('status = ?::booking_status', f.status)
      if (f.from) add('date >= ?::date', f.from)
      if (f.to) add('date <= ?::date', f.to)
      const text = (f.q ?? '').trim()
      if (text) {
        const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&') // LIKE 와일드카드 이스케이프
        const digits = text.replace(/\D/g, '')
        p.push(`%${esc(text)}%`)
        const nameIdx = p.length
        if (digits) {
          p.push(`%${esc(digits)}%`)
          where.push(`(name ilike $${nameIdx} or phone like $${p.length})`)
        } else where.push(`name ilike $${nameIdx}`)
      }
      const rows = await q(
        `select ${COLS} from bookings ${where.length ? 'where ' + where.join(' and ') : ''} order by bookings.date, bookings.time`,
        p,
      )
      return rows.map(toBooking)
    },

    async update(id, patch, scopeBranch) {
      if (!UUID.test(id)) return null
      // 권한 범위를 UPDATE 조건에 포함 (조회 후 수정하는 경쟁 구간이 없음)
      try {
        const rows = await q(
          `update bookings set
             status = coalesce($2::booking_status, status),
             memo = coalesce($3, memo)
           where id = $1 and ($4::text is null or branch_id = $4)
           returning ${COLS}`,
          [id, patch.status ?? null, patch.memo ?? null, scopeBranch],
        )
        return rows[0] ? toBooking(rows[0]) : null
      } catch (e: any) {
        // 취소된 예약을 되살리려는데 그 시간에 이미 다른 예약이 있는 경우
        if (e?.code === '23505') throw new SlotTakenError()
        throw e
      }
    },

    async otpRequest(phone, code) {
      // 재전송 제한 시간 안이면 UPDATE 가 일어나지 않아 0행 → throttled (한 문장으로 원자적 처리)
      const rows = await q(
        `insert into sms_otps (phone, code_hash, expires_at, tries, created_at)
         values ($1, $2, now() + make_interval(secs => $3), 0, now())
         on conflict (phone) do update
           set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, created_at = now()
           where sms_otps.created_at < now() - make_interval(secs => $4)
         returning phone`,
        [phone, hashCode(phone, code), OTP_TTL_MS / 1000, OTP_RESEND_MS / 1000],
      )
      return rows.length ? 'ok' : 'throttled'
    },

    async otpVerify(phone, code) {
      const rows = await q(`select code_hash, tries, expires_at > now() as live from sms_otps where phone = $1`, [phone])
      const o = rows[0]
      if (!o || !o.live) return 'expired'
      if (o.tries >= OTP_MAX_TRIES) return 'locked'
      const hash = hashCode(phone, code)
      if (o.code_hash !== hash) {
        await q(`update sms_otps set tries = tries + 1 where phone = $1`, [phone])
        return 'wrong'
      }
      // DELETE ... RETURNING 으로 1회용 보장: 동시에 두 번 검증해도 한 번만 성공
      const del = await q(`delete from sms_otps where phone = $1 and code_hash = $2 returning phone`, [phone, hash])
      return del.length ? 'ok' : 'expired'
    },
  }
}

let sql: ReturnType<typeof neon> | undefined
export const neonRepo: Repo = makeNeonRepo(async (text, params) => {
  sql ??= neon(process.env.DATABASE_URL!)
  return (await sql.query(text, params as any[])) as any[]
})
