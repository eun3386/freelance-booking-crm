import type { Session } from './auth'
import type { Filter } from './types'

// 쿼리스트링 → 필터. 권한 범위(scopeBranch)는 세션에서만 가져오고 클라이언트 값은 신뢰하지 않음
export function toFilter(s: Session, q: URLSearchParams): Filter {
  return {
    scopeBranch: s.branchId,
    branch: q.get('branch') || undefined,
    dept: q.get('dept') || undefined,
    status: q.get('status') || undefined,
    q: q.get('q') || undefined,
    from: q.get('from') || undefined,
    to: q.get('to') || undefined,
  }
}
