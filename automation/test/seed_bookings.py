#!/usr/bin/env python3
"""로컬 03 앱(데모 SMS 모드)에 테스트 예약을 API로 만든다.
  python3 automation/test/seed_bookings.py http://localhost:3300 날짜,지점,진료과,시간,전화 ... (예: 2026-10-30,gangnam,skin,10:00,01090001111)
인증번호는 데모 모드가 응답에 주는 devCode 로 처리한다.
"""
import json, sys, urllib.request


def post(base, path, body):
    req = urllib.request.Request(base + path, json.dumps(body).encode(), {'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


base = sys.argv[1]
for spec in sys.argv[2:]:
    date, branch, dept, time, phone = spec.split(',')
    s, r = post(base, '/api/sms/send', {'phone': phone})
    s, r = post(base, '/api/sms/verify', {'phone': phone, 'code': r.get('devCode')})
    s, r = post(base, '/api/bookings', {'branchId': branch, 'deptId': dept, 'date': date, 'time': time, 'name': '테스터' + phone[-2:],
                                         'phone': phone, 'token': r.get('token')})
    print(spec, '->', s, r.get('booking', {}).get('id') or r.get('error'))
