import { createHash, timingSafeEqual } from 'crypto'

/** n8n 같은 자동화 도구와 연동하기 위한 모듈. 환경변수가 없으면 모든 기능이 꺼진다. */

/** N8N_WEBHOOK_URL 이 없으면 아무것도 하지 않고, 실패·지연이 예약 처리에 영향을 주지 않는다 */
export async function emitEvent(name: string, data: Record<string, unknown>): Promise<void> {
  const base = process.env.N8N_WEBHOOK_URL
  if (!base) return
  try {
    await fetch(`${base.replace(/\/$/, '')}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-automation-secret': process.env.AUTOMATION_SECRET ?? '' },
      body: JSON.stringify({ event: name, ...data }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {}
}

/** 자동화 전용 API 인증: `Authorization: Bearer <AUTOMATION_SECRET>`. 시크릿이 없으면 항상 거부 */
export function isAutomationAuthorized(req: Request): boolean {
  const secret = process.env.AUTOMATION_SECRET
  if (!secret) return false
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  // 길이를 맞추기 위해 해시 후 상수 시간 비교
  const h = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(h(given), h(secret))
}
