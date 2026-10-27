import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '지점 예약 · 어드민 CRM',
  description: '멀티 지점 예약 스케줄러와 관리자 백오피스 포트폴리오',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
