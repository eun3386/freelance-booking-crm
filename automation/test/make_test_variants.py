#!/usr/bin/env python3
"""스케줄 트리거 워크플로우를 CLI(n8n execute)로 돌릴 수 있게 수동 시작 노드를 붙인 테스트본을 만든다.
  python3 automation/test/make_test_variants.py  ->  automation/n8n/test/*.workflow.json
"""
import json, os

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, '..', 'n8n')
DST = os.path.join(SRC, 'test')
os.makedirs(DST, exist_ok=True)
for fname in ('daily-reminder', 'weekly-report'):
    w = json.load(open(os.path.join(SRC, fname + '.workflow.json')))
    w['id'] += 'T'
    w['name'] = '(테스트) ' + w['name']
    trig = next(n for n in w['nodes'] if n['type'].endswith('scheduleTrigger'))
    nxt = w['connections'][trig['name']]['main'][0][0]['node']
    w['nodes'].append({'id': 'test-start', 'name': '테스트 시작', 'type': 'n8n-nodes-base.executeWorkflowTrigger',
                       'typeVersion': 1.1, 'position': [-220, 200], 'parameters': {'inputSource': 'passthrough'}})
    w['connections']['테스트 시작'] = {'main': [[{'node': nxt, 'type': 'main', 'index': 0}]]}
    json.dump(w, open(os.path.join(DST, fname + '.test.workflow.json'), 'w'), ensure_ascii=False, indent=2)
    print('wrote', fname)

# 오류 알림 경로 시험: 에러 트리거 대신 가짜 오류 데이터를 만들어 '에러 알림' 노드를 실행한다
w = json.load(open(os.path.join(SRC, 'daily-reminder.workflow.json')))
w['id'] = 'crmErrorFlowT'
w['name'] = '(테스트) 오류 알림 경로'
keep = {'에러 알림'}
w['nodes'] = [n for n in w['nodes'] if n['name'] in keep]
w['nodes'] += [
    {'id': 'test-start', 'name': '테스트 시작', 'type': 'n8n-nodes-base.executeWorkflowTrigger', 'typeVersion': 1.1,
     'position': [-440, 340], 'parameters': {'inputSource': 'passthrough'}},
    {'id': 'fake-err', 'name': '가짜 오류 데이터', 'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': [-220, 340],
     'parameters': {'jsCode': "return [{ json: { workflow: { name: '예약 CRM · 전날 리마인드' }, execution: { lastNodeExecuted: '예약 조회', error: { message: '테스트용 가짜 오류' } } } }];"}}]
w['connections'] = {'테스트 시작': {'main': [[{'node': '가짜 오류 데이터', 'type': 'main', 'index': 0}]]},
                    '가짜 오류 데이터': {'main': [[{'node': '에러 알림', 'type': 'main', 'index': 0}]]}}
json.dump(w, open(os.path.join(DST, 'error-flow.test.workflow.json'), 'w'), ensure_ascii=False, indent=2)
print('wrote error-flow')
