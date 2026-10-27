-- 데모용 예약 데이터 (선택). 오늘 기준 -2일 ~ +6일에 24건 생성
insert into bookings (branch_id, dept_id, date, time, name, phone, status)
select
  (array['gangnam','haeundae','daegu'])[1 + (i % 3)],
  (array['skin','body','consult'])[1 + ((i + 1) % 3)],
  current_date + ((i % 9) - 2),
  (array['10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'])[1 + ((i * 3) % 14)]::time,
  (array['김서연','이도윤','박지우','최하준','정수아','한민재','오지안','윤서진'])[1 + (i % 8)],
  '0101234' || (1000 + i)::text,
  (array['confirmed','pending','confirmed','cancelled'])[1 + (i % 4)]::booking_status
from generate_series(0, 23) as i
on conflict do nothing;
