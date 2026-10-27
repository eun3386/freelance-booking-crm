import { createHmac } from 'crypto'

// 인증번호는 평문으로 저장하지 않음
export const hashCode = (phone: string, code: string) =>
  createHmac('sha256', process.env.AUTH_SECRET ?? 'dev-only-secret-change-me').update(`${phone}:${code}`).digest('hex')
