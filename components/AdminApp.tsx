'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BRANCHES, DEPARTMENTS, STATUS_LABEL, branchName, deptName, isoDate, type Status } from '@/lib/config'

interface Session { username: string; role: 'admin' | 'manager' | 'staff'; branchId: string | null }
interface Booking { id: string; branchId: string; deptId: string; date: string; time: string; name: string; phone: string; status: Status; memo: string }

const ROLE = { admin: '총괄 관리자', manager: '지점 관리자', staff: '직원(읽기 전용)' }
const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-500',
}

export function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    fetch('/api/admin/login').then((r) => r.json()).then((j) => setSession(j.session))
  }, [])
  if (session === undefined) return null
  if (!session) return <Login onLogin={setSession} />
  return <Dashboard session={session} onLogout={async () => { await fetch('/api/admin/login', { method: 'DELETE' }); setSession(null) }} />
}

function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [username, setU] = useState('')
  const [password, setP] = useState('')
  const [err, setErr] = useState('')
  async function go(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
    const j = await r.json()
    r.ok ? onLogin(j.session) : setErr(j.error)
  }
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <form onSubmit={go} className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">관리자 로그인</h1>
        <input className="input" placeholder="아이디" value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" />
        <input className="input" type="password" placeholder="비밀번호" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn btn-primary w-full">로그인</button>
        <p className="text-xs text-slate-400">데모 사이트입니다. 데모 계정은 README를 참고하세요. 모든 데이터는 가상입니다.</p>
      </form>
    </main>
  )
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [rows, setRows] = useState<Booking[]>([])
  const [branch, setBranch] = useState('')
  const [dept, setDept] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [day, setDay] = useState('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const editable = session.role !== 'staff'

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (branch) p.set('branch', branch)
    if (dept) p.set('dept', dept)
    if (status) p.set('status', status)
    if (q) p.set('q', q)
    return p.toString()
  }, [branch, dept, status, q])

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/bookings?' + params)
    if (r.ok) setRows((await r.json()).bookings)
  }, [params])
  useEffect(() => { load() }, [load])

  async function setBookingStatus(id: string, s: Status) {
    const prev = rows
    setRows(rows.map((b) => (b.id === id ? { ...b, status: s } : b)))
    const r = await fetch('/api/admin/bookings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: s }) })
    if (!r.ok) {
      setRows(prev)
      alert((await r.json().catch(() => null))?.error ?? '변경에 실패했습니다.')
    }
  }

  const shown = day ? rows.filter((b) => b.date === day) : rows
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.filter((b) => b.status !== 'cancelled').forEach((b) => (m[b.date] = (m[b.date] ?? 0) + 1))
    return m
  }, [rows])
  const stat = (s: Status) => rows.filter((b) => b.status === s).length

  const branchOptions = BRANCHES.filter((b) => session.branchId === null || b.id === session.branchId)

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">예약 관리</h1>
          <p className="text-xs text-slate-500">
            {session.username} · {ROLE[session.role]} · {session.branchId ? branchName(session.branchId) : '전체 지점'}
          </p>
        </div>
        <button className="btn btn-ghost py-2" onClick={onLogout}>로그아웃</button>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {(['pending', 'confirmed', 'cancelled'] as Status[]).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? '' : s)}
            className={`rounded-xl bg-white p-3 text-left shadow-sm ${status === s ? 'ring-2 ring-brand' : ''}`}>
            <div className="text-xs text-slate-500">{STATUS_LABEL[s]}</div>
            <div className="text-2xl font-bold">{stat(s)}</div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {session.branchId === null && (
          <select className="input !w-auto" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">전체 지점</option>
            {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select className="input !w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">전체 진료과</option>
          {DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input className="input !w-auto min-w-48 flex-1" placeholder="이름 · 연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {day && <button className="btn btn-ghost py-2" onClick={() => setDay('')}>{day} ✕</button>}
        <div className="ml-auto flex gap-2">
          <button className={`btn py-2 ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('list')}>목록</button>
          <button className={`btn py-2 ${view === 'calendar' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('calendar')}>캘린더</button>
          <a className="btn btn-ghost py-2" href={'/api/admin/export?' + params}>엑셀(CSV)</a>
        </div>
      </div>

      {view === 'calendar' && <Calendar month={month} setMonth={setMonth} counts={counts} day={day} onPick={(d) => { setDay(d === day ? '' : d) }} />}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>{['예약일시', '지점', '진료과', '이름', '연락처', '상태'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-3">{b.date} {b.time}</td>
                <td className="px-4 py-3">{branchName(b.branchId)}</td>
                <td className="px-4 py-3">{deptName(b.deptId)}</td>
                <td className="px-4 py-3">{b.name}</td>
                <td className="px-4 py-3 tabular-nums">{b.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')}</td>
                <td className="px-4 py-3">
                  {editable ? (
                    <select value={b.status} onChange={(e) => setBookingStatus(b.id, e.target.value as Status)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[b.status]}`}>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">예약이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  )
}

function Calendar(p: { month: Date; setMonth: (d: Date) => void; counts: Record<string, number>; day: string; onPick: (d: string) => void }) {
  const y = p.month.getFullYear(), m = p.month.getMonth()
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button className="btn btn-ghost py-1" onClick={() => p.setMonth(new Date(y, m - 1, 1))}>‹</button>
        <b>{y}년 {m + 1}월</b>
        <button className="btn btn-ghost py-1" onClick={() => p.setMonth(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {'일월화수목금토'.split('').map((d) => <div key={d} className="py-1 text-slate-400">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = isoDate(new Date(y, m, d))
          const n = p.counts[key]
          return (
            <button key={i} onClick={() => p.onPick(key)}
              className={`rounded-lg border py-2 ${p.day === key ? 'border-brand bg-brand-light' : 'border-transparent hover:bg-slate-50'}`}>
              <div>{d}</div>
              <div className={`mx-auto mt-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-4 ${n ? 'bg-brand text-white' : ''}`}>{n ?? ''}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
