#!/usr/bin/env python3
"""예약 CRM 자동화 테스트용 목업 서버 (표준 라이브러리만 사용). 실제 슬랙·문자 서비스가 아니다.

  POST /slack   슬랙 Incoming Webhook 수신 ({"text": ...})
  POST /sms     문자 게이트웨이 수신 ({"to","text"}); FAIL_PHONE 에 지정한 번호는 500 반환
  POST /discord  디스코드 웹훅 수신 ({"content": ...})
  GET  /received  받은 요청 목록
"""
import json, os, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FAIL_PHONE = os.environ.get('FAIL_PHONE', '')
OUT = os.path.join(os.path.dirname(__file__), 'out', 'received.jsonl')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
lock, seq = threading.Lock(), 0


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        if self.path == '/received':
            return self._send(200, [json.loads(l) for l in open(OUT)] if os.path.exists(OUT) else [])
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        global seq
        body = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))).decode() or '{}')
        if self.path not in ('/slack', '/sms', '/discord'):
            return self._send(404, {'error': 'not found'})
        if self.path == '/sms' and FAIL_PHONE and body.get('to') == FAIL_PHONE:
            return self._send(500, {'error': 'mock: 의도된 실패'})
        with lock:
            seq += 1
            with open(OUT, 'a') as f:
                f.write(json.dumps({'n': seq, 'path': self.path, 'body': body}, ensure_ascii=False) + '\n')
        self._send(200, {'ok': True})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 8100), H).serve_forever()
