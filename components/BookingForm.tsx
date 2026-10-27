'use client'
import { useEffect, useMemo, useState } from 'react'
import { BRANCHES, DEPARTMENTS, branchName, deptName, isoDate } from '@/lib/config'

type Slot = { time: string; available: boolean }

export function BookingForm() {
  const [branchId, setBranch] = useState('')
  const [deptId, setDept] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [devCode, setDevCode] = useState<string>()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [done, setDone] = useState<{ date: string; time: string } | null>(null)

  const dates = useMemo(() => {
    const out: { v: string; label: string; off: boolean }[] = []
    const d = new Date()
    for (let i = 0; i < 14; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
      out.push({ v: isoDate(x), label: `${x.getMonth() + 1}/${x.getDate()} (${'일월화수목금토'[x.getDay()]})`, off: x.getDay() === 0 })
    }
    return out
  }, [])

  useEffect(() => {
    setSlots(null)
    setTime('')
    if (!branchId || !deptId || !date) return
    fetch(`/api/slots?branch=${branchId}&dept=${deptId}&date=${date}`)
      .then((r) => r.json())
      .then((j) => setSlots(j.times))
  }, [branchId, deptId, date, refresh])

  async function post(url: string, body: object) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) {
        setError(j.error ?? '오류가 발생했습니다.')
        return { ok: false as const, status: r.status, j }
      }
      return { ok: true as const, status: r.status, j }
    } finally {
      setBusy(false)
    }
  }

  async function sendCode() {
    const r = await post('/api/sms/send', { phone })
    if (r.ok) {
      setCodeSent(true)
      setDevCode(r.j.devCode)
    }
  }
  async function verifyCode() {
    const r = await post('/api/sms/verify', { phone, code })
    if (r.ok) setToken(r.j.token)
  }
  async function submit() {
    const r = await post('/api/bookings', { branchId, deptId, date, time, name, phone, token })
    if (r.ok) setDone({ date, time })
    else if (r.status === 409) setRefresh((n) => n + 1) // 다른 고객이 먼저 예약 → 슬롯 목록 갱신
  }

  if (done)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-4xl">✅</div>
        <h2 className="mt-3 text-lg font-bold">예약 접수 완료</h2>
        <p className="mt-2 text-sm text-slate-600">
          {branchName(branchId)} · {deptName(deptId)}
          <br />
          {done.date} {done.time}
        </p>
        <p className="mt-3 text-xs text-slate-500">담당자 확인 후 확정 안내를 드립니다.</p>
        <button className="btn btn-ghost mt-6" onClick={() => location.reload()}>새 예약</button>
      </div>
    )

  const ready = branchId && deptId && date && time && name.trim().length >= 2 && token

  return (
    <div className="space-y-6 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <Step n={1} title="지점 선택">
        <Chips items={BRANCHES.map((b) => ({ v: b.id, l: b.name }))} value={branchId} onPick={setBranch} />
      </Step>
      <Step n={2} title="진료과 선택">
        <Chips items={DEPARTMENTS.map((d) => ({ v: d.id, l: d.name }))} value={deptId} onPick={setDept} />
      </Step>
      <Step n={3} title="날짜 선택">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {dates.map((d) => (
            <button key={d.v} disabled={d.off} onClick={() => setDate(d.v)}
              className={`btn shrink-0 border ${date === d.v ? 'border-brand bg-brand-light text-brand' : 'border-slate-300 bg-white'} ${d.off ? 'line-through' : ''}`}>
              {d.label}
            </button>
          ))}
        </div>
      </Step>
      <Step n={4} title="시간 선택">
        {!(branchId && deptId && date) ? (
          <p className="text-sm text-slate-400">지점, 진료과, 날짜를 먼저 선택하세요.</p>
        ) : !slots ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button key={s.time} disabled={!s.available} onClick={() => setTime(s.time)}
                className={`rounded-lg border py-2 text-sm ${time === s.time ? 'border-brand bg-brand text-white' : 'border-slate-300'} disabled:bg-slate-100 disabled:text-slate-300 disabled:line-through`}>
                {s.time}
              </button>
            ))}
          </div>
        )}
      </Step>
      <Step n={5} title="예약자 정보 · 휴대폰 인증">
        <div className="space-y-2">
          <input className="input" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <input className="input" inputMode="numeric" placeholder="휴대폰 번호 (숫자만)" value={phone} disabled={!!token}
              onChange={(e) => setPhone(e.target.value)} />
            <button className="btn btn-ghost shrink-0" disabled={busy || !!token} onClick={sendCode}>{codeSent ? '재전송' : '인증요청'}</button>
          </div>
          {codeSent && !token && (
            <div className="flex gap-2">
              <input className="input" inputMode="numeric" placeholder="인증번호 6자리" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn btn-primary shrink-0" disabled={busy} onClick={verifyCode}>확인</button>
            </div>
          )}
          {devCode && !token && <p className="text-xs text-amber-600">데모 모드: 인증번호 {devCode} (운영에서는 SMS로 발송)</p>}
          {token && <p className="text-sm font-medium text-brand">✓ 인증되었습니다</p>}
        </div>
      </Step>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error}</p>}
      <button className="btn btn-primary w-full py-4" disabled={!ready || busy} onClick={submit}>예약하기</button>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-xs text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Chips({ items, value, onPick }: { items: { v: string; l: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button key={i.v} onClick={() => onPick(i.v)}
          className={`btn border ${value === i.v ? 'border-brand bg-brand-light text-brand' : 'border-slate-300 bg-white'}`}>
          {i.l}
        </button>
      ))}
    </div>
  )
}
