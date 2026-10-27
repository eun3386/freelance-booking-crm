import type { Status } from './config'

export interface Booking {
  id: string
  branchId: string
  deptId: string
  date: string
  time: string
  name: string
  phone: string
  status: Status
  memo: string
  createdAt: string
}

export type NewBooking = Pick<Booking, 'branchId' | 'deptId' | 'date' | 'time' | 'name' | 'phone'>

export interface Filter {
  scopeBranch: string | null // 권한 범위 (null = 전체 지점). 항상 서버에서 주입
  branch?: string
  dept?: string
  status?: string
  q?: string
  from?: string
  to?: string
}

export type OtpResult = 'ok' | 'expired' | 'locked' | 'wrong'

export class SlotTakenError extends Error {}

export interface Repo {
  /** 해당 지점·진료과·날짜에서 이미 찼거나 예약 대기 중인 시간 (취소 제외) */
  takenTimes(branchId: string, deptId: string, date: string): Promise<string[]>
  /** 중복 슬롯이면 SlotTakenError */
  create(b: NewBooking): Promise<Booking>
  list(f: Filter): Promise<Booking[]>
  /** 권한 범위 밖이거나 없으면 null */
  update(id: string, patch: { status?: Status; memo?: string }, scopeBranch: string | null): Promise<Booking | null>
  /** 60초 내 재요청이면 'throttled' */
  otpRequest(phone: string, code: string): Promise<'ok' | 'throttled'>
  otpVerify(phone: string, code: string): Promise<OtpResult>
}

export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_RESEND_MS = 60 * 1000
export const OTP_MAX_TRIES = 5
