-- Turso(libSQL/SQLite)용 스키마. PostgreSQL 버전은 supabase/schema.sql
-- 실행: npm run db:init:turso  (또는 turso db shell <db> < sqlite/schema.sql)
create table if not exists branches (id text primary key, name text not null);
create table if not exists departments (id text primary key, name text not null);

insert or ignore into branches (id, name) values ('gangnam', '강남점'), ('haeundae', '해운대점'), ('daegu', '대구점');
insert or ignore into departments (id, name) values ('skin', '피부 클리닉'), ('body', '바디 케어'), ('consult', '상담');

-- SQLite에는 enum/date/time 타입이 없어 text + CHECK 제약으로 같은 검증을 DB에서 강제
create table if not exists bookings (
  id text primary key,
  branch_id text not null references branches(id),
  dept_id text not null references departments(id),
  date text not null check (date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  time text not null check (time glob '[0-2][0-9]:[0-5][0-9]'),
  name text not null check (length(name) between 2 and 20),
  phone text not null check (length(phone) between 10 and 11 and phone glob '01[016789]*' and phone not glob '*[^0-9]*'),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  memo text not null default '' check (length(memo) <= 500),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 중복 예약 방지를 DB 레벨에서 보장 (PostgreSQL 버전과 동일한 부분 유니크 인덱스)
create unique index if not exists bookings_no_double_booking
  on bookings (branch_id, dept_id, date, time)
  where status <> 'cancelled';

create index if not exists bookings_date_idx on bookings (date, time);
create index if not exists bookings_branch_idx on bookings (branch_id, date);

-- SMS 인증번호 (해시 저장). 시각은 epoch 밀리초
create table if not exists sms_otps (
  phone text primary key,
  code_hash text not null,
  expires_at integer not null,
  tries integer not null default 0,
  created_at integer not null
);
