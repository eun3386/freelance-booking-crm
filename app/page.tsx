import Link from 'next/link'
import { BookingForm } from '@/components/BookingForm'

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">온라인 예약</h1>
        <Link href="/admin" className="text-xs text-slate-500 underline">관리자</Link>
      </header>
      <BookingForm />
    </main>
  )
}
