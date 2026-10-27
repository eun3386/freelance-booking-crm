# 멀티 지점 예약 & 어드민 CRM

병원·뷰티·학원 등 지점형 비즈니스용 **예약 스케줄러 + 관리자 백오피스**.
Next.js 14 (App Router) · Tailwind CSS · TypeScript.

## 기능
**고객 화면 (모바일 우선)**
- 지점 → 진료과 → 날짜 → 시간 슬롯 선택 (마감 슬롯 비활성, 일요일/점심시간 제외)
- 비회원 휴대폰 SMS 인증 (인증번호 5분 유효, 5회 오류 잠금, 재전송 제한) 후 예약
- 동시 예약 충돌 시 409 안내 + 슬롯 자동 갱신

**관리자 화면**
- 상태별 현황 카드(클릭 필터), 목록/월간 캘린더 뷰, 일자 클릭 필터
- 지점·진료과·상태 필터, 이름/연락처 검색
- 상태 변경 (대기 / 확정 / 취소)
- 엑셀용 CSV 다운로드 (UTF-8 BOM, 현재 필터 반영)
- 역할별 권한(RBAC), 서버에서 강제

| 역할 | 조회 범위 | 상태 변경 | 비고 |
|---|---|---|---|
| 총괄 관리자 | 전 지점 | ✅ | |
| 지점 관리자 | 본인 지점 | ✅ | |
| 직원 | 본인 지점 | ❌ 읽기 전용 | API도 403 |

## 실행
```bash
npm install
npm run dev     # http://localhost:3000   (관리자: /admin)
```
데모 계정(로컬 데모 전용): `admin / admin1234`, `gangnam / manager1234`, `haeundae / staff1234`

## 저장소: 환경변수 하나로 전환 (Turso / Neon / Supabase / 파일)
`lib/repo.ts`가 환경변수로 저장소를 고릅니다. 화면·API 코드는 동일하고 `Repo` 인터페이스([lib/types.ts](lib/types.ts))만 맞추면 구현체를 추가할 수 있습니다.

| 환경변수 | 저장소 | 스키마 | 비고 |
|---|---|---|---|
| `TURSO_DATABASE_URL` (+`TURSO_AUTH_TOKEN`) | **Turso** (libSQL/SQLite) | `sqlite/schema.sql` | 원격 전용 클라이언트라 Vercel 서버리스에서 동작 |
| `DATABASE_URL` | **Neon** (PostgreSQL) | `supabase/schema.sql` | |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase (PostgreSQL) | `supabase/schema.sql` | |
| (없음) | 로컬 파일 `.data/db.json` | - | 로컬 데모. 서버리스에서는 쓰기가 유지되지 않음 |

우선순위: `DB_BACKEND`(명시) → Turso → Neon → Supabase → 파일. 여러 DB 환경변수가 함께 있을 때는 `DB_BACKEND=neon` 처럼 강제할 수 있습니다.

DB 모드 모두 같은 규칙을 DB 레벨에서 강제합니다: 부분 유니크 인덱스(중복 예약 방지), 입력 형식 제약(전화번호·이름·날짜·상태), 외래키.

### Turso 연결 순서
1. [turso.tech](https://turso.tech)에서 가입 후 데이터베이스 생성
2. 데이터베이스의 URL(`libsql://...`)과 인증 토큰 발급 (대시보드 또는 Turso CLI)
3. 본인 터미널에서 스키마 적용 (토큰은 현재 셸 환경변수로만 사용되며 파일에 저장되지 않음):
   ```bash
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:init:turso -- --seed
   ```
   `--seed`는 데모 예약 24건 추가(선택). 스키마는 여러 번 실행해도 안전합니다(`if not exists`).
4. `.env.local` 또는 Vercel 환경변수에 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET` 등록

> 인증 토큰은 데이터베이스 접근 권한입니다. 저장소에 커밋하지 마세요.

### Neon 연결 순서
1. neon.tech에서 프로젝트 생성 (또는 Vercel → Storage → Marketplace에서 Neon 추가)
2. SQL Editor에서 `supabase/schema.sql` 실행 → 필요하면 `supabase/seed.sql`로 데모 예약 24건 추가 (표준 PostgreSQL이라 Neon/Supabase 공용)
3. 연결 문자열(Connection string) 복사 → 로컬 `.env.local` 또는 Vercel 환경변수에 `DATABASE_URL`로 등록
4. `AUTH_SECRET`에는 임의의 긴 문자열 설정

> 연결 문자열에는 비밀번호가 들어 있습니다. 저장소에 커밋하거나 `NEXT_PUBLIC_` 접두사를 붙이지 마세요. 무료 플랜은 일정 시간 접속이 없으면 DB가 절전 상태가 되어 첫 요청이 느릴 수 있습니다.

### Supabase 연결 순서 (선택)
`schema.sql` 실행 후 Project Settings → API의 URL과 `service_role` 키를 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`로 등록합니다. `service_role` 키는 서버 전용입니다.

## 데모 모드 안내
- SMS는 발송하지 않고 화면에 인증번호를 표시합니다(`SMS_PROVIDER` 미설정 시). 포트폴리오에는 "데모 모드"라고 밝혀 두는 것을 권장합니다. 실제 발송을 붙이려면 `app/api/sms/send/route.ts`에 발송 API(알리고, NHN Cloud, Twilio 등)를 연결하고 `SMS_PROVIDER`를 설정하세요.
- 인증번호는 평문이 아닌 해시로 저장되며, 서버리스에서도 유지되도록 DB 모드에서는 `sms_otps` 테이블에 보관합니다.
- 관리자 계정은 `lib/auth.ts`에 하드코딩된 데모용입니다. 공개 배포 시 누구나 README의 데모 계정으로 로그인할 수 있으니, 공개 URL에서는 데모 계정임을 안내하거나 비밀번호를 바꾸고 클라이언트에게만 전달하세요. 운영에서는 Supabase Auth + 역할 테이블로 교체합니다.

## 중복 예약 방지
같은 지점·진료과·날짜·시간의 비취소 예약은 1건만 허용합니다.
- Turso/Neon/Supabase: `bookings_no_double_booking` 부분 유니크 인덱스가 최종 보장. 동시 요청 중 늦은 쪽은 unique violation → 409
- 취소된 예약을 되살릴 때 그 시간에 이미 다른 예약이 있으면 409 (관리자 화면에 사유 표시)
- 파일 모드: 저장소 접근을 직렬화(큐)해 막음

## 구조
- `lib/types.ts` 저장소 인터페이스(`Repo`)와 타입
- `lib/repo-turso.ts` / `lib/repo-neon.ts` / `lib/repo-supabase.ts` / `lib/repo-file.ts` 구현체, `lib/repo.ts` 선택기
- `sqlite/` Turso용 스키마·시드, `supabase/` PostgreSQL(Neon·Supabase)용 스키마·시드, `scripts/init-db.mjs` Turso 초기화
- `app/api/*` 예약·인증·관리자 API, `components/*` 고객·관리자 화면
