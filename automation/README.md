# 예약 CRM × n8n 자동화

예약 CRM(03)과 n8n을 연결한 업무 자동화 3종입니다.

**알림 채널 구분**: 03 앱 자체의 알림(새 예약)은 **디스코드**, n8n 자동화의 알림(발송 요약·실패 경고·리포트·워크플로우 오류)은 **슬랙**입니다. 같은 알림이 두 곳에 가지 않습니다.

| 워크플로우 | 트리거 | 하는 일 |
|---|---|---|
| `booking-created` 예약 접수 확인 문자 | 03 앱이 웹훅 호출 | 비밀값 검증 → 즉시 200 응답 → 예약 조회 → 고객에게 접수 확인 문자. 발송 실패 시(재시도 3회 후) 슬랙 경고 |
| `daily-reminder` 전날 리마인드 | 매일 18:00 | 내일 예약 조회(취소 제외) → 고객에게 문자 발송 → 슬랙에 지점별 발송 요약, 실패는 별도 경고 |
| `weekly-report` 주간 리포트 | 매주 월 09:00 | 지난 7일 집계(건수·취소율·지점·진료과·시간대) → Gemini 코멘트 → 슬랙. AI가 실패해도 숫자 리포트는 발송 |

## 연동 구조
```
고객 예약 → 03 앱 ──→ 디스코드 (새 예약 알림, 앱이 직접)
              └─(웹훅, x-automation-secret)→ n8n ──→ 고객 문자 / 슬랙(요약·경고·리포트·오류)
                                              │
n8n ─(GET /api/automation/bookings, Bearer 토큰)→ 03 앱   (확인 문자·리마인드·리포트용 조회)
```
- 03 쪽 코드: `lib/automation.ts`(이벤트 발송·인증), `app/api/automation/bookings/route.ts`(조회 API)
- 환경변수가 없으면 모두 꺼집니다. 웹훅 전송 실패·지연(3초 제한)은 예약 처리에 영향을 주지 않습니다.
- 개인정보: 웹훅·슬랙·디스코드에는 이름 첫 글자만, 전화번호는 보내지 않습니다. 연락처는 인증된 조회 API → 문자 발송 노드에서만 사용됩니다. 슬랙 경고에도 예약 ID와 지점·시간만 담습니다.

## 설정
03 앱(Vercel 등):
`N8N_WEBHOOK_URL=https://<n8n 주소>/webhook`, `AUTOMATION_SECRET=<임의의 긴 문자열>`

n8n 환경변수(`$env` 접근 허용 필요: `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`):
| 변수 | 설명 |
|---|---|
| `AUTOMATION_SECRET` | 03 앱과 같은 값 |
| `BOOKING_API_URL` | 03 앱 주소 (예: `https://booking-crm-roan.vercel.app`) |
| `SLACK_WEBHOOK_URL` | 슬랙 Incoming Webhook URL (앱 > Incoming Webhooks) |
| `SMS_GATEWAY_URL` | 문자 발송 API. 현재 `{to, text}` JSON 을 POST 하는 형태 — 알리고·NHN Cloud 등은 노드의 본문/인증만 맞추면 됨 |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | 주간 리포트 코멘트용 (선택) |

워크플로우 가져오기: `python3 automation/make_workflows.py` 로 JSON 을 만들고 n8n 에 Import. 웹훅 워크플로우는 **활성화(Publish)** 해야 `/webhook/booking-created` 가 열립니다.
> n8n 표현식 안에서 `}}` 가 붙어 나오면 표현식 끝으로 오인됩니다. 생성 스크립트는 항상 `} }` 로 띄워 씁니다.

## 테스트 (목업, 슬랙·문자 계정 불필요)
`automation/mock/server.py` 가 슬랙 웹훅과 문자 게이트웨이를 대신 받아 `mock/out/received.jsonl` 에 기록합니다. `FAIL_PHONE=<번호>` 로 특정 번호의 발송을 실패시킬 수 있습니다.
스케줄 워크플로우는 `python3 automation/test/make_test_variants.py` 로 수동 시작 노드를 붙인 테스트본을 만들어 `n8n execute --id ...T` 로 실행합니다. 예약 생성은 `automation/test/seed_bookings.py` 로 03 로컬 서버(데모 SMS 모드)에 만듭니다.

검증한 것(n8n 2.45.4, 03 로컬 파일 모드, 슬랙·문자는 목업, 리포트 코멘트는 실제 Gemini):
- 웹훅: 비밀값 없음/틀림 → 401. 03 앱에서 실제 예약을 만들면 디스코드 알림 1건(앱)과 고객 확인 문자 1건(n8n)이 가고 슬랙으로는 가지 않음. 문자 발송을 실패시키면 슬랙 경고 1건
- 오류 알림: 워크플로우 오류 알림 노드가 슬랙으로 전송(가짜 오류 데이터로 시험. 실제 오류 트리거 발동은 미검증)
- 리마인드: 취소 예약 제외, 대상 5건 중 발송 4건 성공 + 의도적 실패 1건(재시도 3회 후) → 성공 요약(지점별)과 실패 경고가 각각 슬랙에 전송
- 리포트: 정상 시 숫자 + AI 코멘트(슬랙 서식), AI 호출 실패 시 숫자만 발송
- 자동화 조회 API: 토큰 없음/틀림 401, 범위 31일 초과 400

검증하지 않은 것: 실제 슬랙·문자 서비스, n8n 의 스케줄 자동 실행(CLI 로 수동 실행만 확인), 배포 환경(n8n 을 온라인에 올리지 않음)에서의 웹훅 호출.
> 테스트 데이터는 로컬 파일 DB 의 가상 예약입니다. 운영 실적이 아닙니다.
