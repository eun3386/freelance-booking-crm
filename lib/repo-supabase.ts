// Supabase(PostgreSQL) 저장소. 서버에서만 service role 키로 접근하며, 브라우저에는 키가 노출되지 않음.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hashCode } from './otp'
import { OTP_MAX_TRIES, OTP_RESEND_MS, OTP_TTL_MS, SlotTakenError, type Booking, type Repo } from './types'

let client: SupabaseClient | undefined
const sb = () =>
  (client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }))

/* eslint-disable @typescript-eslint/no-explicit-any */
const toBooking = (r: any): Booking => ({
  id: r.id,
  branchId: r.branch_id,
  deptId: r.dept_id,
  date: r.date,
  time: String(r.time).slice(0, 5), // 'HH:MM:SS' -> 'HH:MM'
  name: r.name,
  phone: r.phone,
  status: r.status,
  memo: r.memo,
  createdAt: r.created_at,
})

function check<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`)
  return res.data
}

export const supabaseRepo: Repo = {
  async takenTimes(branchId, deptId, date) {
    const rows = check(
      await sb().from('bookings').select('time').eq('branch_id', branchId).eq('dept_id', deptId).eq('date', date).neq('status', 'cancelled'),
    )
    return (rows as any[]).map((r) => String(r.time).slice(0, 5))
  },

  async create(b) {
    const { data, error } = await sb()
      .from('bookings')
      .insert({ branch_id: b.branchId, dept_id: b.deptId, date: b.date, time: b.time, name: b.name, phone: b.phone })
      .select()
      .single()
    // 23505 = unique_violation → bookings_no_double_booking 인덱스가 동시 요청 중 늦은 쪽을 거절
    if (error?.code === '23505') throw new SlotTakenError()
    if (error) throw new Error(`Supabase: ${error.message}`)
    return toBooking(data)
  },

  async list(f) {
    let q = sb().from('bookings').select('*').order('date').order('time')
    if (f.scopeBranch !== null) q = q.eq('branch_id', f.scopeBranch)
    if (f.branch) q = q.eq('branch_id', f.branch)
    if (f.dept) q = q.eq('dept_id', f.dept)
    if (f.status) q = q.eq('status', f.status)
    if (f.from) q = q.gte('date', f.from)
    if (f.to) q = q.lte('date', f.to)
    const text = (f.q ?? '').trim().replace(/[,()%*\\]/g, '') // or() 필터 문법 문자 제거
    if (text) {
      const digits = text.replace(/\D/g, '')
      q = q.or([`name.ilike.%${text}%`, digits ? `phone.ilike.%${digits}%` : ''].filter(Boolean).join(','))
    }
    return (check(await q) as any[]).map(toBooking)
  },

  async update(id, patch, scopeBranch) {
    const fields: Record<string, unknown> = {}
    if (patch.status) fields.status = patch.status
    if (patch.memo !== undefined) fields.memo = patch.memo
    let q = sb().from('bookings').update(fields).eq('id', id)
    if (scopeBranch !== null) q = q.eq('branch_id', scopeBranch) // 권한 범위를 UPDATE 조건에 포함
    const { data, error } = await q.select().maybeSingle()
    if (error?.code === '23505') throw new SlotTakenError() // 취소 예약 복구 시 슬롯 충돌
    if (error) throw new Error(`Supabase: ${error.message}`)
    return data ? toBooking(data) : null
  },

  async otpRequest(phone, code) {
    const prev = check(await sb().from('sms_otps').select('created_at').eq('phone', phone).maybeSingle()) as any
    if (prev && Date.now() - new Date(prev.created_at).getTime() < OTP_RESEND_MS) return 'throttled'
    check(
      await sb().from('sms_otps').upsert({
        phone,
        code_hash: hashCode(phone, code),
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        tries: 0,
        created_at: new Date().toISOString(),
      }),
    )
    return 'ok'
  },

  async otpVerify(phone, code) {
    const o = check(await sb().from('sms_otps').select('*').eq('phone', phone).maybeSingle()) as any
    if (!o || new Date(o.expires_at).getTime() < Date.now()) return 'expired'
    if (o.tries >= OTP_MAX_TRIES) return 'locked'
    if (o.code_hash !== hashCode(phone, code)) {
      check(await sb().from('sms_otps').update({ tries: o.tries + 1 }).eq('phone', phone))
      return 'wrong'
    }
    check(await sb().from('sms_otps').delete().eq('phone', phone))
    return 'ok'
  },
}
