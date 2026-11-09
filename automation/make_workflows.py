#!/usr/bin/env python3
"""예약 CRM 연동 n8n 워크플로우 3개를 생성한다.

  python3 automation/make_workflows.py   ->  automation/n8n/*.workflow.json

주의: n8n 표현식 안에서 `}}` 가 붙어 나오면 표현식 끝으로 오인된다. 항상 `} }` 처럼 띄운다.
외부 주소는 전부 환경변수($env)로 받는다: SLACK_WEBHOOK_URL, BOOKING_API_URL, AUTOMATION_SECRET,
SMS_GATEWAY_URL, GEMINI_API_KEY(선택), GEMINI_MODEL(선택)
"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), 'n8n')
os.makedirs(OUT, exist_ok=True)


class WF:
    def __init__(self, name, wid):
        self.name, self.wid, self.nodes, self.conns, self._n = name, wid, [], {}, 0

    def add(self, name, type_, ver, params, x, y, **extra):
        self._n += 1
        n = {'id': f'n{self._n}', 'name': name, 'type': type_, 'typeVersion': ver, 'position': [x, y], 'parameters': params}
        n.update(extra)
        self.nodes.append(n)
        return name

    def link(self, a, b, out=0):
        outs = self.conns.setdefault(a, {'main': []})['main']
        while len(outs) <= out:
            outs.append([])
        outs[out].append({'node': b, 'type': 'main', 'index': 0})

    def save(self, fname):
        w = {'id': self.wid, 'name': self.name, 'nodes': self.nodes, 'connections': self.conns, 'active': False,
             'settings': {'executionOrder': 'v1', 'timezone': 'Asia/Seoul'}}
        json.dump(w, open(os.path.join(OUT, fname), 'w'), ensure_ascii=False, indent=2)
        print('wrote', fname, len(self.nodes), 'nodes')


RETRY = {'retryOnFail': True, 'maxTries': 3, 'waitBetweenTries': 2000}


def slack(w, name, text_expr, x, y):
    """슬랙 Incoming Webhook 으로 전송. text_expr 는 JS 표현식(문자열을 돌려줘야 함)."""
    return w.add(name, 'n8n-nodes-base.httpRequest', 4.2, {
        'method': 'POST', 'url': '={{ $env.SLACK_WEBHOOK_URL }}', 'sendBody': True, 'specifyBody': 'json',
        'jsonBody': '={{ JSON.stringify({ text: ' + text_expr + ' }) }}', 'options': {'timeout': 15000}},
        x, y, onError='continueRegularOutput', **RETRY)


def error_flow(w, y):
    """워크플로우 자체가 실패하면 슬랙으로 알린다 (n8n 자동화의 알림은 모두 슬랙)."""
    t = w.add('에러 트리거', 'n8n-nodes-base.errorTrigger', 1, {}, 0, y)
    a = slack(w, '에러 알림',
              "'🚨 워크플로우 실패: ' + $json.workflow.name + ' / 노드: ' + $json.execution.lastNodeExecuted + ' / ' + $json.execution.error.message",
              260, y)
    w.link(t, a)


API_GET = lambda qs: {
    'method': 'GET', 'url': "={{ $env.BOOKING_API_URL + '/api/automation/bookings' }}",
    'sendQuery': True, 'queryParameters': {'parameters': qs},
    'sendHeaders': True, 'headerParameters': {'parameters': [{'name': 'Authorization', 'value': "={{ 'Bearer ' + $env.AUTOMATION_SECRET }}"}]},
    'options': {'timeout': 20000}}

# ───────────────────────── 1) 예약 접수 확인 문자 ─────────────────────────
# (새 예약 팀 알림은 03 앱이 디스코드로 직접 보낸다. n8n 은 고객 대상 문자 자동화를 맡는다.)
w1 = WF('예약 CRM · 예약 접수 확인 문자 (웹훅 → 고객 문자)', 'crmBookingCreated')
wh = w1.add('예약 생성 웹훅', 'n8n-nodes-base.webhook', 2,
            {'httpMethod': 'POST', 'path': 'booking-created', 'responseMode': 'responseNode', 'options': {}}, 0, 0,
            webhookId='booking-created-hook')
chk = w1.add('비밀값 확인', 'n8n-nodes-base.if', 2.2, {'conditions': {
    'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict'},
    'conditions': [
        {'id': 'c1', 'leftValue': "={{ $json.headers['x-automation-secret'] }}", 'rightValue': '={{ $env.AUTOMATION_SECRET }}',
         'operator': {'type': 'string', 'operation': 'equals'}},
        {'id': 'c2', 'leftValue': '={{ $env.AUTOMATION_SECRET }}', 'rightValue': '',
         'operator': {'type': 'string', 'operation': 'notEmpty', 'singleValue': True}}],
    'combinator': 'and'}}, 240, 0)
ok = w1.add('응답 200', 'n8n-nodes-base.respondToWebhook', 1.1,
            {'respondWith': 'json', 'responseBody': '={{ JSON.stringify({ ok: true }) }}', 'options': {}}, 480, -80)
no = w1.add('응답 401', 'n8n-nodes-base.respondToWebhook', 1.1,
            {'respondWith': 'json', 'responseBody': '={{ JSON.stringify({ error: "unauthorized" }) }}', 'options': {'responseCode': 401}}, 480, 100)
g1 = w1.add('예약 조회', 'n8n-nodes-base.httpRequest', 4.2, API_GET([
    {'name': 'from', 'value': "={{ $('예약 생성 웹훅').first().json.body.date }}"},
    {'name': 'to', 'value': "={{ $('예약 생성 웹훅').first().json.body.date }}"}]), 720, -80, **RETRY)
f1 = w1.add('예약 찾기', 'n8n-nodes-base.code', 2, {'jsCode':
    "// 웹훅에는 전화번호가 없으므로(개인정보 최소화) 인증된 API 로 예약을 다시 조회해 연락처를 얻는다\n"
    "const id = $('예약 생성 웹훅').first().json.body.id;\n"
    "const b = ($input.first().json.bookings || []).find(x => x.id === id);\n"
    "if (!b || b.status === 'cancelled') return [];\n"
    "return [{ json: { id: b.id, to: b.phone, branchName: b.branchName, date: b.date, time: b.time,\n"
    "  text: '[' + b.branchName + '] ' + b.name + '님, ' + b.date + ' ' + b.time + ' ' + b.deptName + ' 예약이 접수되었습니다.' } }];"}, 940, -80)
sm = w1.add('확인 문자 발송', 'n8n-nodes-base.httpRequest', 4.2, {
    'method': 'POST', 'url': '={{ $env.SMS_GATEWAY_URL }}', 'sendBody': True, 'specifyBody': 'json',
    'jsonBody': '={{ JSON.stringify({ to: $json.to, text: $json.text }) }}', 'options': {'timeout': 15000}},
    1160, -80, onError='continueErrorOutput', **RETRY)
bad1 = slack(w1, '슬랙 문자 실패 경고',
             "'⚠️ 예약 접수 확인 문자 발송 실패 (재시도 3회 후) · ' + $('예약 찾기').item.json.branchName + ' · ' + $('예약 찾기').item.json.date + ' ' + $('예약 찾기').item.json.time + ' · 예약ID ' + $('예약 찾기').item.json.id",
             1380, 20)
w1.link(wh, chk); w1.link(chk, ok, 0); w1.link(chk, no, 1)
w1.link(ok, g1); w1.link(g1, f1); w1.link(f1, sm); w1.link(sm, bad1, 1)
error_flow(w1, 260)
w1.save('booking-created.workflow.json')

# ───────────────────────── 2) 내일 예약 리마인드 ─────────────────────────
w2 = WF('예약 CRM · 전날 리마인드 (매일 18시)', 'crmDailyReminder')
t = w2.add('매일 18시', 'n8n-nodes-base.scheduleTrigger', 1.2,
           {'rule': {'interval': [{'field': 'cronExpression', 'expression': '0 18 * * *'}]}}, 0, 0)
d = w2.add('내일 날짜 계산', 'n8n-nodes-base.code', 2, {'jsCode':
    "// 한국 시간 기준 내일 (서버 시간대와 무관하게 계산)\n"
    "const kst = new Date(Date.now() + 9 * 3600 * 1000 + 24 * 3600 * 1000);\n"
    "return [{ json: { date: kst.toISOString().slice(0, 10) } }];"}, 220, 0)
g = w2.add('예약 조회', 'n8n-nodes-base.httpRequest', 4.2, API_GET([
    {'name': 'from', 'value': '={{ $json.date }}'}, {'name': 'to', 'value': '={{ $json.date }}'}]), 440, 0, **RETRY)
p = w2.add('리마인드 대상 정리', 'n8n-nodes-base.code', 2, {'jsCode':
    "// 취소된 예약은 제외하고 문자 내용을 만든다 (0건이면 이후 노드는 실행되지 않는다)\n"
    "const rows = $input.first().json.bookings || [];\n"
    "return rows.filter(b => b.status !== 'cancelled').map(b => ({ json: {\n"
    "  id: b.id, to: b.phone, branchName: b.branchName,\n"
    "  text: '[' + b.branchName + '] ' + b.name + '님, 내일 ' + b.time + ' ' + b.deptName + ' 예약이 있습니다. 변경·취소는 지점으로 연락 주세요.'\n"
    "} }));"}, 660, 0)
s = w2.add('문자 발송', 'n8n-nodes-base.httpRequest', 4.2, {
    'method': 'POST', 'url': '={{ $env.SMS_GATEWAY_URL }}', 'sendBody': True, 'specifyBody': 'json',
    'jsonBody': '={{ JSON.stringify({ to: $json.to, text: $json.text }) }}', 'options': {'timeout': 15000}},
    880, 0, onError='continueErrorOutput', **RETRY)
ok2 = w2.add('발송 집계', 'n8n-nodes-base.code', 2, {'jsCode':
    "// 발송에 성공한 항목만 지점별로 센다 (개인정보는 요약에 넣지 않는다)\n"
    "const by = {};\n"
    "$input.all().forEach((_, i) => { const k = $('리마인드 대상 정리').itemMatching(i).json.branchName; by[k] = (by[k] || 0) + 1; });\n"
    "const parts = Object.entries(by).map(([k, v]) => k + ' ' + v);\n"
    "return [{ json: { date: $('내일 날짜 계산').first().json.date, total: $input.all().length, detail: parts.join(', ') } }];"}, 1100, -80)
sl_ok = slack(w2, '슬랙 발송 요약', "'📨 내일(' + $json.date + ') 예약 ' + $json.total + '건 리마인드 문자 발송 완료 (' + $json.detail + ')'", 1320, -80)
bad = w2.add('발송 실패 집계', 'n8n-nodes-base.code', 2, {'jsCode':
    "const by = {};\n"
    "$input.all().forEach((_, i) => { const k = $('리마인드 대상 정리').itemMatching(i).json.branchName; by[k] = (by[k] || 0) + 1; });\n"
    "const parts = Object.entries(by).map(([k, v]) => k + ' ' + v);\n"
    "return [{ json: { date: $('내일 날짜 계산').first().json.date, failed: $input.all().length, total: $('리마인드 대상 정리').all().length, detail: parts.join(', ') } }];"}, 1100, 120)
sl_bad = slack(w2, '슬랙 발송 실패 경고', "'⚠️ 내일(' + $json.date + ') 리마인드 문자 ' + $json.failed + '건 발송 실패 (' + $json.detail + ' / 전체 ' + $json.total + '건, 재시도 3회 후). 수동 확인 필요'", 1320, 120)
w2.link(t, d); w2.link(d, g); w2.link(g, p); w2.link(p, s)
w2.link(s, ok2, 0); w2.link(ok2, sl_ok); w2.link(s, bad, 1); w2.link(bad, sl_bad)
error_flow(w2, 340)
w2.save('daily-reminder.workflow.json')

# ───────────────────────── 3) 주간 운영 리포트 ─────────────────────────
w3 = WF('예약 CRM · 주간 운영 리포트 (매주 월 09시)', 'crmWeeklyReport')
t = w3.add('매주 월요일 09시', 'n8n-nodes-base.scheduleTrigger', 1.2,
           {'rule': {'interval': [{'field': 'cronExpression', 'expression': '0 9 * * 1'}]}}, 0, 0)
r = w3.add('지난 7일 범위', 'n8n-nodes-base.code', 2, {'jsCode':
    "// 한국 시간 기준 지난 7일 (오늘 제외, 어제까지)\n"
    "const day = n => new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);\n"
    "return [{ json: { from: day(7), to: day(1) } }];"}, 220, 0)
g = w3.add('예약 조회', 'n8n-nodes-base.httpRequest', 4.2, API_GET([
    {'name': 'from', 'value': '={{ $json.from }}'}, {'name': 'to', 'value': '={{ $json.to }}'}]), 440, 0, **RETRY)
a = w3.add('집계', 'n8n-nodes-base.code', 2, {'jsCode':
    "const rows = $input.first().json.bookings || [];\n"
    "const range = $('지난 7일 범위').first().json;\n"
    "const count = (key) => rows.reduce((m, b) => { const k = key(b); m[k] = (m[k] || 0) + 1; return m; }, {});\n"
    "const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);\n"
    "const cancelled = rows.filter(b => b.status === 'cancelled').length;\n"
    "const total = rows.length;\n"
    "const rate = total ? Math.round(cancelled / total * 1000) / 10 : 0;\n"
    "const byBranch = count(b => b.branchName);\n"
    "const byDept = count(b => b.deptName);\n"
    "const byTime = count(b => b.time);\n"
    "const lines = [\n"
    "  '기간: ' + range.from + ' ~ ' + range.to,\n"
    "  '전체 예약 ' + total + '건 (확정 ' + rows.filter(b => b.status === 'confirmed').length + ', 대기 ' + rows.filter(b => b.status === 'pending').length + ', 취소 ' + cancelled + ')',\n"
    "  '취소율 ' + rate + '%',\n"
    "  '지점별: ' + (top(byBranch, 5).map(([k, v]) => k + ' ' + v).join(', ') || '없음'),\n"
    "  '진료과별: ' + (top(byDept, 5).map(([k, v]) => k + ' ' + v).join(', ') || '없음'),\n"
    "  '인기 시간대: ' + (top(byTime, 3).map(([k, v]) => k + '(' + v + ')').join(', ') || '없음'),\n"
    "];\n"
    "return [{ json: { total, cancelled, rate, facts: lines.join('\\n') } }];"}, 660, 0)
ai = w3.add('AI 코멘트', 'n8n-nodes-base.httpRequest', 4.2, {
    'method': 'POST',
    'url': "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + ($env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent' }}",
    'sendHeaders': True, 'headerParameters': {'parameters': [
        {'name': 'x-goog-api-key', 'value': '={{ $env.GEMINI_API_KEY }}'}, {'name': 'content-type', 'value': 'application/json'}]},
    'sendBody': True, 'specifyBody': 'json',
    'jsonBody': "={{ JSON.stringify({ contents: [{ parts: [{ text: '아래는 병원 예약 시스템의 지난주 집계다. 숫자에 있는 사실만 근거로 3문장 이내의 한국어 운영 코멘트와 개선 제안 1개를 써줘. 숫자에 없는 내용은 추측하지 마.\\n\\n' + $json.facts }] }], generationConfig: { maxOutputTokens: 4096 } }) }}",
    'options': {'timeout': 60000}}, 880, 0, onError='continueRegularOutput', **RETRY)
m = w3.add('리포트 조립', 'n8n-nodes-base.code', 2, {'jsCode':
    "// AI 호출이 실패해도 숫자 리포트는 반드시 나간다\n"
    "const facts = $('집계').first().json.facts;\n"
    "const cand = $input.first().json.candidates?.[0];\n"
    "// 슬랙은 **굵게** 문법을 쓰지 않으므로 *굵게* 로 바꾸고, 출력 한도로 잘린 답변은 버린다\n"
    "const ai = cand?.finishReason === 'STOP' ? (cand.content?.parts?.[0]?.text || '').replace(/\\*\\*(.+?)\\*\\*/g, '*$1*').trim() : '';\n"
    "const text = '📊 주간 예약 리포트\\n' + facts + '\\n\\n' + (ai ? '💬 AI 코멘트\\n' + ai : '(AI 코멘트를 불러오지 못해 숫자만 전달합니다)');\n"
    "return [{ json: { text } }];"}, 1100, 0)
sl = slack(w3, '슬랙 리포트 발송', '$json.text', 1320, 0)
w3.link(t, r); w3.link(r, g); w3.link(g, a); w3.link(a, ai); w3.link(ai, m); w3.link(m, sl)
error_flow(w3, 260)
w3.save('weekly-report.workflow.json')
