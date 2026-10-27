-- Neon / Supabase 어느 쪽이든 SQL Editor에서 실행: schema.sql → (선택) seed.sql 순서
-- (표준 PostgreSQL 문법만 사용)
create table branches (id text primary key, name text not null);
create table departments (id text primary key, name text not null);

insert into branches (id, name) values ('gangnam', '강남점'), ('haeundae', '해운대점'), ('daegu', '대구점');
insert into departments (id, name) values ('skin', '피부 클리닉'), ('body', '바디 케어'), ('consult', '상담');

create type booking_status as enum ('pending', 'confirmed', 'cancelled');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references branches(id),
  dept_id text not null references departments(id),
  date date not null,
  time time not null,
  name text not null check (char_length(name) between 2 and 20),
  phone text not null check (phone ~ '^01[016789][0-9]{7,8}$'),
  status booking_status not null default 'pending',
  memo text not null default '' check (char_length(memo) <= 500),
  created_at timestamptz not null default now()
);

-- 중복 예약 방지를 DB 레벨에서 보장.
-- 동시 요청 시 늦은 insert는 unique_violation(23505) → 앱이 409로 응답
create unique index bookings_no_double_booking
  on bookings (branch_id, dept_id, date, time)
  where status <> 'cancelled';

create index bookings_date_idx on bookings (date, time);
create index bookings_branch_idx on bookings (branch_id, date);

-- SMS 인증번호 (평문이 아닌 해시 저장, 서버리스에서도 유지되도록 DB에 보관)
create table sms_otps (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  tries int not null default 0,
  created_at timestamptz not null default now()
);

-- 이 앱은 서버에서만 DB에 접근합니다(Supabase는 service role 키, Neon은 소유자 연결 문자열 — 둘 다 RLS 우회).
-- 아래 RLS는 anon/authenticated 키로 직접 접근하는 경로를 전부 차단하기 위한 설정입니다.
alter table branches enable row level security;
alter table departments enable row level security;
alter table bookings enable row level security;
alter table sms_otps enable row level security;
-- 정책을 만들지 않으면 service role 외에는 접근 불가 (기본 거부)
